/**
 * CashCtrl accounting adapter.
 *
 * CashCtrl is a Swiss cloud accounting platform with a tenant-per-subdomain
 * REST API (https://{orgName}.cashctrl.com/api/v1).
 *
 * Auth: HTTP Basic — API key as username, empty password.
 * Credentials are collected via Connect Link using a two-field custom form:
 *   1. API key  → credentials.accessToken
 *   2. Org name → credentials.extra.orgName
 *
 * Supported resources:
 *   - Organization    (settings)
 *   - Invoices        (/order/list.json with type=SALES filter)
 *   - Bills           (/order/list.json with type=PURCHASE filter)
 *   - SalesOrders     (/order/list.json with type=SALES filter)
 *   - PurchaseOrders  (/order/list.json with type=PURCHASE filter)
 *   - Orders          (/order/list.json — all order types)
 *   - Contacts        (/person/list.json)
 *   - Accounts        (/account/list.json)
 *   - Journals        (/journal/list.json)
 *   - Transactions    (/journal/list.json — journal entries as transactions)
 *   - Tax rates       (/tax/list.json)
 *
 * No webhook support is documented by CashCtrl.
 *
 * Docs: https://app.cashctrl.com/static/help/en/api/index.html
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: creditmemo — CashCtrl has no dedicated credit note endpoint;
 *              credit notes are user-defined order categories with no
 *              programmatic type filter (no type=CREDIT_NOTE param exists).
 * Unavailable: expense — No expense endpoint; CashCtrl handles expenses
 *              exclusively through journal entries.
 */
import { customForm } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { TaxRate } from '../../schema/taxrate'
import type { Organization } from '../../schema/organization'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Transaction } from '../../schema/transaction'

import { refreshCredentials } from './auth'
import { CashCtrlClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type CashCtrlOrder } from './transform/invoice'
import { transformBill } from './transform/bill'
import { transformPerson, type CashCtrlPerson } from './transform/contact'
import { transformAccount, type CashCtrlAccount } from './transform/account'
import { transformJournal, type CashCtrlJournal } from './transform/journal'
import { transformTaxRate, type CashCtrlTax } from './transform/taxrate'
import { transformOrganization, type CashCtrlSettings } from './transform/organization'
import { transformOrder } from './transform/order'
import { transformSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder } from './transform/purchaseorder'
import { transformTransaction } from './transform/transaction'

// ── Connect Link form ─────────────────────────────────────────────────────────

/**
 * Two-field credential form:
 *   1. Org name (subdomain, e.g. "mycompany")
 *   2. API key
 *
 * The org name is stored in credentials.extra.orgName so the client can
 * build the per-tenant base URL. The API key goes into credentials.accessToken.
 */
const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'orgName',
      label: 'Organisation name',
      type: 'text',
      placeholder: 'mycompany',
      helpText:
        'The subdomain of your CashCtrl account (e.g. "mycompany" for mycompany.cashctrl.com).',
      required: true,
    },
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      helpText:
        'Found under Settings → Users → API key in your CashCtrl account.',
      required: true,
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const orgName = (fields['orgName'] ?? '').trim()
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!orgName) throw new Error('Organisation name is required.')
    if (!apiKey) throw new Error('API key is required.')
    return { accessToken: apiKey, extra: { orgName } }
  },
})

// ── CashCtrl list-response envelope ──────────────────────────────────────────

interface CashCtrlListResponse<T> {
  data: T[]
  /** Total number of records (not paged). */
  totalCount?: number
}

interface CashCtrlSingleResponse<T> {
  data: T
}

/**
 * Response shape returned by CashCtrl write endpoints (create/update/delete).
 * Success responses carry `success: true` and optionally `insertId` for creates.
 * On failure, `success: false` and an `errors` array are returned.
 * The full resource object is NOT included in the write response — callers
 * must perform a follow-up GET to retrieve the created/updated record.
 */
interface CashCtrlWriteResponse {
  success: boolean
  /** Present on successful create operations — the id of the new record. */
  insertId?: number
  errors?: Array<{ field?: string; message?: string }>
}

// ── Order category type values (CashCtrl uses "SALES" vs "PURCHASE"). ─────────

/** CashCtrl order type string used in order category definitions. */
type CashCtrlOrderType = 'SALES' | 'PURCHASE' | string

// ── Adapter ───────────────────────────────────────────────────────────────────

export class CashctrlAdapter implements AccountingAdapter {
  readonly platform = 'cashctrl'
  readonly version = '0.1.0'

  // Connect Link support — custom two-field form (org name + API key).
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  // CashCtrl has no OAuth flow; this method is not used but satisfies the interface.
  getAuthUrl(_state: string): string {
    return 'https://app.cashctrl.com'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('CashCtrl does not support OAuth code exchange.')
  }

  // ── Pagination helpers ───────────────────────────────────────────────────

  private paginationParams(params: QueryParams): Record<string, unknown> {
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    return {
      limit,
      // CashCtrl uses offset-based pagination via the 'start' parameter.
      // Docs: "start optional NUMBER The starting entry. Defaults to 0"
      start: (page - 1) * limit,
    }
  }

  // ── Organization ─────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new CashCtrlClient(credentials)
    const res = await client.get<CashCtrlSingleResponse<CashCtrlSettings>>('setting/read.json')
    return transformOrganization(res.data)
  }

  // ── Invoices (sales orders) ───────────────────────────────────────────────

  /**
   * CashCtrl uses a single /order endpoint for all document types.
   * We fetch all orders and rely on the caller to pass a filter if needed,
   * or fall back to listing all — the API category filter would require
   * a second call to /order/category/list.json to look up sales category ids.
   * For simplicity we return all orders typed as invoices; the `type` field
   * in the canonical Invoice is always 'INVOICE' since this method is on the
   * invoice resource.
   */
  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new CashCtrlClient(credentials)
    const query: Record<string, unknown> = {
      ...this.paginationParams(params),
      // Filter to sales-type orders only
      type: 'SALES' as CashCtrlOrderType,
    }
    if (params.updatedAfter) {
      query['filter'] = JSON.stringify([
        {
          comparison: 'gt',
          field: 'lastUpdated',
          value: params.updatedAfter.toISOString().split('T')[0],
        },
      ])
    }
    const res = await client.get<CashCtrlListResponse<CashCtrlOrder>>('order/list.json', query)
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new CashCtrlClient(credentials)
    const res = await client.get<CashCtrlSingleResponse<CashCtrlOrder>>('order/read.json', {
      id,
    })
    return transformInvoice(res.data)
  }

  // ── Bills (purchase orders) ───────────────────────────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new CashCtrlClient(credentials)
    const query: Record<string, unknown> = {
      ...this.paginationParams(params),
      type: 'PURCHASE' as CashCtrlOrderType,
    }
    if (params.updatedAfter) {
      query['filter'] = JSON.stringify([
        {
          comparison: 'gt',
          field: 'lastUpdated',
          value: params.updatedAfter.toISOString().split('T')[0],
        },
      ])
    }
    const res = await client.get<CashCtrlListResponse<CashCtrlOrder>>('order/list.json', query)
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new CashCtrlClient(credentials)
    const res = await client.get<CashCtrlSingleResponse<CashCtrlOrder>>('order/read.json', {
      id,
    })
    return transformBill(res.data)
  }

  // ── Contacts (persons) ────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new CashCtrlClient(credentials)
    const res = await client.get<CashCtrlListResponse<CashCtrlPerson>>(
      'person/list.json',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformPerson)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new CashCtrlClient(credentials)
    const res = await client.get<CashCtrlSingleResponse<CashCtrlPerson>>('person/read.json', {
      id,
    })
    return transformPerson(res.data)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new CashCtrlClient(credentials)
    const body: Record<string, string | number | boolean> = {}
    if (data.firstName) body['firstName'] = data.firstName
    if (data.lastName) body['lastName'] = data.lastName
    if (data.companyName) body['company'] = data.companyName
    if (data.emails?.[0]?.email) body['email'] = data.emails[0].email
    if (data.telephones?.find((t) => t.type === 'WORK')?.telephone) {
      body['phone'] = data.telephones.find((t) => t.type === 'WORK')!.telephone
    }
    if (data.telephones?.find((t) => t.type === 'MOBILE')?.telephone) {
      body['mobile'] = data.telephones.find((t) => t.type === 'MOBILE')!.telephone
    }
    if (data.taxNumber) body['vatUid'] = data.taxNumber
    if (data.currency) body['currencyCode'] = data.currency
    // CashCtrl POST /person/create.json returns { success: true, insertId: N } — NOT a person
    // object. We must do a follow-up GET /person/read.json?id={insertId} to get the record.
    const writeRes = await client.post<CashCtrlWriteResponse>('person/create.json', body)
    const newId = writeRes.insertId
    if (!newId) {
      throw new Error(`CashCtrl person create failed: ${JSON.stringify(writeRes.errors ?? [])}`)
    }
    const readRes = await client.get<CashCtrlSingleResponse<CashCtrlPerson>>('person/read.json', {
      id: newId,
    })
    return transformPerson(readRes.data)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new CashCtrlClient(credentials)
    const body: Record<string, string | number | boolean> = { id: Number(id) }
    if (data.firstName) body['firstName'] = data.firstName
    if (data.lastName) body['lastName'] = data.lastName
    if (data.companyName) body['company'] = data.companyName
    if (data.emails?.[0]?.email) body['email'] = data.emails[0].email
    if (data.telephones?.find((t) => t.type === 'WORK')?.telephone) {
      body['phone'] = data.telephones.find((t) => t.type === 'WORK')!.telephone
    }
    if (data.taxNumber) body['vatUid'] = data.taxNumber
    if (data.currency) body['currencyCode'] = data.currency
    // CashCtrl POST /person/update.json returns { success: true } — NOT a person object.
    // We must do a follow-up GET /person/read.json?id={id} to get the updated record.
    const writeRes = await client.post<CashCtrlWriteResponse>('person/update.json', body)
    if (!writeRes.success) {
      throw new Error(`CashCtrl person update failed: ${JSON.stringify(writeRes.errors ?? [])}`)
    }
    const readRes = await client.get<CashCtrlSingleResponse<CashCtrlPerson>>('person/read.json', {
      id: Number(id),
    })
    return transformPerson(readRes.data)
  }

  // ── Accounts ─────────────────────────────────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new CashCtrlClient(credentials)
    const res = await client.get<CashCtrlListResponse<CashCtrlAccount>>(
      'account/list.json',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new CashCtrlClient(credentials)
    const res = await client.get<CashCtrlSingleResponse<CashCtrlAccount>>('account/read.json', {
      id,
    })
    return transformAccount(res.data)
  }

  // ── Journals ──────────────────────────────────────────────────────────────

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new CashCtrlClient(credentials)
    const query: Record<string, unknown> = this.paginationParams(params)
    if (params.updatedAfter) {
      query['filter'] = JSON.stringify([
        {
          comparison: 'gt',
          field: 'dateAdded',
          value: params.updatedAfter.toISOString().split('T')[0],
        },
      ])
    }
    const res = await client.get<CashCtrlListResponse<CashCtrlJournal>>(
      'journal/list.json',
      query,
    )
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new CashCtrlClient(credentials)
    const res = await client.get<CashCtrlSingleResponse<CashCtrlJournal>>(
      'journal/read.json',
      { id },
    )
    return transformJournal(res.data)
  }

  // ── Tax rates ─────────────────────────────────────────────────────────────

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new CashCtrlClient(credentials)
    const res = await client.get<CashCtrlListResponse<CashCtrlTax>>(
      'tax/list.json',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new CashCtrlClient(credentials)
    const res = await client.get<CashCtrlSingleResponse<CashCtrlTax>>('tax/read.json', { id })
    return transformTaxRate(res.data)
  }

  // ── Orders (all document types, no type filter) ───────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new CashCtrlClient(credentials)
    const query: Record<string, unknown> = this.paginationParams(params)
    if (params.updatedAfter) {
      query['filter'] = JSON.stringify([
        {
          comparison: 'gt',
          field: 'lastUpdated',
          value: params.updatedAfter.toISOString().split('T')[0],
        },
      ])
    }
    const res = await client.get<CashCtrlListResponse<CashCtrlOrder>>('order/list.json', query)
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new CashCtrlClient(credentials)
    const res = await client.get<CashCtrlSingleResponse<CashCtrlOrder>>('order/read.json', { id })
    return transformOrder(res.data)
  }

  // ── Sales orders (outgoing documents) ────────────────────────────────────

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new CashCtrlClient(credentials)
    const query: Record<string, unknown> = {
      ...this.paginationParams(params),
      type: 'SALES' as CashCtrlOrderType,
    }
    if (params.updatedAfter) {
      query['filter'] = JSON.stringify([
        {
          comparison: 'gt',
          field: 'lastUpdated',
          value: params.updatedAfter.toISOString().split('T')[0],
        },
      ])
    }
    const res = await client.get<CashCtrlListResponse<CashCtrlOrder>>('order/list.json', query)
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new CashCtrlClient(credentials)
    const res = await client.get<CashCtrlSingleResponse<CashCtrlOrder>>('order/read.json', { id })
    return transformSalesOrder(res.data)
  }

  // ── Purchase orders (incoming documents) ─────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new CashCtrlClient(credentials)
    const query: Record<string, unknown> = {
      ...this.paginationParams(params),
      type: 'PURCHASE' as CashCtrlOrderType,
    }
    if (params.updatedAfter) {
      query['filter'] = JSON.stringify([
        {
          comparison: 'gt',
          field: 'lastUpdated',
          value: params.updatedAfter.toISOString().split('T')[0],
        },
      ])
    }
    const res = await client.get<CashCtrlListResponse<CashCtrlOrder>>('order/list.json', query)
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new CashCtrlClient(credentials)
    const res = await client.get<CashCtrlSingleResponse<CashCtrlOrder>>('order/read.json', { id })
    return transformPurchaseOrder(res.data)
  }

  // ── Transactions (journal entries as transactions) ────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new CashCtrlClient(credentials)
    const query: Record<string, unknown> = this.paginationParams(params)
    if (params.updatedAfter) {
      query['filter'] = JSON.stringify([
        {
          comparison: 'gt',
          field: 'dateAdded',
          value: params.updatedAfter.toISOString().split('T')[0],
        },
      ])
    }
    const res = await client.get<CashCtrlListResponse<CashCtrlJournal>>(
      'journal/list.json',
      query,
    )
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new CashCtrlClient(credentials)
    const res = await client.get<CashCtrlSingleResponse<CashCtrlJournal>>(
      'journal/read.json',
      { id },
    )
    return transformTransaction(res.data)
  }
}
