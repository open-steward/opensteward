import { toCalendarDate } from '../shared/transform'
/**
 * LEDGERS.Cloud accounting adapter.
 *
 * Auth: API key (x-api-key) + session token via POST /v3/login.
 * This is NOT an OAuth2 adapter — credentials are collected via the Connect
 * Link form (credentialFields / exchangeCredentials / refreshCredentials).
 *
 * Supported resources:
 *   - Organization (business info)
 *   - Invoices
 *   - Bills (purchase invoices)
 *   - Contacts
 *   - Accounts (chart of accounts)
 *   - Credit Memos (credit notes)
 *   - Tax Rates (GST rates)
 *   - Expenses (vouchers)
 *   - Purchase Orders
 *
 * Not supported (no documented endpoints):
 *   - Journals      — no journal/journal-entry endpoint in the LEDGERS.Cloud API
 *   - Transactions  — no general-ledger transaction endpoint; only aggregate Financial API
 *   - Orders        — no generic order resource; platform uses invoices + purchase orders only
 *   - Sales Orders  — UI feature only; no REST endpoint documented
 *
 * Docs: https://ledgers.readme.io/reference/introduction-1
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: journal      — LEDGERS.Cloud has no journal/journal-entry REST endpoint (verified via https://ledgers.readme.io/reference/introduction-1)
// Unavailable: transaction  — no general-ledger transaction endpoint; API exposes only aggregate Financial API and cash-book list
// Unavailable: order        — no generic order resource; platform uses invoices + purchase orders only
// Unavailable: salesorder   — UI-level feature only; no sales-order REST endpoint is documented

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'
import type { CreditMemo } from '../../schema/creditmemo'
import type { TaxRate } from '../../schema/taxrate'
import type { Expense } from '../../schema/expense'
import type { PurchaseOrder } from '../../schema/purchaseorder'

import { loginWithPassword, LEDGERS_AUTH_FORM } from './auth'
import { LedgersClient, DEFAULT_PAGE_SIZE } from './client'

import { transformInvoice, untransformInvoice, type LedgersInvoice } from './transform/invoice'
import { transformContact, type LedgersContact } from './transform/contact'
import { transformAccount, type LedgersAccount } from './transform/account'
import { transformOrganization, type LedgersBusiness } from './transform/organization'
import { transformBill, type LedgersBill } from './transform/bill'
import { transformCreditMemo, type LedgersCreditNote } from './transform/creditmemo'
import { transformTaxRate, type LedgersTaxRate } from './transform/taxrate'
import { transformExpense, type LedgersVoucher } from './transform/expense'
import { transformPurchaseOrder, type LedgersPurchaseOrder } from './transform/purchaseorder'

// ── Response envelope helpers ─────────────────────────────────────────────────

interface LedgersListResponse<T> {
  data?: T[]
  items?: T[]
  result?: T[]
  records?: T[]
  total?: number
  [key: string]: unknown
}

function extractList<T>(res: LedgersListResponse<T>): T[] {
  return res.data ?? res.items ?? res.result ?? res.records ?? []
}

interface LedgersSingleResponse<T> {
  data?: T
  result?: T
  [key: string]: unknown
}

function extractSingle<T>(res: LedgersSingleResponse<T>): T {
  const val = res.data ?? res.result ?? (res as unknown as T)
  if (!val) throw new Error('LEDGERS.Cloud: empty response for single resource')
  return val as T
}

// ── Adapter config ────────────────────────────────────────────────────────────

// No OAuth config needed — auth is entirely form-based.
// The adapter itself is stateless; all secrets live in `Credentials.extra`.

export class LedgersCloudAdapter implements AccountingAdapter {
  readonly platform = 'ledgers-cloud'
  readonly version = '0.1.0'

  // ── Connect Link form (non-OAuth) ─────────────────────────────────────────

  credentialFields = LEDGERS_AUTH_FORM.credentialFields.bind(LEDGERS_AUTH_FORM)
  exchangeCredentials = LEDGERS_AUTH_FORM.exchangeCredentials.bind(LEDGERS_AUTH_FORM)

  // ── Stub OAuth methods (required by BaseAdapter interface) ────────────────
  //
  // LEDGERS.Cloud does not use OAuth. These methods will never be called in
  // normal operation — the Connect Link path short-circuits via
  // exchangeCredentials above.

  getAuthUrl(_state: string): string {
    throw new Error(
      'LEDGERS.Cloud does not use OAuth. Use the Connect Link form to authenticate.',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'LEDGERS.Cloud does not use OAuth. Use the Connect Link form to authenticate.',
    )
  }

  /** Re-login to refresh the 24-hour session token. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const extra = credentials.extra as Record<string, string> | undefined
    const apiKey = extra?.['apiKey'] ?? ''
    const email = extra?.['email'] ?? ''
    const password = extra?.['password'] ?? ''
    if (!apiKey || !email || !password) {
      throw new Error(
        'LEDGERS.Cloud: cannot refresh — missing stored apiKey, email, or password. Re-authenticate.',
      )
    }
    return loginWithPassword(apiKey, email, password)
  }

  // ── Organization ──────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new LedgersClient(credentials)
    // /v3/list-business returns the businesses accessible by this API key.
    const res = await client.get<LedgersListResponse<LedgersBusiness>>('list-business')
    const list = extractList(res)
    const biz = list[0]
    if (!biz) throw new Error('LEDGERS.Cloud: no business found for this account')
    return transformOrganization(biz)
  }

  // ── Invoices ──────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new LedgersClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 200)
    const extra: Record<string, unknown> = {}
    if (params.updatedAfter) {
      extra['filter.date_from'] = params.updatedAfter.toISOString().split('T')[0]
    }
    const res = await client.getList<LedgersListResponse<LedgersInvoice>>(
      'list-invoice',
      page,
      limit,
      extra,
    )
    return extractList(res as unknown as LedgersListResponse<LedgersInvoice>).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new LedgersClient(credentials)
    const res = await client.get<LedgersSingleResponse<LedgersInvoice>>(`invoice/${id}`)
    return transformInvoice(extractSingle(res))
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new LedgersClient(credentials)
    const res = await client.post<LedgersSingleResponse<LedgersInvoice>>(
      'add-invoice',
      untransformInvoice(data),
    )
    return transformInvoice(extractSingle(res))
  }

  // ── Bills (purchase invoices) ─────────────────────────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new LedgersClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 200)
    const extra: Record<string, unknown> = {}
    if (params.updatedAfter) {
      extra['filter.date_from'] = params.updatedAfter.toISOString().split('T')[0]
    }
    const res = await client.getList<LedgersListResponse<LedgersBill>>(
      'list-purchase-invoice',
      page,
      limit,
      extra,
    )
    return extractList(res as unknown as LedgersListResponse<LedgersBill>).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new LedgersClient(credentials)
    const res = await client.get<LedgersSingleResponse<LedgersBill>>(`purchase-invoice/${id}`)
    return transformBill(extractSingle(res))
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new LedgersClient(credentials)
    const body: Record<string, unknown> = {
      invoice_number: data.billNumber,
      invoice_date: toCalendarDate(data.postedAt),
      due_date: toCalendarDate(data.dueAt),
      contact: data.contactId ? { id: data.contactId } : undefined,
      currency: data.currency,
      notes: data.notes,
      items: data.lineItems?.map((li) => ({
        item_id: li.itemId,
        name: li.itemName,
        description: li.itemDescription,
        unit_price: li.unitAmount,
        quantity: li.unitQuantity,
        amount: li.totalAmount,
      })),
    }
    const res = await client.post<LedgersSingleResponse<LedgersBill>>('add-purchase-invoice', body)
    return transformBill(extractSingle(res))
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new LedgersClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 200)
    const res = await client.getList<LedgersListResponse<LedgersContact>>(
      'list-contact',
      page,
      limit,
    )
    return extractList(res as unknown as LedgersListResponse<LedgersContact>).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new LedgersClient(credentials)
    const res = await client.get<LedgersSingleResponse<LedgersContact>>(`contact/${id}`)
    return transformContact(extractSingle(res))
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new LedgersClient(credentials)
    const body: Record<string, unknown> = {
      contact_name: data.name,
      business_name: data.companyName,
      display_name: data.name,
      email: data.emails?.[0]?.email,
      mobile: data.telephones?.find((t) => t.type === 'MOBILE')?.telephone,
      phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
      currency: data.currency,
      billing_address: data.billingAddress
        ? [
            {
              address: data.billingAddress.address1,
              city: data.billingAddress.city,
              state: data.billingAddress.region,
              pin_code: data.billingAddress.postalCode,
              country: data.billingAddress.country,
            },
          ]
        : undefined,
    }
    const res = await client.post<LedgersSingleResponse<LedgersContact>>('add-contact', body)
    return transformContact(extractSingle(res))
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new LedgersClient(credentials)
    const body: Record<string, unknown> = {
      id,
      contact_name: data.name,
      business_name: data.companyName,
      display_name: data.name,
      email: data.emails?.[0]?.email,
      mobile: data.telephones?.find((t) => t.type === 'MOBILE')?.telephone,
      phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
    }
    const res = await client.put<LedgersSingleResponse<LedgersContact>>('update-contact', body)
    return transformContact(extractSingle(res))
  }

  // ── Accounts ──────────────────────────────────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new LedgersClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 200)
    const res = await client.getList<LedgersListResponse<LedgersAccount>>(
      'list-chart-of-accounts',
      page,
      limit,
    )
    return extractList(res as unknown as LedgersListResponse<LedgersAccount>).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new LedgersClient(credentials)
    const res = await client.get<LedgersSingleResponse<LedgersAccount>>(`chart-of-account/${id}`)
    return transformAccount(extractSingle(res))
  }

  // ── Credit Memos (credit notes) ───────────────────────────────────────────

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new LedgersClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 200)
    const res = await client.getList<LedgersListResponse<LedgersCreditNote>>(
      'list-credit-note',
      page,
      limit,
    )
    return extractList(res as unknown as LedgersListResponse<LedgersCreditNote>).map(
      transformCreditMemo,
    )
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new LedgersClient(credentials)
    const res = await client.get<LedgersSingleResponse<LedgersCreditNote>>(`credit-note/${id}`)
    return transformCreditMemo(extractSingle(res))
  }

  // ── Tax Rates (GST rates) ─────────────────────────────────────────────────

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new LedgersClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 200)
    const res = await client.getList<LedgersListResponse<LedgersTaxRate>>(
      'list-gst-rates',
      page,
      limit,
    )
    return extractList(res as unknown as LedgersListResponse<LedgersTaxRate>).map(transformTaxRate)
  }

  // ── Expenses (vouchers) ───────────────────────────────────────────────────

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new LedgersClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 200)
    const res = await client.getList<LedgersListResponse<LedgersVoucher>>(
      'list-voucher',
      page,
      limit,
    )
    return extractList(res as unknown as LedgersListResponse<LedgersVoucher>).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new LedgersClient(credentials)
    const res = await client.get<LedgersSingleResponse<LedgersVoucher>>(`voucher/${id}`)
    return transformExpense(extractSingle(res))
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new LedgersClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 200)
    const res = await client.getList<LedgersListResponse<LedgersPurchaseOrder>>(
      'list-purchase-order',
      page,
      limit,
    )
    return extractList(res as unknown as LedgersListResponse<LedgersPurchaseOrder>).map(
      transformPurchaseOrder,
    )
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new LedgersClient(credentials)
    const res = await client.get<LedgersSingleResponse<LedgersPurchaseOrder>>(
      `purchase-order/${id}`,
    )
    return transformPurchaseOrder(extractSingle(res))
  }

  async createPurchaseOrder(
    credentials: Credentials,
    data: Partial<PurchaseOrder>,
  ): Promise<PurchaseOrder> {
    const client = new LedgersClient(credentials)
    const body: Record<string, unknown> = {
      po_date: toCalendarDate(data.postedAt),
      contact: data.contactId ? { id: data.contactId } : undefined,
      currency: data.currency,
      items: data.lineItems?.map((li) => ({
        item_id: li.itemId,
        name: li.itemName,
        description: li.itemDescription,
        unit_price: li.unitAmount,
        quantity: li.unitQuantity,
        amount: li.totalAmount,
      })),
    }
    const res = await client.post<LedgersSingleResponse<LedgersPurchaseOrder>>(
      'add-purchase-order',
      body,
    )
    return transformPurchaseOrder(extractSingle(res))
  }
}
