import { toCalendarDate } from '../shared/transform'
/**
 * Stampli accounting adapter.
 *
 * Stampli is an AP-automation platform. It manages vendor invoices through
 * AI-assisted approval workflows and routes payments to vendors. Resources
 * implemented in this adapter:
 *
 *   - Bill         (vendor invoices flowing through Stampli approval workflow)
 *   - Contact      (vendors/suppliers)
 *   - Account      (GL account codes used to code invoice lines)
 *   - Transaction  (outgoing AP payments)
 *   - Organization (company / payer entity)
 *
 * Auth: static API key sent as `Authorization: Bearer <token>`. The payer
 * company identifier is stored in `credentials.extra.companyId` and is
 * included in resource paths where required.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: invoice    — Stampli is AP-only; no AR invoice concept or endpoint exists.
// Unavailable: salesorder — Stampli is AP-only; sales orders are an AR concept not present.
// Unverified:  creditmemo — Credit memos appear in ERP-side export docs but no Stampli partner API endpoint confirmed; docs behind partner login.
// Unverified:  expense    — Stampli Card exists as a product but no expense-report API endpoint confirmed; docs behind partner login.
// Unverified:  journal    — Journal entries are created in the ERP on posting; no Stampli partner API endpoint confirmed; docs behind partner login.
// Unverified:  order      — Generic "order" is not a documented Stampli API resource; docs behind partner login.
// Unverified:  purchaseorder — Stampli syncs ERP-owned PO data for PO matching but no partner API endpoint for Stampli-side POs confirmed; docs behind partner login.
// Unverified:  taxrate    — Tax codes are synced from ERP master data but no standalone taxrate endpoint confirmed; docs behind partner login.
import { customForm } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Transaction } from '../../schema/transaction'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, refreshCredentials as doRefreshCredentials } from './auth'
import { StampliClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformBill, type StampliInvoice } from './transform/bill'
import { transformVendor, type StampliVendor } from './transform/contact'
import { transformAccount, type StampliGLAccount } from './transform/account'
import { transformTransaction, type StampliPayment } from './transform/transaction'
import { transformOrganization, type StampliCompany } from './transform/organization'

// ── Credential form ───────────────────────────────────────────────────────────

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText:
        'Your Stampli partner API key. Obtain one via the Stampli Partner Programme or your Stampli account manager.',
    },
    {
      name: 'companyId',
      label: 'Company ID',
      type: 'text',
      required: true,
      helpText:
        'Your Stampli payer company identifier. Found in Stampli under Company Settings.',
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const apiKey = (fields['apiKey'] ?? '').trim()
    const companyId = (fields['companyId'] ?? '').trim()
    if (!apiKey) throw new Error('API Key is required.')
    if (!companyId) throw new Error('Company ID is required.')
    return { accessToken: apiKey, extra: { companyId } }
  },
})

// ── Pagination envelope ───────────────────────────────────────────────────────

interface StampliPage<T> {
  data?: T[]
  items?: T[]
  results?: T[]
  meta?: {
    page?: number
    pageSize?: number
    totalCount?: number
    totalPages?: number
  }
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class StampliAdapter implements AccountingAdapter {
  readonly platform = 'stampli'
  readonly version = '0.1.0'

  // Connect Link support — two-field form (API key + company ID).
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // Stampli does not use OAuth. Credentials are gathered via the form.
    throw new Error(
      'Stampli uses API key auth. Use the Connect Link credential form instead.',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
      ...(params.updatedAfter && {
        updatedAfter: params.updatedAfter.toISOString(),
      }),
    }
  }

  /** Extract the items array from any envelope shape Stampli may use. */
  private items<T>(res: StampliPage<T>): T[] {
    return res.data ?? res.items ?? res.results ?? []
  }

  // ── Organization ────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new StampliClient(credentials)
    const res = await client.get<StampliCompany | { data: StampliCompany }>(
      `companies/${client.companyId}`,
    )
    // Stampli may wrap single resources in a { data: ... } envelope
    const raw = ('data' in res && res.data && typeof res.data === 'object')
      ? (res.data as StampliCompany)
      : (res as StampliCompany)
    return transformOrganization(raw)
  }

  // ── Bills (vendor AP invoices) ───────────────────────────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new StampliClient(credentials)
    const res = await client.get<StampliPage<StampliInvoice>>(
      `companies/${client.companyId}/invoices`,
      this.paginationParams(params),
    )
    return this.items(res).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new StampliClient(credentials)
    const res = await client.get<StampliInvoice | { data: StampliInvoice }>(
      `companies/${client.companyId}/invoices/${id}`,
    )
    const raw = ('data' in res && res.data && typeof res.data === 'object')
      ? (res.data as StampliInvoice)
      : (res as StampliInvoice)
    return transformBill(raw)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new StampliClient(credentials)
    const body = {
      vendorId: data.contactId,
      invoiceNumber: data.billNumber,
      invoiceDate: toCalendarDate(data.postedAt),
      dueDate: toCalendarDate(data.dueAt),
      totalAmount: data.totalAmount,
      currency: data.currency,
      description: data.notes,
      lineItems: data.lineItems?.map((li) => ({
        glAccountId: li.accountId,
        description: li.itemDescription,
        quantity: li.unitQuantity,
        unitPrice: li.unitAmount,
        amount: li.totalAmount,
      })),
    }
    const res = await client.post<StampliInvoice | { data: StampliInvoice }>(
      `companies/${client.companyId}/invoices`,
      body,
    )
    const raw = ('data' in res && res.data && typeof res.data === 'object')
      ? (res.data as StampliInvoice)
      : (res as StampliInvoice)
    return transformBill(raw)
  }

  async updateBill(credentials: Credentials, id: string, data: Partial<Bill>): Promise<Bill> {
    const client = new StampliClient(credentials)
    const body = {
      invoiceNumber: data.billNumber,
      invoiceDate: toCalendarDate(data.postedAt),
      dueDate: toCalendarDate(data.dueAt),
      totalAmount: data.totalAmount,
      currency: data.currency,
      description: data.notes,
      lineItems: data.lineItems?.map((li) => ({
        glAccountId: li.accountId,
        description: li.itemDescription,
        quantity: li.unitQuantity,
        unitPrice: li.unitAmount,
        amount: li.totalAmount,
      })),
    }
    const res = await client.put<StampliInvoice | { data: StampliInvoice }>(
      `companies/${client.companyId}/invoices/${id}`,
      body,
    )
    const raw = ('data' in res && res.data && typeof res.data === 'object')
      ? (res.data as StampliInvoice)
      : (res as StampliInvoice)
    return transformBill(raw)
  }

  // ── Contacts (vendors / suppliers) ──────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new StampliClient(credentials)
    const res = await client.get<StampliPage<StampliVendor>>(
      `companies/${client.companyId}/vendors`,
      this.paginationParams(params),
    )
    return this.items(res).map(transformVendor)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new StampliClient(credentials)
    const res = await client.get<StampliVendor | { data: StampliVendor }>(
      `companies/${client.companyId}/vendors/${id}`,
    )
    const raw = ('data' in res && res.data && typeof res.data === 'object')
      ? (res.data as StampliVendor)
      : (res as StampliVendor)
    return transformVendor(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new StampliClient(credentials)
    const body = {
      vendorName: data.name,
      vendorCode: data.identification,
      taxId: data.taxNumber,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
      fax: data.telephones?.find((t) => t.type === 'FAX')?.telephone,
      address1: data.billingAddress?.address1,
      address2: data.billingAddress?.address2,
      city: data.billingAddress?.city,
      state: data.billingAddress?.region,
      postalCode: data.billingAddress?.postalCode,
      country: data.billingAddress?.country,
      currency: data.currency,
    }
    const res = await client.post<StampliVendor | { data: StampliVendor }>(
      `companies/${client.companyId}/vendors`,
      body,
    )
    const raw = ('data' in res && res.data && typeof res.data === 'object')
      ? (res.data as StampliVendor)
      : (res as StampliVendor)
    return transformVendor(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new StampliClient(credentials)
    const body = {
      vendorName: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
      address1: data.billingAddress?.address1,
      address2: data.billingAddress?.address2,
      city: data.billingAddress?.city,
      state: data.billingAddress?.region,
      postalCode: data.billingAddress?.postalCode,
      country: data.billingAddress?.country,
    }
    const res = await client.put<StampliVendor | { data: StampliVendor }>(
      `companies/${client.companyId}/vendors/${id}`,
      body,
    )
    const raw = ('data' in res && res.data && typeof res.data === 'object')
      ? (res.data as StampliVendor)
      : (res as StampliVendor)
    return transformVendor(raw)
  }

  // ── Accounts (GL codes) ──────────────────────────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new StampliClient(credentials)
    const res = await client.get<StampliPage<StampliGLAccount>>(
      `companies/${client.companyId}/glaccounts`,
      this.paginationParams(params),
    )
    return this.items(res).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new StampliClient(credentials)
    const res = await client.get<StampliGLAccount | { data: StampliGLAccount }>(
      `companies/${client.companyId}/glaccounts/${id}`,
    )
    const raw = ('data' in res && res.data && typeof res.data === 'object')
      ? (res.data as StampliGLAccount)
      : (res as StampliGLAccount)
    return transformAccount(raw)
  }

  // ── Transactions (AP payments) ───────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new StampliClient(credentials)
    const res = await client.get<StampliPage<StampliPayment>>(
      `companies/${client.companyId}/payments`,
      this.paginationParams(params),
    )
    return this.items(res).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new StampliClient(credentials)
    const res = await client.get<StampliPayment | { data: StampliPayment }>(
      `companies/${client.companyId}/payments/${id}`,
    )
    const raw = ('data' in res && res.data && typeof res.data === 'object')
      ? (res.data as StampliPayment)
      : (res as StampliPayment)
    return transformTransaction(raw)
  }
}
