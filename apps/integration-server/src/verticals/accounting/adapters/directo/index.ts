/**
 * Directo accounting adapter.
 *
 * Auth:  API key via X-Directo-Key header (simpleApiKey credential form).
 * Base:  https://login.directo.ee/apidirect/v1/
 * Docs:  https://wiki.directo.ee/en/api_direct
 *
 * Supported resources:
 *   - invoices          (listInvoices, getInvoice, createInvoice, updateInvoice)
 *   - purchase_invoices (listBills, getBill)
 *   - customers         (listContacts, getContact, createContact, updateContact)
 *   - suppliers         (included in listContacts / getContact)
 *   - accounts          (listAccounts, getAccount)
 *   - transactions      (listJournals, getJournal, createJournal)
 *   - receipts          (listTransactions, getTransaction)
 *   - orders            (listOrders, getOrder)
 *   - purchase_orders   (listPurchaseOrders, getPurchaseOrder)
 *
 * Unsupported (no Directo endpoint): expenses, credit memos, sales orders,
 * tax rates (vatcodes only appear as reference codes on rows), webhooks.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: creditmemo  — no credit memo/credit note endpoint in Directo REST API; adjustments are negative invoices in the UI only.
// Unavailable: expense     — no expenses endpoint; the expenses feature is UI-only with no /v1/expenses or equivalent resource.
// Unavailable: salesorder  — /orders is already consumed by the Order canonical resource; /sales_quotations represents pre-sales quotations, not confirmed sales orders.

import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Transaction } from '../../schema/transaction'
import type { Order } from '../../schema/order'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshCredentials as refreshCreds } from './auth'
import { DirectoClient } from './client'

import {
  transformInvoice,
  untransformInvoice,
  type DirectoInvoice,
} from './transform/invoice'
import { transformBill, type DirectoPurchaseInvoice } from './transform/bill'
import {
  transformCustomer,
  transformSupplier,
  type DirectoCustomer,
  type DirectoSupplier,
} from './transform/contact'
import { transformAccount, type DirectoAccount } from './transform/account'
import {
  transformJournal,
  untransformJournal,
  type DirectoTransaction,
} from './transform/journal'
import { transformTransaction, type DirectoReceipt } from './transform/transaction'
import { transformOrder, type DirectoOrder } from './transform/order'
import { transformPurchaseOrder, type DirectoPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type DirectoCompanyInfo } from './transform/organization'

// Connect Link: single API-key form
const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'Directo API key',
  helpText: 'Generate an API key in your Directo ERP settings under System → API.',
})

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build query params for Directo filter-based pagination.
 * Directo does not use offset/limit — use `ts` (modified-after timestamp) for
 * incremental sync and a `date` range for initial loads.
 */
function buildParams(params: QueryParams): Record<string, unknown> {
  const q: Record<string, unknown> = {}
  if (params.updatedAfter) {
    // Directo filters by modification timestamp with `ts=>` prefix syntax
    q['ts'] = `>${params.updatedAfter.toISOString()}`
  }
  return q
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class DirectoAdapter implements AccountingAdapter {
  readonly platform = 'directo'
  readonly version = '0.1.0'

  // Connect Link support — single API-key form
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCreds(credentials)
  }

  // ── Organization ──────────────────────────────────────────────────────────

  /**
   * Directo does not have a /company endpoint. We fetch the customer whose
   * code matches the magic value "SELF" or fall back to the first customer
   * record as a reasonable approximation of the company identity.
   */
  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new DirectoClient(credentials)
    const rows = await client.get<DirectoCompanyInfo[]>('customers', { code: 'SELF' })
    const raw = Array.isArray(rows) && rows.length > 0 ? rows[0] : ({} as DirectoCompanyInfo)
    return transformOrganization(raw)
  }

  // ── Invoices ──────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new DirectoClient(credentials)
    const rows = await client.get<DirectoInvoice[]>('invoices', buildParams(params))
    return (rows ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new DirectoClient(credentials)
    const rows = await client.get<DirectoInvoice[]>('invoices', { number: id })
    if (!rows || rows.length === 0) throw new Error(`Directo invoice ${id} not found`)
    return transformInvoice(rows[0])
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new DirectoClient(credentials)
    const res = await client.post<DirectoInvoice[]>('invoices', [untransformInvoice(data)])
    if (!res || res.length === 0) throw new Error('Directo invoice create returned empty response')
    return transformInvoice(res[0])
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new DirectoClient(credentials)
    const body = { ...untransformInvoice(data), number: id }
    const res = await client.put<DirectoInvoice[]>('invoices', [body])
    if (!res || res.length === 0) throw new Error('Directo invoice update returned empty response')
    return transformInvoice(res[0])
  }

  // ── Bills (purchase invoices) ─────────────────────────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new DirectoClient(credentials)
    const rows = await client.get<DirectoPurchaseInvoice[]>(
      'purchase_invoices',
      buildParams(params),
    )
    return (rows ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new DirectoClient(credentials)
    const rows = await client.get<DirectoPurchaseInvoice[]>('purchase_invoices', { number: id })
    if (!rows || rows.length === 0) throw new Error(`Directo purchase invoice ${id} not found`)
    return transformBill(rows[0])
  }

  // ── Contacts (customers + suppliers) ─────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new DirectoClient(credentials)
    const [custRows, suppRows] = await Promise.all([
      client.get<DirectoCustomer[]>('customers', buildParams(params)),
      client.get<DirectoSupplier[]>('suppliers', buildParams(params)),
    ])
    return [
      ...(custRows ?? []).map(transformCustomer),
      ...(suppRows ?? []).map(transformSupplier),
    ]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new DirectoClient(credentials)
    if (id.startsWith('supp_')) {
      const code = id.slice(5)
      const rows = await client.get<DirectoSupplier[]>('suppliers', { code })
      if (!rows || rows.length === 0) throw new Error(`Directo supplier ${code} not found`)
      return transformSupplier(rows[0])
    }
    const code = id.startsWith('cust_') ? id.slice(5) : id
    const rows = await client.get<DirectoCustomer[]>('customers', { code })
    if (!rows || rows.length === 0) throw new Error(`Directo customer ${code} not found`)
    return transformCustomer(rows[0])
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new DirectoClient(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const body = {
        name: data.name,
        regno: data.identification,
        vatregno: data.taxNumber,
        email: data.emails?.[0]?.email,
        phone: data.telephones?.[0]?.telephone,
        currency: data.currency,
        address1: data.billingAddress?.address1,
        address2: data.billingAddress?.address2,
        address3: data.billingAddress?.city,
        country: data.billingAddress?.country,
      }
      const res = await client.post<DirectoSupplier[]>('suppliers', [body])
      if (!res || res.length === 0) throw new Error('Directo supplier create returned empty')
      return transformSupplier(res[0])
    }
    const body = {
      name: data.name,
      regno: data.identification,
      vatregno: data.taxNumber,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      currency: data.currency,
      address1: data.billingAddress?.address1,
      address2: data.billingAddress?.address2,
      address3: data.billingAddress?.city,
      country: data.billingAddress?.country,
    }
    const res = await client.post<DirectoCustomer[]>('customers', [body])
    if (!res || res.length === 0) throw new Error('Directo customer create returned empty')
    return transformCustomer(res[0])
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new DirectoClient(credentials)
    if (id.startsWith('supp_')) {
      const code = id.slice(5)
      const body = {
        code,
        name: data.name,
        email: data.emails?.[0]?.email,
        phone: data.telephones?.[0]?.telephone,
        address1: data.billingAddress?.address1,
        address2: data.billingAddress?.address2,
        address3: data.billingAddress?.city,
        country: data.billingAddress?.country,
      }
      const res = await client.put<DirectoSupplier[]>('suppliers', [body])
      if (!res || res.length === 0) throw new Error('Directo supplier update returned empty')
      return transformSupplier(res[0])
    }
    const code = id.startsWith('cust_') ? id.slice(5) : id
    const body = {
      code,
      name: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      address1: data.billingAddress?.address1,
      address2: data.billingAddress?.address2,
      address3: data.billingAddress?.city,
      country: data.billingAddress?.country,
    }
    const res = await client.put<DirectoCustomer[]>('customers', [body])
    if (!res || res.length === 0) throw new Error('Directo customer update returned empty')
    return transformCustomer(res[0])
  }

  // ── Accounts ──────────────────────────────────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new DirectoClient(credentials)
    const rows = await client.get<DirectoAccount[]>('accounts', buildParams(params))
    return (rows ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new DirectoClient(credentials)
    const rows = await client.get<DirectoAccount[]>('accounts', { code: id })
    if (!rows || rows.length === 0) throw new Error(`Directo account ${id} not found`)
    return transformAccount(rows[0])
  }

  // ── Journals (GL transactions) ────────────────────────────────────────────

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new DirectoClient(credentials)
    const rows = await client.get<DirectoTransaction[]>('transactions', buildParams(params))
    return (rows ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new DirectoClient(credentials)
    const rows = await client.get<DirectoTransaction[]>('transactions', { number: id })
    if (!rows || rows.length === 0) throw new Error(`Directo transaction ${id} not found`)
    return transformJournal(rows[0])
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new DirectoClient(credentials)
    const res = await client.post<DirectoTransaction[]>('transactions', [untransformJournal(data)])
    if (!res || res.length === 0) throw new Error('Directo journal create returned empty')
    return transformJournal(res[0])
  }

  // ── Transactions (receipts / payments) ────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new DirectoClient(credentials)
    const rows = await client.get<DirectoReceipt[]>('receipts', buildParams(params))
    return (rows ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new DirectoClient(credentials)
    const rows = await client.get<DirectoReceipt[]>('receipts', { number: id })
    if (!rows || rows.length === 0) throw new Error(`Directo receipt ${id} not found`)
    return transformTransaction(rows[0])
  }

  // ── Orders (sales orders) ─────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new DirectoClient(credentials)
    const rows = await client.get<DirectoOrder[]>('orders', buildParams(params))
    return (rows ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new DirectoClient(credentials)
    const rows = await client.get<DirectoOrder[]>('orders', { number: id })
    if (!rows || rows.length === 0) throw new Error(`Directo order ${id} not found`)
    return transformOrder(rows[0])
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new DirectoClient(credentials)
    const rows = await client.get<DirectoPurchaseOrder[]>('purchase_orders', buildParams(params))
    return (rows ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new DirectoClient(credentials)
    const rows = await client.get<DirectoPurchaseOrder[]>('purchase_orders', { number: id })
    if (!rows || rows.length === 0) throw new Error(`Directo purchase order ${id} not found`)
    return transformPurchaseOrder(rows[0])
  }
}
