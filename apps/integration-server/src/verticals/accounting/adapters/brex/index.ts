/**
 * Brex accounting adapter.
 *
 * Supported resources:
 *   - Organization  (GET /v2/company)
 *   - Accounts      (GET /v2/accounts/cash, GET /v2/accounts/cash/{id})
 *   - Transactions  (GET /v2/transactions/cash/{id}, GET /v2/transactions/card/primary)
 *   - Contacts      (GET/POST /v1/vendors)
 *   - Expenses      (GET /v1/expenses/card)
 *   - Bills         (GET /v3/accounting/records — Alpha API, source_type=BILL variants)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: invoice     — Brex is a corporate-card/spend platform; no A/R invoice concept or endpoint exists
 * Unavailable: creditmemo  — Brex has no credit-memo concept or endpoint
 * Unavailable: journal     — Brex does not expose a journal-entry write/read endpoint in its public API
 * Unavailable: taxrate     — Brex has no tax-rate management endpoint; tax codes are configured inside connected ERPs
 * Unavailable: order       — Brex has no generic order concept or endpoint
 * Unavailable: salesorder  — Brex has no sales-order concept or endpoint
 * Unavailable: purchaseorder — Brex has no purchase-order concept or endpoint
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Account } from '../../schema/account'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Expense } from '../../schema/expense'
import type { Organization } from '../../schema/organization'
import type { Transaction } from '../../schema/transaction'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { BrexClient, type BrexPage } from './client'
import {
  ACCOUNTING_RECORDS_MAX_PAGE_SIZE,
  BREX_DEFAULT_SCOPES,
  CARD_EXPENSES_MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  LIST_MAX_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './constants'

import { transformAccount, type BrexCashAccount } from './transform/account'
import { transformAccountingRecordToBill, type BrexAccountingRecord } from './transform/bill'
import { transformVendor, untransformVendor, type BrexVendor } from './transform/contact'
import { transformCashTransaction, transformCardTransaction, type BrexCashTransaction, type BrexCardTransaction } from './transform/transaction'
import { transformExpense, type BrexCardExpense } from './transform/expense'
import { transformOrganization, type BrexCompany } from './transform/organization'
import { brexWebhook } from './webhook'

interface BrexAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/**
 * A position in the transaction stream: the card list at a `next_cursor`, or
 * one cash account's list (at its own `next_cursor`, or its first page) with
 * the cash accounts still to read after it. Cursors are per list, so each
 * position names the list it belongs to.
 */
type TransactionCursor = { card: string } | { cash: string; cursor?: string; after: string[] }

/**
 * Pager scope for one connection. Brex credentials carry no company id, so
 * the connection is told apart by the fingerprint `connectionScope` takes of
 * its token, never by the token itself.
 */
function pagerScope(credentials: Credentials): string {
  return connectionScope('brex', credentials)
}

/**
 * The `next_cursor` of a page of `path` fetched with cursor `sent`, or
 * undefined at the end (`nil`, or an empty string).
 *
 * A page that names the cursor it was fetched with as its next one would be
 * fetched again forever. `pageByRows` refuses such a page itself, but it
 * compares cursors by identity, and the transaction stream's positions are
 * fresh objects on every page, so the check is made here on Brex's own string.
 */
function nextCursor(
  path: string,
  sent: string | undefined,
  page: BrexPage<unknown>,
): string | undefined {
  const next = page.next_cursor || undefined
  if (next !== undefined && next === sent)
    throw new Error(
      `Brex ${path} returned the cursor it was sent as its next_cursor; following it would loop`,
    )
  return next
}

export class BrexAdapter implements AccountingAdapter {
  readonly platform = 'brex'
  readonly version = '0.1.0'
  /**
   * The lowest documented `limit` ceiling of any list (GET /v1/expenses/card,
   * "can't be greater than 100"), so every list sends the size it is asked
   * for. A direct call above an endpoint's own ceiling is clamped to it and
   * reports the size it sent.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: BrexAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? BREX_DEFAULT_SCOPES
  }

  // ── Auth ─────────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  // ── Webhooks ─────────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return brexWebhook.verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return brexWebhook.parseWebhookEvents(payload)
  }

  // ── Paging ───────────────────────────────────────────────────────────────────

  /**
   * The caller's page of one cursor-paged list: `limit` and `cursor` in,
   * `items` and `next_cursor` out (https://developer.brex.com/guides/pagination.md:
   * "The response will contain an array of items and a `next_cursor`, which
   * can be passed back in as cursor to fetch the next set of items. The
   * `next_cursor` is `nil` once the end of the set is reached.").
   *
   * One upstream page is one caller page, so `pageByCursor` walks the chain to
   * page `page` and remembers where each page starts. The list used to read
   * `params.cursor`, which the router never sets, so page 2 was page 1 again.
   * The size is the caller's limit, clamped to the endpoint's documented
   * `max`; a clamped page reports the size it sent, so it is judged at it.
   *
   * GET /v3/accounting/records also answers `has_next_page` ("Whether there
   * are more results available") and `total_count` ("Total count of records
   * matching the query"). A `has_next_page` of false ends the list whatever
   * `next_cursor` says, and `total_count` is reported as the total. The other
   * lists carry neither field.
   */
  private async cursorList<R>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    max: number,
    filters: Record<string, unknown> = {},
  ): Promise<R[]> {
    const client = new BrexClient(credentials)
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, max)
    let totalCount: number | undefined
    const { items, hasMore } = await pageByCursor<R, string>(
      cursorPagerKey(pagerScope(credentials), path, { ...filters, limit: size }),
      params.page,
      async (cursor) => {
        const page = await client.listPage<R>(path, size, cursor, filters)
        totalCount = typeof page.total_count === 'number' ? page.total_count : undefined
        const next = page.has_next_page === false ? undefined : nextCursor(path, cursor, page)
        return { items: page.items ?? [], next }
      },
    )
    reportUpstreamPage(params, {
      hasMore,
      ...(totalCount !== undefined ? { totalCount } : {}),
      ...(params.limit !== undefined && size < params.limit ? { pageSize: size } : {}),
    })
    return items
  }

  /**
   * Every cash account. GET /v2/accounts/cash documents no query parameters
   * ("This endpoint lists all the existing cash accounts with their status."),
   * so none are sent. Its response still has a `next_cursor`, and the
   * pagination guide says a `next_cursor` "can be passed back in as cursor",
   * so a non-null one is followed rather than dropping the accounts after it.
   *
   * Because the endpoint takes no `cursor`, it may ignore one and answer with
   * the same accounts again. So a followed cursor that brings no account not
   * already held ends the list: either the cursor was ignored, or there is
   * nothing past it. An account is kept once, however often it comes back.
   * Only a cursor that repeats while still bringing new accounts would never
   * end, and that throws.
   */
  private async allCashAccounts(client: BrexClient): Promise<BrexCashAccount[]> {
    const accounts = new Map<string, BrexCashAccount>()
    const followed = new Set<string>()
    let cursor: string | undefined
    for (;;) {
      const page = await client.get<BrexPage<BrexCashAccount>>(
        '/v2/accounts/cash',
        cursor ? { cursor } : undefined,
      )
      const held = accounts.size
      for (const account of page.items ?? [])
        if (!accounts.has(account.id)) accounts.set(account.id, account)
      const next = page.next_cursor || undefined
      if (next === undefined || (cursor !== undefined && accounts.size === held))
        return [...accounts.values()]
      if (followed.has(next))
        throw new Error(
          'Brex /v2/accounts/cash keeps returning new accounts under a next_cursor it already followed; following it would loop',
        )
      followed.add(next)
      cursor = next
    }
  }

  // ── Organization ─────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new BrexClient(credentials)
    const raw = await client.get<BrexCompany>('/v2/company')
    return transformOrganization(raw)
  }

  // ── Accounts (cash) ──────────────────────────────────────────────────────────

  /** The whole cash-account list (see {@link allCashAccounts}), sliced to the caller's page. */
  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const accounts = await this.allCashAccounts(new BrexClient(credentials))
    return pageLocally(accounts.map(transformAccount), params)
  }

  /**
   * GET /v2/accounts/cash/{id}: "This endpoint returns the cash account
   * associated with the provided ID with its status."
   */
  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new BrexClient(credentials)
    const raw = await client.get<BrexCashAccount>(`/v2/accounts/cash/${encodeURIComponent(id)}`)
    return transformAccount(raw)
  }

  // ── Transactions ─────────────────────────────────────────────────────────────

  /**
   * Card transactions, then each cash account's, as one stream.
   *
   * GET /v2/transactions/card/primary and GET /v2/transactions/cash/{id} each
   * take `cursor`, `limit` and `posted_at_start` and return their own
   * `next_cursor`. The stream reads the card list to its end, then each cash
   * account's list in the order GET /v2/accounts/cash returns them, each by
   * its own cursor, and `pageByRows` cuts exactly the caller's rows out of it
   * with `hasMore` exact. This used to send one caller cursor to every list
   * and return up to `limit` rows from each of them on one page.
   *
   * Each upstream page is sized by the caller's limit, clamped to the guide's
   * 1000, so the size is in the key; the rows served per page are always the
   * caller's limit.
   */
  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new BrexClient(credentials)
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, LIST_MAX_PAGE_SIZE)
    const filters: Record<string, unknown> = params.updatedAfter
      ? { posted_at_start: params.updatedAfter.toISOString() }
      : {}
    const { items } = await pageByRows<Transaction, TransactionCursor>(
      cursorPagerKey(
        pagerScope(credentials),
        '/v2/transactions/card/primary+/v2/transactions/cash/{id}',
        { ...filters, limit: size },
      ),
      params,
      async (at) => {
        if (at === undefined || 'card' in at) {
          const path = '/v2/transactions/card/primary'
          const page = await client.listPage<BrexCardTransaction>(path, size, at?.card, filters)
          const cursor = nextCursor(path, at?.card, page)
          let next: TransactionCursor | undefined
          if (cursor !== undefined) next = { card: cursor }
          else {
            const [first, ...after] = (await this.allCashAccounts(client)).map((a) => a.id)
            next = first === undefined ? undefined : { cash: first, after }
          }
          return { items: (page.items ?? []).map(transformCardTransaction), next }
        }
        const path = `/v2/transactions/cash/${at.cash}`
        const page = await client.listPage<BrexCashTransaction>(path, size, at.cursor, filters)
        const cursor = nextCursor(path, at.cursor, page)
        const [following, ...after] = at.after
        const next: TransactionCursor | undefined =
          cursor !== undefined
            ? { cash: at.cash, cursor, after: at.after }
            : following === undefined
              ? undefined
              : { cash: following, after }
        return { items: (page.items ?? []).map(transformCashTransaction), next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  /**
   * Brex documents no single-transaction GET, so this searches the first page
   * (100 rows) of the card list and of each cash account's list. A transaction
   * further down any list is reported as not found.
   */
  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new BrexClient(credentials)
    const page = await client.listPage<BrexCardTransaction>('/v2/transactions/card/primary', 100)
    const found = page.items.find((t) => t.id === id)
    if (found) return transformCardTransaction(found)

    // Search cash accounts: the whole account list, which documents no parameters.
    for (const account of await this.allCashAccounts(client)) {
      const txnPage = await client.listPage<BrexCashTransaction>(
        `/v2/transactions/cash/${account.id}`,
        100,
      )
      const cashFound = txnPage.items.find((t) => t.id === id)
      if (cashFound) return transformCashTransaction(cashFound)
    }

    throw new Error(`Brex transaction not found: ${id}`)
  }

  // ── Contacts (vendors) ───────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const vendors = await this.cursorList<BrexVendor>(
      credentials,
      params,
      '/v1/vendors',
      LIST_MAX_PAGE_SIZE,
    )
    return vendors.map(transformVendor)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new BrexClient(credentials)
    const raw = await client.get<BrexVendor>(`/v1/vendors/${id}`)
    return transformVendor(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new BrexClient(credentials)
    const raw = await client.post<BrexVendor>('/v1/vendors', untransformVendor(data))
    return transformVendor(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new BrexClient(credentials)
    const raw = await client.patch<BrexVendor>(`/v1/vendors/${id}`, untransformVendor(data))
    return transformVendor(raw)
  }

  // ── Bills (accounting records, Alpha API) ────────────────────────────────────
  //
  // Endpoint: GET /v3/accounting/records
  // Requires the `accounting.record.read` OAuth scope (accounting_api.yaml) and
  // Alpha-program enrollment. BREX_DEFAULT_SCOPES does not request that scope.
  // Only BILL_EXPENSE / BILL_EXPENSE_PAYMENT / BILL_EXPENSE_CARD_PAYMENT records
  // are returned; all Brex spend is in minor units (cents).

  /**
   * `updatedAfter` is sent as `updated_at[gte]`. `updated_at` is a range
   * object (queryaccountingrecords.md: "Accepts gt (greater than), gte
   * (greater than or equal), lt (less than), lte (less than or equal).
   * Example: updated_at[gte]=2025-01-01"), so a bare `updated_at=<iso>` is
   * not a filter it documents.
   */
  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const extra: Record<string, unknown> = { source_type: 'BILL' }
    if (params.updatedAfter) extra['updated_at[gte]'] = params.updatedAfter.toISOString()
    const records = await this.cursorList<BrexAccountingRecord>(
      credentials,
      params,
      '/v3/accounting/records',
      ACCOUNTING_RECORDS_MAX_PAGE_SIZE,
      extra,
    )
    return records.map(transformAccountingRecordToBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new BrexClient(credentials)
    const raw = await client.get<BrexAccountingRecord>(`/v3/accounting/records/${id}`)
    return transformAccountingRecordToBill(raw)
  }

  // ── Expenses (card) ──────────────────────────────────────────────────────────

  /**
   * `updatedAfter` is sent as `updated_at_start` (listexpenses_1.md: "Shows
   * only expenses with a updated_at on or after this date-time").
   */
  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const expenses = await this.cursorList<BrexCardExpense>(
      credentials,
      params,
      '/v1/expenses/card',
      CARD_EXPENSES_MAX_PAGE_SIZE,
      params.updatedAfter ? { updated_at_start: params.updatedAfter.toISOString() } : {},
    )
    return expenses.map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new BrexClient(credentials)
    const raw = await client.get<BrexCardExpense>(`/v1/expenses/card/${id}`)
    return transformExpense(raw)
  }
}
