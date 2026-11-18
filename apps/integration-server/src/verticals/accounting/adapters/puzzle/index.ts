/**
 * Puzzle accounting adapter.
 *
 * Supported resources:
 *   - Organization  (GET /companies)
 *   - Invoices      (CRUD  /company/{id}/invoices)
 *   - Bills         (CRUD  /company/{id}/bills)
 *   - Contacts      (customers + vendors)
 *   - Accounts      (GET   /company/{id}/chartOfAccounts)
 *   - Journals      (GET   /company/{id}/journalEntries)
 *   - Transactions  (GET   /company/{id}/transactions)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: creditmemo    — Puzzle public API has no credit memo endpoint; concept not exposed via REST.
 * Unavailable: expense       — Puzzle exposes only aggregate expense metrics (reporting), not individual expense records.
 * Unavailable: order         — Puzzle public API has no order endpoint; orders are not a supported concept.
 * Unavailable: purchaseorder — Puzzle public API has no purchase order endpoint; concept not supported.
 * Unavailable: salesorder    — Puzzle public API has no sales order endpoint; concept not supported.
 * Unavailable: taxrate       — Puzzle public API has no tax rate management endpoint; tax rates not exposed via REST.
 */

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Transaction } from '../../schema/transaction'
import type { Organization } from '../../schema/organization'

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { PuzzleClient, type PuzzlePageInfo } from './client'
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SCOPES,
  TRANSACTIONS_END_DATE,
  TRANSACTIONS_START_DATE,
} from './constants'

import { transformInvoice, untransformInvoice, type PuzzleInvoice } from './transform/invoice'
import { transformBill, untransformBill, type PuzzleBill } from './transform/bill'
import { transformCustomer, transformVendor, type PuzzleCustomer, type PuzzleVendor } from './transform/contact'
import { transformAccount, type PuzzleAccount } from './transform/account'
import { transformOrganization, type PuzzleCompany } from './transform/organization'
import { transformJournal, type PuzzleLedgerJournal } from './transform/journal'
import { transformTransaction, type PuzzleTransaction } from './transform/transaction'

interface PuzzleAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** A page of a count/after endpoint (invoices, bills, customers, vendors, transactions). */
interface PuzzlePageResult<T> {
  items?: T[]
  pageInfo?: PuzzlePageInfo
}

/** A page of GET /company/{id}/journalEntries, the one limit/cursor endpoint. */
interface PuzzleJournalPage {
  journalEntries?: PuzzleLedgerJournal[]
  pageInfo?: { nextCursor?: string | null }
}

/** The count/after collections a caller page maps onto one upstream page. */
type AfterCollection = 'invoices' | 'bills' | 'transactions'

type ContactEndpoint = 'customers' | 'vendors'

/**
 * A position in the contacts stream, customers first, then vendors:
 * `customers:<after>`, `vendors:` (the first vendors page) or
 * `vendors:<after>`. Undefined is the first customers page.
 *
 * A string and not an object, so the row pager can compare two of them: a
 * page that names itself as the next one (an `endCursor` equal to the `after`
 * it was sent) then stops the walk at once, instead of spending the pager's
 * whole budget of upstream requests on one caller page.
 */
type ContactCursor = `${ContactEndpoint}:${string}`

function contactCursor(endpoint: ContactEndpoint, after?: string): ContactCursor {
  return `${endpoint}:${after ?? ''}`
}

function readContactCursor(cursor: ContactCursor | undefined): {
  endpoint: ContactEndpoint
  after?: string
} {
  if (cursor === undefined) return { endpoint: 'customers' }
  const at = cursor.indexOf(':')
  const endpoint = cursor.slice(0, at) as ContactEndpoint
  const after = cursor.slice(at + 1)
  return after === '' ? { endpoint } : { endpoint, after }
}

/**
 * The `after` that starts the next page, or undefined on the last one.
 *
 * `hasNextPage` alone says whether there is one: `endCursor` is the cursor of
 * the last row served and may be present on the last page too. A page that
 * says there is more but gives no cursor cannot be followed, and ending the
 * collection there would mark a truncated collection complete, so it throws.
 */
function nextAfter(path: string, pageInfo: PuzzlePageInfo | undefined): string | undefined {
  if (pageInfo?.hasNextPage !== true) return undefined
  if (!pageInfo.endCursor)
    throw new Error(`Puzzle: ${path} reported hasNextPage with no endCursor to continue from`)
  return pageInfo.endCursor
}

export class PuzzleAdapter implements AccountingAdapter {
  readonly platform = 'puzzle'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: PuzzleAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    const creds = await refreshAccessToken(
      credentials.refreshToken,
      this.clientId,
      this.clientSecret,
    )
    // Preserve tenantId (company ID stored here)
    creds.tenantId = credentials.tenantId
    return creds
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private companyId(credentials: Credentials): string {
    const id = credentials.tenantId
    if (!id) throw new Error('Puzzle: tenantId (company ID) is required in credentials')
    return id
  }

  /**
   * The caller's page size, sent upstream as is. Neither `count` nor
   * journalEntries' `limit` documents a maximum (both are a bare integer in
   * every spec), so there is nothing to clamp to.
   *
   * No limit is the default page. A limit that is not a number >= 1 is
   * refused, as the shared row pager behind listContacts refuses it, rather
   * than guessed at: one adapter should not serve 50 rows on one list and
   * throw on another for the same params.
   */
  private pageSize(params: QueryParams): number {
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    if (!Number.isFinite(asked) || asked < 1)
      throw new RangeError(`Puzzle: limit must be a number >= 1 (got ${String(asked)})`)
    return Math.floor(asked)
  }

  /**
   * Caller page `params.page` of a count/after collection, one upstream page
   * to one caller page at `count` = the caller's limit. Puzzle has no offset:
   * page N is reached by carrying each page's `endCursor` forward as `after`,
   * which the shared cursor pager remembers per connection.
   *
   * GET /company/{id}/{invoices,bills,transactions} document `count` and
   * `after` and answer `pageInfo { endCursor, hasNextPage, total }`
   * (https://puzzle-api.readme.io/reference/invoicesapi.md, billsapi.md,
   * gettransactions.md). `filters` are sent on every page and are part of the
   * pager key, because a cursor minted under one filter is a different
   * position under another.
   */
  private async listByAfter<T>(
    credentials: Credentials,
    params: QueryParams,
    collection: AfterCollection,
    filters: Record<string, string> = {},
  ): Promise<T[]> {
    const client = new PuzzleClient(credentials)
    const companyId = this.companyId(credentials)
    const path = `/company/${companyId}/${collection}`
    const count = this.pageSize(params)
    const query = { ...filters, count }
    // `pageInfo.total` of the last page fetched, when Puzzle sent one.
    const seen: { total?: number } = {}
    const { items, hasMore } = await pageByCursor<T, string>(
      cursorPagerKey(connectionScope(companyId, credentials), collection, query),
      params.page,
      async (after) => {
        const res = await client.get<PuzzlePageResult<T>>(
          path,
          after === undefined ? query : { ...query, after },
        )
        const total = res.pageInfo?.total
        seen.total = typeof total === 'number' ? total : undefined
        return { items: res.items ?? [], next: nextAfter(path, res.pageInfo) }
      },
    )
    // The spec gives `pageInfo.total` no description, and the router's
    // meta.hasMore trusts a total over the reported flag. So a total is
    // published only where it agrees with the rows this page holds and with
    // `hasNextPage`: a total that meant something else, or a page Puzzle cut
    // short of `count`, must not end an API walk that hasNextPage continues.
    const total = seen.total
    const served = pageOffset(params, count) + items.length
    const agrees =
      total !== undefined && (hasMore ? items.length === count && served < total : served === total)
    reportUpstreamPage(params, agrees ? { hasMore, totalCount: total } : { hasMore })
    return items
  }

  // ── Organization ───────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new PuzzleClient(credentials)
    const res = await client.get<{ companies: PuzzleCompany[] }>('/companies')
    const company =
      res.companies.find((c) => c.id === credentials.tenantId) ?? res.companies[0]
    if (!company) throw new Error('Puzzle: no company found')
    return transformOrganization(company)
  }

  // ── Invoices ───────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const rows = await this.listByAfter<PuzzleInvoice>(credentials, params, 'invoices')
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new PuzzleClient(credentials)
    const companyId = this.companyId(credentials)
    const res = await client.get<PuzzleInvoice>(`/company/${companyId}/invoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new PuzzleClient(credentials)
    const companyId = this.companyId(credentials)
    const res = await client.post<{ invoice: PuzzleInvoice }>(
      `/company/${companyId}/invoices`,
      untransformInvoice(data, companyId),
    )
    return transformInvoice(res.invoice)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new PuzzleClient(credentials)
    const companyId = this.companyId(credentials)
    const res = await client.put<{ invoice: PuzzleInvoice }>(
      `/company/${companyId}/invoices/${id}`,
      {
        ...untransformInvoice(data, companyId),
        id,
      },
    )
    return transformInvoice(res.invoice)
  }

  // ── Bills ──────────────────────────────────────────────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const rows = await this.listByAfter<PuzzleBill>(credentials, params, 'bills')
    return rows.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new PuzzleClient(credentials)
    const companyId = this.companyId(credentials)
    const res = await client.get<PuzzleBill>(`/company/${companyId}/bills/${id}`)
    return transformBill(res)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new PuzzleClient(credentials)
    const companyId = this.companyId(credentials)
    const res = await client.post<PuzzleBill>(
      `/company/${companyId}/bills`,
      untransformBill(data, companyId),
    )
    return transformBill(res)
  }

  async updateBill(credentials: Credentials, id: string, data: Partial<Bill>): Promise<Bill> {
    const client = new PuzzleClient(credentials)
    const companyId = this.companyId(credentials)
    const res = await client.put<PuzzleBill>(
      `/company/${companyId}/bills/${id}`,
      {
        ...untransformBill(data, companyId),
        id,
      },
    )
    return transformBill(res)
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  /**
   * Contacts are one stream: every customer, then every vendor. Each is its
   * own count/after chain (https://puzzle-api.readme.io/reference/customersapi.md,
   * vendors-1.md), so a caller page can straddle the two and one upstream
   * page is not one caller page. The row pager walks customers until
   * `hasNextPage` is false, then vendors, and cuts exactly the caller's rows
   * out of them, reporting `hasMore` itself.
   *
   * No `totalCount`: a page need not have fetched both endpoints, so the sum
   * of their totals is not known on every page.
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new PuzzleClient(credentials)
    const companyId = this.companyId(credentials)
    const count = this.pageSize(params)
    const { items } = await pageByRows<Contact, ContactCursor>(
      cursorPagerKey(connectionScope(companyId, credentials), 'contacts', { count }),
      params,
      async (cursor) => {
        const { endpoint, after: from } = readContactCursor(cursor)
        const path = `/company/${companyId}/${endpoint}`
        const query = from === undefined ? { count } : { count, after: from }
        let rows: Contact[]
        let pageInfo: PuzzlePageInfo | undefined
        if (endpoint === 'customers') {
          const res = await client.get<PuzzlePageResult<PuzzleCustomer>>(path, query)
          rows = (res.items ?? []).map(transformCustomer)
          pageInfo = res.pageInfo
        } else {
          const res = await client.get<PuzzlePageResult<PuzzleVendor>>(path, query)
          rows = (res.items ?? []).map(transformVendor)
          pageInfo = res.pageInfo
        }
        const after = nextAfter(path, pageInfo)
        const next: ContactCursor | undefined =
          after !== undefined
            ? contactCursor(endpoint, after)
            : endpoint === 'customers'
              ? contactCursor('vendors')
              : undefined
        return { items: rows, next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new PuzzleClient(credentials)
    const companyId = this.companyId(credentials)
    // Try customer first, fall back to vendor
    if (id.startsWith('vend_')) {
      const res = await client.get<PuzzleVendor>(`/company/${companyId}/vendors/${id.slice(5)}`)
      return transformVendor(res)
    }
    const res = await client.get<PuzzleCustomer>(`/company/${companyId}/customers/${id}`)
    return transformCustomer(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new PuzzleClient(credentials)
    const companyId = this.companyId(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<PuzzleVendor>(`/company/${companyId}/vendors`, {
        companyId,
        name: data.name ?? data.companyName ?? '',
        description: data.identification,
        type: data.companyName ? 'Business' : 'Individual',
      })
      return transformVendor(res)
    }
    const res = await client.post<PuzzleCustomer>(`/company/${companyId}/customers`, {
      companyId,
      name: data.name ?? data.companyName ?? '',
      email: data.emails?.[0]?.email,
      phoneNumber: data.telephones?.[0]?.telephone,
      companyName: data.companyName,
      type: data.companyName ? 'Business' : 'Individual',
      billingAddressJson: data.billingAddress
        ? {
            street: data.billingAddress.address1,
            street2: data.billingAddress.address2,
            city: data.billingAddress.city,
            state: data.billingAddress.region,
            zip: data.billingAddress.postalCode,
            country: data.billingAddress.country,
          }
        : undefined,
    })
    return transformCustomer(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new PuzzleClient(credentials)
    const companyId = this.companyId(credentials)
    if (id.startsWith('vend_')) {
      const res = await client.put<PuzzleVendor>(`/company/${companyId}/vendors/${id.slice(5)}`, {
        companyId,
        id: id.slice(5),
        name: data.name,
      })
      return transformVendor(res)
    }
    const res = await client.put<PuzzleCustomer>(`/company/${companyId}/customers/${id}`, {
      companyId,
      id,
      name: data.name,
      email: data.emails?.[0]?.email,
      phoneNumber: data.telephones?.[0]?.telephone,
    })
    return transformCustomer(res)
  }

  // ── Accounts ───────────────────────────────────────────────────────────────

  /**
   * The chart of accounts comes back whole: the endpoint documents no paging
   * parameter and "By default, all accounts are returned"
   * (https://puzzle-api.readme.io/reference/chartofaccounts.md). The caller's
   * page is sliced from it.
   */
  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new PuzzleClient(credentials)
    const companyId = this.companyId(credentials)
    const res = await client.get<{ accounts?: PuzzleAccount[] }>(
      `/company/${companyId}/chartOfAccounts`,
    )
    return pageLocally((res.accounts ?? []).map(transformAccount), params)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new PuzzleClient(credentials)
    const companyId = this.companyId(credentials)
    // Puzzle returns the full chart; filter to the requested account
    const res = await client.get<{ accounts: PuzzleAccount[] }>(
      `/company/${companyId}/chartOfAccounts`,
    )
    const account = res.accounts.find((a) => a.id === id || a.permaId === id)
    if (!account) throw new Error(`Puzzle: account ${id} not found`)
    return transformAccount(account)
  }

  // ── Journals ───────────────────────────────────────────────────────────────

  /**
   * Journal entries use the other dialect: `limit` and `cursor`, answered with
   * `pageInfo { nextCursor }`, null on the last page and with no total
   * (https://puzzle-api.readme.io/reference/journalentries-1.md).
   */
  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new PuzzleClient(credentials)
    const companyId = this.companyId(credentials)
    const limit = this.pageSize(params)
    const { items, hasMore } = await pageByCursor<PuzzleLedgerJournal, string>(
      cursorPagerKey(connectionScope(companyId, credentials), 'journalEntries', { limit }),
      params.page,
      async (cursor) => {
        const res = await client.get<PuzzleJournalPage>(
          `/company/${companyId}/journalEntries`,
          cursor === undefined ? { limit } : { limit, cursor },
        )
        return { items: res.journalEntries ?? [], next: res.pageInfo?.nextCursor || undefined }
      },
    )
    reportUpstreamPage(params, { hasMore })
    return items.map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new PuzzleClient(credentials)
    const companyId = this.companyId(credentials)
    const res = await client.get<{ journalEntries: PuzzleLedgerJournal[] }>(
      `/company/${companyId}/journalEntries`,
    )
    const entry = res.journalEntries.find((j) => j.id === id)
    if (!entry) throw new Error(`Puzzle: journal entry ${id} not found`)
    return transformJournal(entry)
  }

  // ── Transactions ───────────────────────────────────────────────────────────

  /**
   * GET /company/{id}/transactions marks `startDate` and `endDate`
   * (YYYY-MM-DD) `"required": true`
   * (https://puzzle-api.readme.io/reference/gettransactions.md). The unified
   * API has no date filter to take them from, so a list asks for every date.
   */
  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const rows = await this.listByAfter<PuzzleTransaction>(credentials, params, 'transactions', {
      startDate: TRANSACTIONS_START_DATE,
      endDate: TRANSACTIONS_END_DATE,
    })
    return rows.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new PuzzleClient(credentials)
    const companyId = this.companyId(credentials)
    const res = await client.get<PuzzleTransaction>(`/company/${companyId}/transactions/${id}`)
    return transformTransaction(res)
  }
}
