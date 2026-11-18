import { toCalendarDate } from '../shared/transform'
/**
 * MineralTree TotalAP accounting adapter.
 *
 * MineralTree is an AP-automation and B2B payments platform. It does NOT have
 * accounts-receivable (invoices), journals, tax rates, expenses, or sales orders.
 * Resources it supports:
 *   • Bills         — AP invoices from vendors
 *   • Contacts      — vendors only (AP)
 *   • Accounts      — GL chart of accounts
 *   • Transactions  — AP payment disbursements
 *   • CreditMemos   — vendor credits
 *   • PurchaseOrders
 *   • Organization  — company info from user/current
 *
 * Auth: session-token flow. `credentials.accessToken` = session token sent as
 * `If-Match` on every request. `credentials.extra.companyId` = MT company ID.
 * `credentials.extra.baseUrl` = customer-specific base URL (optional).
 *
 * Credential form: three fields (username, password, companyId); optionally
 * a baseUrl for self-hosted deployments.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: invoice    — MineralTree is AP-only; no AR invoicing concept or endpoint exists in the API (confirmed: Core MineralTree API User Guide v5.28)
// Unavailable: journal    — No journal entry endpoint; MT writes directly to the connected ERP's GL, no native journal API
// Unavailable: expense    — No employee expense concept or endpoint; MT handles vendor AP only
// Unavailable: order      — No generic order concept or endpoint in the MT API
// Unavailable: salesorder — MT is AP-only; no sales order concept or endpoint exists
// Unavailable: taxrate    — No tax rate endpoint; tax handling is delegated to the connected ERP

import { customForm } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Transaction } from '../../schema/transaction'
import type { CreditMemo } from '../../schema/creditmemo'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Organization } from '../../schema/organization'

import { getAuthUrl, exchangeCode, refreshCredentials as refreshCreds, loginWithCredentials } from './auth'
import { MineralTreeClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MINERALTREE_API_BASE_DEFAULT } from './constants'
import { toMajorUnits } from './transform/money'

import { transformBill, type MtBill } from './transform/bill'
import { transformVendor, type MtVendor } from './transform/contact'
import { transformAccount, type MtGlAccount } from './transform/account'
import { transformTransaction, type MtPayment } from './transform/transaction'
import { transformCreditMemo, type MtCredit } from './transform/creditmemo'
import { transformPurchaseOrder, type MtPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type MtCompany } from './transform/organization'

// ── Credential form ───────────────────────────────────────────────────────────

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'username',
      label: 'API username',
      type: 'text',
      required: true,
      helpText: 'The username of the designated MineralTree API user.',
    },
    {
      name: 'password',
      label: 'API password',
      type: 'password',
      required: true,
    },
    {
      name: 'companyId',
      label: 'Company ID',
      type: 'text',
      required: true,
      helpText: 'Your MineralTree company identifier (visible in TotalAP settings).',
    },
    {
      name: 'baseUrl',
      label: 'Base URL (optional)',
      type: 'url',
      required: false,
      placeholder: MINERALTREE_API_BASE_DEFAULT,
      helpText: 'Override only for self-hosted deployments. Leave blank for SaaS.',
    },
  ],
  async exchange(fields) {
    const username = (fields['username'] ?? '').trim()
    const password = fields['password'] ?? ''
    const companyId = (fields['companyId'] ?? '').trim()
    const baseUrl = (fields['baseUrl'] ?? '').trim() || MINERALTREE_API_BASE_DEFAULT
    if (!username || !password || !companyId) {
      throw new Error('Username, password, and company ID are required.')
    }
    return loginWithCredentials(username, password, companyId, baseUrl)
  },
})

// ── Adapter ───────────────────────────────────────────────────────────────────

export class MineraltreeAdapter implements AccountingAdapter {
  readonly platform = 'mineraltree'
  readonly version = '0.1.0'

  // Connect Link: present the credential form instead of an OAuth redirect
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  // OAuth stubs — MineralTree uses session-token auth, not OAuth
  getAuthUrl(_state: string): string {
    return getAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCreds(credentials)
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private searchBody(
    view: string,
    params: QueryParams,
    extraQuery?: string,
  ): { view: string; query: string; page: number; count: number } {
    const parts: string[] = []
    if (params.updatedAfter) {
      parts.push(`${view}_updatedAt>="${params.updatedAfter.toISOString()}"`)
    }
    if (extraQuery) parts.push(extraQuery)
    return {
      view,
      query: parts.join(';'),
      page: params.page ?? 0,
      count: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  // ── Organization ─────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new MineralTreeClient(credentials)
    const res = await client.get<{ company?: MtCompany } | MtCompany>('user/current')
    const raw = (res as { company?: MtCompany }).company ?? (res as MtCompany)
    return transformOrganization(raw)
  }

  // ── Bills ────────────────────────────────────────────────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new MineralTreeClient(credentials)
    const body = this.searchBody('bill', params)
    const items = await client.search<MtBill>('bill', body.query, body.page, body.count)
    return items.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new MineralTreeClient(credentials)
    const raw = await client.get<MtBill>(`bill/${id}`)
    return transformBill(raw)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new MineralTreeClient(credentials)
    // Canonical amounts are integer minor units; MineralTree expects decimal major units
    const apiAmount = toMajorUnits(data.totalAmount ?? undefined)
    const body: Partial<MtBill> = {
      externalId: data.billNumber,
      invoiceNumber: data.billNumber,
      vendor: data.contactId ? { id: data.contactId } : undefined,
      amount: apiAmount !== undefined
        ? { amount: apiAmount, currency: data.currency }
        : undefined,
      dueDate: toCalendarDate(data.dueAt),
      transactionDate: toCalendarDate(data.postedAt),
      memo: data.notes,
    }
    const raw = await client.post<MtBill>(`bill/${client.companyId}`, body)
    return transformBill(raw)
  }

  async updateBill(credentials: Credentials, id: string, data: Partial<Bill>): Promise<Bill> {
    const client = new MineralTreeClient(credentials)
    // Canonical amounts are integer minor units; MineralTree expects decimal major units
    const apiAmount = toMajorUnits(data.totalAmount ?? undefined)
    const body: Partial<MtBill> = {
      id,
      invoiceNumber: data.billNumber,
      vendor: data.contactId ? { id: data.contactId } : undefined,
      amount: apiAmount !== undefined
        ? { amount: apiAmount, currency: data.currency }
        : undefined,
      dueDate: toCalendarDate(data.dueAt),
      transactionDate: toCalendarDate(data.postedAt),
      memo: data.notes,
    }
    const raw = await client.put<MtBill>('bill', body)
    return transformBill(raw)
  }

  // ── Contacts (vendors only in MT) ─────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new MineralTreeClient(credentials)
    const body = this.searchBody('vendor', params)
    const items = await client.search<MtVendor>('vendor', body.query, body.page, body.count)
    return items.map(transformVendor)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new MineralTreeClient(credentials)
    const raw = await client.get<MtVendor>(`vendor/${id}`)
    return transformVendor(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new MineralTreeClient(credentials)
    const body: Partial<MtVendor> = {
      name: data.name,
      taxId: data.taxNumber ?? undefined,
      active: data.isActive,
      remittanceEmails: data.emails?.map((e) => e.email),
    }
    const raw = await client.post<MtVendor>(`vendor/${client.companyId}`, body)
    return transformVendor(raw)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const client = new MineralTreeClient(credentials)
    const body: Partial<MtVendor> = {
      id,
      name: data.name,
      taxId: data.taxNumber ?? undefined,
      active: data.isActive,
      remittanceEmails: data.emails?.map((e) => e.email),
    }
    const raw = await client.put<MtVendor>('vendor', body)
    return transformVendor(raw)
  }

  // ── Accounts (GL chart of accounts) ──────────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new MineralTreeClient(credentials)
    const body = this.searchBody('glaccount', params)
    const items = await client.search<MtGlAccount>('glaccount', body.query, body.page, body.count)
    return items.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new MineralTreeClient(credentials)
    const raw = await client.get<MtGlAccount>(`glaccount/${id}`)
    return transformAccount(raw)
  }

  // ── Transactions (AP payments) ────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new MineralTreeClient(credentials)
    const body = this.searchBody('payment', params)
    const items = await client.search<MtPayment>('payment', body.query, body.page, body.count)
    return items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new MineralTreeClient(credentials)
    const raw = await client.get<MtPayment>(`payment/${id}`)
    return transformTransaction(raw)
  }

  // ── Credit Memos (vendor credits) ────────────────────────────────────────

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new MineralTreeClient(credentials)
    const body = this.searchBody('credit', params)
    const items = await client.search<MtCredit>('credit', body.query, body.page, body.count)
    return items.map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new MineralTreeClient(credentials)
    const raw = await client.get<MtCredit>(`credit/${id}`)
    return transformCreditMemo(raw)
  }

  async createCreditMemo(credentials: Credentials, data: Partial<CreditMemo>): Promise<CreditMemo> {
    const client = new MineralTreeClient(credentials)
    // Canonical amounts are integer minor units; MineralTree expects decimal major units
    const apiAmount = toMajorUnits(data.totalAmount ?? undefined)
    const body: Partial<MtCredit> = {
      creditNumber: data.creditmemoNumber,
      vendor: data.contactId ? { id: data.contactId } : undefined,
      amount: apiAmount !== undefined
        ? { amount: apiAmount, currency: data.currency }
        : undefined,
      transactionDate: toCalendarDate(data.postedAt),
      memo: data.notes,
    }
    const raw = await client.post<MtCredit>(`credit/${client.companyId}`, body)
    return transformCreditMemo(raw)
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new MineralTreeClient(credentials)
    const body = this.searchBody('purchaseOrder', params)
    const items = await client.search<MtPurchaseOrder>('purchaseOrder', body.query, body.page, body.count)
    return items.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new MineralTreeClient(credentials)
    const raw = await client.get<MtPurchaseOrder>(`purchaseorder/${id}`)
    return transformPurchaseOrder(raw)
  }

  async createPurchaseOrder(credentials: Credentials, data: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
    const client = new MineralTreeClient(credentials)
    // Canonical amounts are integer minor units; MineralTree expects decimal major units
    const apiAmount = toMajorUnits(data.totalAmount ?? undefined)
    const body: Partial<MtPurchaseOrder> = {
      vendor: data.contactId ? { id: data.contactId } : undefined,
      amount: apiAmount !== undefined
        ? { amount: apiAmount, currency: data.currency }
        : undefined,
      transactionDate: toCalendarDate(data.postedAt),
    }
    const raw = await client.post<MtPurchaseOrder>(`purchaseorder/${client.companyId}`, body)
    return transformPurchaseOrder(raw)
  }
}
