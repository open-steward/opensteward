/**
 * Scopevisio OpenScope accounting adapter.
 *
 * Auth: api_key — the caller supplies a Scopevisio bearer token which is stored
 * as `credentials.accessToken` and sent as `Authorization: Bearer <token>`.
 *
 * Supported resources:
 *   - Organization    (GET /accountinginfo)
 *   - Invoices        (POST /outgoinginvoices, GET /outgoinginvoice/{number})
 *   - Bills           (POST /incominginvoices, GET /incominginvoice/{id})
 *   - Contacts        (POST /contacts, GET /contact/{id})
 *   - Accounts        (POST /impersonalaccounts)
 *   - Journals        (POST /journal — posting rows grouped by documentNumber)
 *   - CreditMemos     (POST /credits, GET /credit/{number})
 *   - Orders          (POST /dispatches, GET /dispatch/{number})
 *   - SalesOrders     (POST /offers, GET /offer/{number})
 *
 * Not supported (no matching Scopevisio endpoint):
 *   - Transactions, TaxRates, Expenses, PurchaseOrders
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: expense       — No expense/Spesen endpoint in the OpenScope API;
 *                              absent from swagger.json and the generated OpenApi client.
 * Unavailable: purchaseorder — No purchase-order endpoint; /orders is sales orders
 *                              (Aufträge) only; no Bestellung resource exists.
 * Unavailable: taxrate       — No standalone tax-rate resource; VAT codes are fields
 *                              on account records, not a queryable collection.
 * Unavailable: transaction   — No generic transaction endpoint; /journal posting rows
 *                              are already mapped to journals; /cashbooksheets do not
 *                              map to the canonical Transaction resource.
 *
 * Pagination: Scopevisio list endpoints use HTTP POST with a JSON body.
 * The body accepts `page` (1-based), `pageSize`, and optional `fields` array.
 * Results are under a `records` key.
 *
 * Docs: https://appload.scopevisio.com/static/swagger/index.html
 */

import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { Organization } from '../../schema/organization'

import { getAuthUrl, exchangeCode as doExchangeCode, refreshAccessToken } from './auth'
import { ScopevisioClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type ScopevisioOutgoingInvoice } from './transform/invoice'
import { transformBill, type ScopevisioIncomingInvoice } from './transform/bill'
import { transformContact, type ScopevisioContact } from './transform/contact'
import { transformAccount, type ScopevisioImpersonalAccount } from './transform/account'
import { transformJournalRows, type ScopevisioPostingRow } from './transform/journal'
import { transformOrganization, type ScopevisioAccountingInfo } from './transform/organization'
import { transformCreditMemo, type ScopevisioCredit } from './transform/creditmemo'
import { transformOrder, type ScopevisioDispatch } from './transform/order'
import { transformSalesOrder, type ScopevisioOffer } from './transform/salesorder'

// Connect Link form helper — single bearer-token field.
const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'Scopevisio API token',
  helpText:
    'Your Scopevisio bearer token. Obtain one via POST /token on the OpenScope REST API or from your account settings.',
})

/** Scopevisio pagination search-body */
interface SearchBody {
  page: number
  pageSize: number
  [key: string]: unknown
}

/** Generic Scopevisio list response */
interface ScopevisioListResponse<T> {
  records?: T[]
  rows?: T[]
}

export class ScopevisioAdapter implements AccountingAdapter {
  readonly platform = 'scopevisio'
  readonly version = '0.1.0'

  // Connect Link support — single api_key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  // ── Auth ────────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return getAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshAccessToken(credentials)
  }

  // ── Pagination ──────────────────────────────────────────────────────────────

  private searchBody(params: QueryParams, extra?: Record<string, unknown>): SearchBody {
    return {
      page: params.page ?? 1,
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      ...extra,
    }
  }

  // ── Organization ────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new ScopevisioClient(credentials)
    const res = await client.get<ScopevisioAccountingInfo>('accountinginfo')
    return transformOrganization(res)
  }

  // ── Invoices ────────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new ScopevisioClient(credentials)
    const res = await client.post<ScopevisioListResponse<ScopevisioOutgoingInvoice>>(
      'outgoinginvoices',
      this.searchBody(params),
    )
    return (res.records ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new ScopevisioClient(credentials)
    const res = await client.get<ScopevisioOutgoingInvoice>(`outgoinginvoice/${id}`)
    return transformInvoice(res)
  }

  // ── Bills (Incoming Invoices) ───────────────────────────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new ScopevisioClient(credentials)
    const res = await client.post<ScopevisioListResponse<ScopevisioIncomingInvoice>>(
      'incominginvoices',
      this.searchBody(params),
    )
    return (res.records ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new ScopevisioClient(credentials)
    const res = await client.get<ScopevisioIncomingInvoice>(`incominginvoice/${id}`)
    return transformBill(res)
  }

  // ── Contacts ────────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new ScopevisioClient(credentials)
    const res = await client.post<ScopevisioListResponse<ScopevisioContact>>(
      'contacts',
      this.searchBody(params),
    )
    return (res.records ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new ScopevisioClient(credentials)
    const res = await client.get<ScopevisioContact>(`contact/${id}`)
    return transformContact(res)
  }

  // ── Accounts ────────────────────────────────────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new ScopevisioClient(credentials)
    const res = await client.post<{ rows?: ScopevisioImpersonalAccount[] }>(
      'impersonalaccounts',
      this.searchBody(params),
    )
    return (res.rows ?? []).map(transformAccount)
  }

  // ── Journals (Posting rows) ─────────────────────────────────────────────────

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new ScopevisioClient(credentials)
    const res = await client.post<ScopevisioListResponse<ScopevisioPostingRow>>(
      'journal',
      this.searchBody(params),
    )
    const rows = res.records ?? []

    // Group posting rows by documentNumber to produce one Journal per document.
    const grouped = new Map<string, ScopevisioPostingRow[]>()
    for (const row of rows) {
      const key = row.documentNumber ?? '__ungrouped__'
      const bucket = grouped.get(key) ?? []
      bucket.push(row)
      grouped.set(key, bucket)
    }
    return Array.from(grouped.values()).map(transformJournalRows)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    // The journal search endpoint accepts a documentNumber filter.
    const client = new ScopevisioClient(credentials)
    const res = await client.post<ScopevisioListResponse<ScopevisioPostingRow>>('journal', {
      page: 1,
      pageSize: MAX_PAGE_SIZE,
      documentNumber: id,
    })
    const rows = res.records ?? []
    if (rows.length === 0) throw new Error(`Journal not found: ${id}`)
    return transformJournalRows(rows)
  }

  // ── Credit Memos ────────────────────────────────────────────────────────────

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new ScopevisioClient(credentials)
    const res = await client.post<ScopevisioListResponse<ScopevisioCredit>>(
      'credits',
      this.searchBody(params),
    )
    return (res.records ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new ScopevisioClient(credentials)
    const res = await client.get<ScopevisioCredit>(`credit/${id}`)
    return transformCreditMemo(res)
  }

  // ── Orders (Dispatches / Lieferscheine) ─────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ScopevisioClient(credentials)
    const res = await client.post<ScopevisioListResponse<ScopevisioDispatch>>(
      'dispatches',
      this.searchBody(params),
    )
    return (res.records ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ScopevisioClient(credentials)
    const res = await client.get<ScopevisioDispatch>(`dispatch/${id}`)
    return transformOrder(res)
  }

  // ── Sales Orders (Offers / Angebote) ────────────────────────────────────────

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new ScopevisioClient(credentials)
    const res = await client.post<ScopevisioListResponse<ScopevisioOffer>>(
      'offers',
      this.searchBody(params),
    )
    return (res.records ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new ScopevisioClient(credentials)
    const res = await client.get<ScopevisioOffer>(`offer/${id}`)
    return transformSalesOrder(res)
  }
}
