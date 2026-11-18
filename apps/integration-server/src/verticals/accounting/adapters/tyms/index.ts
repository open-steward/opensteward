/**
 * Tyms accounting adapter.
 *
 * Auth:  API key passed in the `secret-key` header (stored in `credentials.accessToken`).
 * Docs:  https://tyms.readme.io/reference/overview
 *
 * Supported resources:
 *   - Organization  (GET /api/v1/get/businesses, GET /api/v1/get/business/:id)
 *   - Invoice       (GET /api/v1/invoices, GET /api/v1/invoice/record/:ref, POST /api/v1/create/invoice)
 *   - Bill          (derived from expenses endpoint — Tyms has no separate vendor-bill resource)
 *   - Contact       (GET /api/v1/contacts, POST /api/v1/create/contact)
 *   - Account       (GET /api/v1/chart/accounts/:sub_type)
 *   - Journal       (GET /api/v1/journals, GET /api/v1/journal/:id, POST /api/v1/create/journal)
 *   - Expense       (GET /api/v1/expenses)
 *   - TaxRate       (GET /api/v1/taxes)
 *   - Transaction   (derived from sales endpoint — GET /api/v1/sales)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: creditmemo   — Tyms has no credit note / credit memo concept or endpoint
 * Unavailable: order        — Tyms has no generic order workflow; "Sales" are direct income records, not orders
 * Unavailable: salesorder   — Tyms has no sales order concept or endpoint
 * Unavailable: purchaseorder — Tyms has no purchase order concept or endpoint
 */

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Expense } from '../../schema/expense'
import type { TaxRate } from '../../schema/taxrate'
import type { Organization } from '../../schema/organization'
import type { Transaction } from '../../schema/transaction'

import {
  pageLocally,
  pageOffset,
  reportUpstreamPage,
  type UpstreamPageMeta,
} from '@opensteward/shared'

import { TymsClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type TymsInvoice } from './transform/invoice'
import { transformBill, type TymsExpense as TymsExpenseAsBill } from './transform/bill'
import { transformContact, type TymsContact } from './transform/contact'
import { transformAccount, type TymsAccount } from './transform/account'
import { transformJournal, untransformJournal, type TymsJournal } from './transform/journal'
import { transformExpense, type TymsExpense } from './transform/expense'
import { transformTaxRate, type TymsTaxRate } from './transform/taxrate'
import { transformOrganization, type TymsBusiness } from './transform/organization'
import { transformTransaction, type TymsSale } from './transform/transaction'

// ── Config ─────────────────────────────────────────────────────────────────────

interface TymsAdapterConfig {
  /** The Tyms API key (secret-key). */
  apiKey: string
}

// ── Tyms list-response envelope ────────────────────────────────────────────────

interface TymsListResponse<T> {
  data?: T[]
  // Tyms may wrap results under various keys; handled per-call below.
  [key: string]: unknown
}

/**
 * The Laravel length-aware paginator every documented Tyms list response
 * nests under `data` (see the `GET /taxes` 200 example at
 * https://tyms.readme.io/reference/taxes): the rows are `data.data`.
 */
interface TymsPaginator<T> {
  current_page?: number
  data?: T[]
  /** Null on the last page. */
  next_page_url?: string | null
  last_page?: number
  /** Laravel echoes the request's input here, so it can be a numeric string. */
  per_page?: number | string
  total?: number | string
}

interface TymsPage<T> {
  rows: T[]
  /** The documented paginator, when the body was one. */
  paginator?: TymsPaginator<T>
  /**
   * The body was a list with no paginator: a bare array or a flat
   * `{ data: [...] }`. That is what a Laravel API sends for a query it does
   * not paginate, and it holds every row: Tyms documents the shape for
   * `GET /chart/accounts/{sub_type}`
   * (https://tyms.readme.io/reference/get-coa-by-sub-type).
   */
  whole?: boolean
}

/** Rows from the documented paginated envelope, or a whole un-paginated list. */
function readTymsPage<T>(res: unknown): TymsPage<T> {
  if (Array.isArray(res)) return { rows: res as T[], whole: true }
  const data = (res as { data?: unknown } | null | undefined)?.data
  if (Array.isArray(data)) return { rows: data as T[], whole: true }
  if (data !== null && typeof data === 'object') {
    const paginator = data as TymsPaginator<T>
    if (Array.isArray(paginator.data)) return { rows: paginator.data, paginator }
  }
  return { rows: [] }
}

/** A whole number ≥ 0 from a paginator field, or undefined. */
function paginatorInt(value: unknown): number | undefined {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : undefined
}

/** Whether the paginator says another page exists, or undefined when it does not say. */
function tymsHasMore(paginator: TymsPaginator<unknown> | undefined): boolean | undefined {
  if (!paginator) return undefined
  if (paginator.next_page_url !== undefined) return paginator.next_page_url !== null
  const current = paginatorInt(paginator.current_page)
  const last = paginatorInt(paginator.last_page)
  return current !== undefined && last !== undefined ? current < last : undefined
}

/**
 * Report `hasMore` and the paginator's total. When the server served fewer
 * rows per page than `limit` asked for (`per_page` below it), the page is
 * that size: page N upstream is rows [(N-1)×per_page, N×per_page), and the
 * router and sync worker must judge its shortness at that size.
 */
function reportTymsPage(
  params: QueryParams,
  paginator: TymsPaginator<unknown> | undefined,
  limit: number,
  hasMore: boolean | undefined,
): void {
  const meta: UpstreamPageMeta = {}
  if (hasMore !== undefined) meta.hasMore = hasMore
  const total = paginatorInt(paginator?.total)
  if (total !== undefined) meta.totalCount = total
  const perPage = paginatorInt(paginator?.per_page)
  if (perPage !== undefined && perPage >= 1 && perPage < limit) meta.pageSize = perPage
  reportUpstreamPage(params, meta)
}

async function fetchTaxRatePage(
  client: TymsClient,
  page: number,
  limit: number,
): Promise<TymsPage<TymsTaxRate>> {
  return readTymsPage<TymsTaxRate>(await client.get<unknown>('taxes', { page, limit }))
}

interface TaxRateWindow {
  rows: TymsTaxRate[]
  hasMore: boolean | undefined
  /** The paginator of the last upstream page read. */
  paginator: TymsPaginator<unknown> | undefined
}

/**
 * The caller's rows [lo, lo + limit) when `GET /taxes` serves `size` rows a
 * page, more than `limit` asked for. The docs cannot rule that out: the
 * `/taxes` example shows `per_page` 20 against a documented default `limit`
 * of 10. Upstream page N then holds rows [(N-1)×size, N×size), not the
 * caller's page N, so this reads the upstream pages of `size` that cover the
 * caller's rows (at most two, since `size` > `limit`) and cuts them out.
 * `asked`, the page already fetched, is reused when it is one of them.
 */
async function taxRateWindow(
  client: TymsClient,
  params: QueryParams,
  limit: number,
  size: number,
  asked: { page: number; res: TymsPage<TymsTaxRate> },
): Promise<TaxRateWindow> {
  const lo = pageOffset(params, limit)
  let page = Math.floor(lo / size) + 1
  const skip = lo - (page - 1) * size
  const rows: TymsTaxRate[] = []
  let last: TymsPage<TymsTaxRate>
  for (;;) {
    last = page === asked.page ? asked.res : await fetchTaxRatePage(client, page, size)
    rows.push(...last.rows)
    if (rows.length >= skip + limit) break
    if (last.rows.length < size || tymsHasMore(last.paginator) === false) break
    page++
  }
  return {
    rows: rows.slice(skip, skip + limit),
    // A row past the caller's page is proof of more; otherwise the last page read says.
    hasMore: rows.length > skip + limit ? true : tymsHasMore(last.paginator),
    paginator: last.paginator,
  }
}

/**
 * A guard against a paginator that never ends; far past any real tax table
 * (10,000 rates at 50 a page), and under Tyms's documented rate limit of
 * "500 requests per minute per business"
 * (https://tyms.readme.io/reference/api-calls).
 */
const MAX_TAX_RATE_PAGES = 200

// ── Adapter ────────────────────────────────────────────────────────────────────

export class TymsAdapter implements AccountingAdapter {
  readonly platform = 'tyms'
  readonly version = '0.1.0'

  private apiKey: string

  constructor(config: TymsAdapterConfig) {
    this.apiKey = config.apiKey
  }

  /** Tyms uses a static API key — no OAuth exchange needed. */
  getAuthUrl(_state: string): string {
    throw new Error('TymsAdapter: OAuth not supported; use api_key credential flow')
  }

  /** Not applicable for API-key auth. */
  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('TymsAdapter: OAuth not supported; use api_key credential flow')
  }

  /** API keys do not expire — no-op refresh. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): TymsClient {
    return new TymsClient(credentials)
  }

  // ── Organization ─────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = this.client(credentials)
    // Returns a list; take the first business as the primary org.
    const res = await client.get<{ data?: TymsBusiness[]; [key: string]: unknown }>(
      'get/businesses',
    )
    const businesses = res.data ?? (Array.isArray(res) ? (res as unknown as TymsBusiness[]) : [])
    const first = businesses[0]
    if (!first) throw new Error('TymsAdapter: no business found')
    return transformOrganization(first)
  }

  // ── Invoices ──────────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = this.client(credentials)
    const res = await client.get<TymsListResponse<TymsInvoice> | TymsInvoice[]>('invoices', {
      page: params.page ?? 1,
      limit: params.limit ?? 50,
    })
    const items: TymsInvoice[] = Array.isArray(res)
      ? res
      : (res.data ?? [])
    return items.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = this.client(credentials)
    const res = await client.get<TymsListResponse<TymsInvoice> | TymsInvoice>(
      `invoice/record/${id}`,
    )
    // Could be wrapped or bare
    const raw: TymsInvoice = (res as TymsListResponse<TymsInvoice>).data?.[0]
      ?? (res as TymsInvoice)
    return transformInvoice(raw)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = this.client(credentials)
    const res = await client.post<TymsListResponse<TymsInvoice> | TymsInvoice>(
      'create/invoice',
      untransformInvoice(data),
    )
    const raw: TymsInvoice = (res as TymsListResponse<TymsInvoice>).data?.[0]
      ?? (res as TymsInvoice)
    return transformInvoice(raw)
  }

  // ── Bills (Expenses used as vendor bills) ─────────────────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = this.client(credentials)
    const res = await client.get<TymsListResponse<TymsExpenseAsBill> | TymsExpenseAsBill[]>(
      'expenses',
      {
        page: params.page ?? 1,
        limit: params.limit ?? 50,
      },
    )
    const items: TymsExpenseAsBill[] = Array.isArray(res)
      ? res
      : (res.data ?? [])
    return items.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = this.client(credentials)
    const res = await client.get<TymsListResponse<TymsExpenseAsBill> | TymsExpenseAsBill>(
      `expenses/${id}`,
    )
    const raw: TymsExpenseAsBill = (res as TymsListResponse<TymsExpenseAsBill>).data?.[0]
      ?? (res as TymsExpenseAsBill)
    return transformBill(raw)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = this.client(credentials)
    const res = await client.get<TymsListResponse<TymsContact> | TymsContact[]>('contacts', {
      page: params.page ?? 1,
      limit: params.limit ?? 50,
    })
    const items: TymsContact[] = Array.isArray(res)
      ? res
      : (res.data ?? [])
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = this.client(credentials)
    const res = await client.get<TymsListResponse<TymsContact> | TymsContact>(`contacts/${id}`)
    const raw: TymsContact = (res as TymsListResponse<TymsContact>).data?.[0]
      ?? (res as TymsContact)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = this.client(credentials)
    const body: Record<string, unknown> = {
      name: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      address: data.billingAddress?.address1,
      type: data.isSupplier && !data.isCustomer ? 'Vendor' : 'Customer',
    }
    const res = await client.post<TymsListResponse<TymsContact> | TymsContact>(
      'create/contact',
      body,
    )
    const raw: TymsContact = (res as TymsListResponse<TymsContact>).data?.[0]
      ?? (res as TymsContact)
    return transformContact(raw)
  }

  // ── Accounts (Chart of Accounts) ─────────────────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = this.client(credentials)
    // Tyms exposes accounts per sub_type; fetch all known sub_types and merge.
    const subtypes = ['Asset', 'Liability', 'Equity', 'Income', 'Expense']
    const results = await Promise.all(
      subtypes.map((st) =>
        client
          .get<TymsListResponse<TymsAccount> | TymsAccount[]>(`chart/accounts/${st}`, {
            page: params.page ?? 1,
            limit: params.limit ?? 50,
          })
          .then((res) => {
            const items: TymsAccount[] = Array.isArray(res) ? res : (res.data ?? [])
            return items.map(transformAccount)
          })
          .catch(() => [] as Account[]),
      ),
    )
    return results.flat()
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    // Tyms has no single-account lookup by uuid; fetch all accounts and filter.
    const accounts = await this.listAccounts(credentials, {})
    const found = accounts.find((a) => a.id === id)
    if (!found) throw new Error(`TymsAdapter: account not found: ${id}`)
    return found
  }

  // ── Journals ──────────────────────────────────────────────────────────────────

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = this.client(credentials)
    const res = await client.get<TymsListResponse<TymsJournal> | TymsJournal[]>('journals', {
      page: params.page ?? 1,
      limit: params.limit ?? 50,
    })
    const items: TymsJournal[] = Array.isArray(res)
      ? res
      : (res.data ?? [])
    return items.map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = this.client(credentials)
    const res = await client.get<TymsListResponse<TymsJournal> | TymsJournal>(`journal/${id}`)
    const raw: TymsJournal = (res as TymsListResponse<TymsJournal>).data?.[0]
      ?? (res as TymsJournal)
    return transformJournal(raw)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = this.client(credentials)
    const res = await client.post<TymsListResponse<TymsJournal> | TymsJournal>(
      'create/journal',
      untransformJournal(data),
    )
    const raw: TymsJournal = (res as TymsListResponse<TymsJournal>).data?.[0]
      ?? (res as TymsJournal)
    return transformJournal(raw)
  }

  // ── Expenses ──────────────────────────────────────────────────────────────────

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = this.client(credentials)
    const res = await client.get<TymsListResponse<TymsExpense> | TymsExpense[]>('expenses', {
      page: params.page ?? 1,
      limit: params.limit ?? 50,
    })
    const items: TymsExpense[] = Array.isArray(res)
      ? res
      : (res.data ?? [])
    return items.map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = this.client(credentials)
    const res = await client.get<TymsListResponse<TymsExpense> | TymsExpense>(`expenses/${id}`)
    const raw: TymsExpense = (res as TymsListResponse<TymsExpense>).data?.[0]
      ?? (res as TymsExpense)
    return transformExpense(raw)
  }

  // ── Tax Rates ─────────────────────────────────────────────────────────────────

  /**
   * One page of `GET /taxes`, by the documented `page` and `limit`
   * (https://tyms.readme.io/reference/authentication, "Pagination"). No
   * maximum `limit` is documented, so the caller's is sent as is. A server
   * that serves fewer rows a page reports that size; one that serves more
   * is re-cut to the caller's rows by `taxRateWindow`.
   */
  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page = params.page ?? 1
    const client = this.client(credentials)
    const res = await fetchTaxRatePage(client, page, limit)
    // A list with no paginator is every row: serve the caller's page of it.
    if (res.whole) return pageLocally(res.rows, params).map(transformTaxRate)
    const size = paginatorInt(res.paginator?.per_page) ?? res.rows.length
    if (size <= limit) {
      if (res.paginator) reportTymsPage(params, res.paginator, limit, tymsHasMore(res.paginator))
      return res.rows.map(transformTaxRate)
    }
    // The server pages at `size` > limit, whatever `limit` asked for.
    const window = await taxRateWindow(client, params, limit, size, { page, res })
    reportTymsPage(params, window.paginator, limit, window.hasMore)
    return window.rows.map(transformTaxRate)
  }

  /**
   * Tyms has no single-tax lookup, so this walks `GET /taxes` until the rate
   * or the last page. A page that repeats the one before it means the server
   * is ignoring `page`, and the walk stops there instead of spending its
   * budget against the rate limit.
   */
  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = this.client(credentials)
    let previous: string | undefined
    for (let page = 1; page <= MAX_TAX_RATE_PAGES; page++) {
      const res = await fetchTaxRatePage(client, page, DEFAULT_PAGE_SIZE)
      const found = res.rows.find((r) => r.uuid === id)
      if (found) return transformTaxRate(found)
      if (res.rows.length === 0 || tymsHasMore(res.paginator) !== true) {
        throw new Error(`TymsAdapter: tax rate not found: ${id}`)
      }
      const ids = res.rows.map((r) => r.uuid).join('\u0000')
      if (ids === previous) {
        throw new Error(
          `TymsAdapter: GET taxes served page ${page} with the rows of page ${page - 1}, so it is ` +
            `ignoring \`page\`; tax rate ${id} is not on the first page`,
        )
      }
      previous = ids
    }
    throw new Error(
      `TymsAdapter: tax rate ${id} not found in the first ${MAX_TAX_RATE_PAGES} pages of taxes`,
    )
  }

  // ── Transactions (derived from Sales endpoint) ─────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = this.client(credentials)
    const res = await client.get<TymsListResponse<TymsSale> | TymsSale[]>('sales', {
      page: params.page ?? 1,
      limit: params.limit ?? 50,
    })
    const items: TymsSale[] = Array.isArray(res)
      ? res
      : (res.data ?? [])
    return items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = this.client(credentials)
    const res = await client.get<TymsListResponse<TymsSale> | TymsSale>(`sales/${id}`)
    const raw: TymsSale = (res as TymsListResponse<TymsSale>).data?.[0]
      ?? (res as TymsSale)
    return transformTransaction(raw)
  }
}
