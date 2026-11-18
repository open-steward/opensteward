/**
 * Payhawk accounting adapter.
 *
 * Auth: API key (X-Payhawk-ApiKey header). No OAuth flow.
 *   - accessToken = API key value
 *   - tenantId    = Payhawk accountId (required for all resource endpoints)
 *
 * Supported resources:
 *   - Expenses   → listExpenses / getExpense (Payhawk's core resource)
 *   - Bills      → listBills / getBill (invoice-type expenses)
 *   - Contacts   → listContacts / getContact (suppliers)
 *   - Accounts   → listAccounts / getAccount (fund accounts)
 *   - Transactions → listTransactions / getTransaction (bank statement entries)
 *
 * Not supported (Payhawk is a spend-management / AP platform, not a full AR
 * accounting system — these have no corresponding v3 REST API endpoint):
 *   invoices, journals, taxrates, creditmemos, orders, salesorders, purchaseorders
 *
 * ── Resource coverage ──────────────────────────────────────────────────────────
 * Unavailable: creditmemo    — no credit-memo concept or endpoint in the Payhawk v3 REST API
 * Unavailable: invoice       — no AR invoice endpoint; AP bills surface via expenses (type=invoice)
 * Unavailable: journal       — journal entries are written to connected ERPs, not readable from Payhawk
 * Unavailable: order         — no generic order endpoint in the Payhawk v3 REST API
 * Unavailable: purchaseorder — POs exist in portal and webhooks but no REST GET endpoint is documented
 * Unavailable: salesorder    — Payhawk is AP-only; no sales-order concept or endpoint
 * Unavailable: taxrate       — tax rates are synced FROM ERPs into Payhawk, not exposed via the API
 *
 * Docs: https://developers.payhawk.com/
 * API base: https://api.payhawk.io/api/v3
 */

import {
  connectionScope,
  cursorPagerKey,
  customForm,
  MAX_PAGE_LIMIT,
  pageByRows,
  pageLocally,
} from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Expense } from '../../schema/expense'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Transaction } from '../../schema/transaction'
import type { WebhookEvent } from '../../schema/webhook'

import { passthroughRefresh } from './auth'
import { PayhawkClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformExpense, type PayhawkExpense } from './transform/expense'
import { transformBill } from './transform/bill'
import { transformSupplier, type PayhawkSupplier } from './transform/contact'
import { transformAccount, type PayhawkFundAccount } from './transform/account'
import { transformTransaction, type PayhawkBankStatementEntry } from './transform/transaction'
import { payhawkWebhook } from './webhook'

/** GET fund-accounts answers IFundAccountsResponse: an envelope, not an array. */
interface FundAccountsResponse {
  items?: PayhawkFundAccount[]
  total?: number
}

/**
 * GET fund-accounts/{fundAccountId}/bank-statement answers
 * IBankStatementResponse. `total` is "Total count of objects. If using
 * pagination, this is the sum of all pages".
 */
interface BankStatementResponse {
  lines?: PayhawkBankStatementEntry[]
  total?: number
}

/**
 * A position in the stream of every fund account's statement lines: the fund
 * accounts, sorted by id, which one is being read, and how many of its lines
 * are behind. Carrying the ids keeps a walk to one fund-accounts request,
 * however many caller pages it serves.
 */
interface StatementCursor {
  accounts: string[]
  index: number
  skip: number
}

/**
 * IBankStatementOrderBy, JSON-stringified as `$orderBy` requires. The default
 * order is not specified, and `$skip` over an unspecified order is not a
 * stable position.
 */
const STATEMENT_ORDER = JSON.stringify([{ date: 'asc' }])

/**
 * Lines asked for per bank-statement request: the caller's page size, but
 * never fewer than MAX_PAGE_LIMIT (the largest page the router serves, and
 * the sync worker's page) and never more than the documented `$take` maximum.
 *
 * The walk has to fetch every upstream page before the caller's, and the
 * row pager remembers where they start only within one process and for a
 * minute. Asking for the caller's own limit made a cold page N cost N
 * requests against a limit of 15 a second: page 50 of limit 100 was 51, and
 * past 1,000 the walk threw. At 500 lines a request that page is 11, and
 * every router or sync walk of a connection shares one key.
 */
function statementTake(limit: number): number {
  return Math.min(Math.max(Math.floor(limit), MAX_PAGE_LIMIT), MAX_PAGE_SIZE)
}

/** By id, so every read of the list is in the same order. */
function byId(a: PayhawkFundAccount, b: PayhawkFundAccount): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

// ── Connect-Link credential form ──────────────────────────────────────────────
// Payhawk requires two values: the API key and the accountId (organisation ID).
// The API key maps to accessToken; accountId maps to tenantId.

const FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      helpText:
        'Found in Settings → Integrations → API Keys inside the Payhawk portal.',
    },
    {
      name: 'accountId',
      label: 'Account ID',
      type: 'text',
      required: true,
      helpText:
        'Your Payhawk organisation account ID (visible in Settings → Integrations).',
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const apiKey = (fields['apiKey'] ?? '').trim()
    const accountId = (fields['accountId'] ?? '').trim()
    if (!apiKey) throw new Error('API key is required.')
    if (!accountId) throw new Error('Account ID is required.')
    return { accessToken: apiKey, tenantId: accountId }
  },
})

// ── Adapter ───────────────────────────────────────────────────────────────────

export class PayhawkAdapter implements AccountingAdapter {
  readonly platform = 'payhawk'
  readonly version = '0.1.0'
  /** The documented `$take` maximum; see MAX_PAGE_SIZE. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // Connect Link support
  credentialFields = FORM.credentialFields
  exchangeCredentials = FORM.exchangeCredentials

  /**
   * Payhawk is API-key-only — there is no OAuth flow.
   * This method is required by the interface but never reached for api_key adapters.
   */
  getAuthUrl(_state: string): string {
    throw new Error('Payhawk does not use OAuth. Use credentialFields / exchangeCredentials.')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Payhawk does not use OAuth. Use credentialFields / exchangeCredentials.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return passthroughRefresh(credentials)
  }

  // ── Webhooks ─────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return payhawkWebhook.verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return payhawkWebhook.parseWebhookEvents(payload)
  }

  // ── Pagination helpers ───────────────────────────────────────────────────

  private paginationParams(params: QueryParams): Record<string, unknown> {
    const take = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const skip = (page - 1) * take
    const p: Record<string, unknown> = { $skip: skip, $take: take }
    if (params.updatedAfter) {
      p['$filter'] = `updatedAt ge ${params.updatedAfter.toISOString()}`
    }
    return p
  }

  // ── Expenses ─────────────────────────────────────────────────────────────

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new PayhawkClient(credentials)
    const res = await client.get<PayhawkExpense[]>('expenses', this.paginationParams(params))
    return (Array.isArray(res) ? res : []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new PayhawkClient(credentials)
    const res = await client.get<PayhawkExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // ── Bills (invoice-type expenses) ────────────────────────────────────────
  // Payhawk doesn't have a dedicated "bills" endpoint. We reuse the expenses
  // endpoint filtered to type=invoice to surface AP invoices.

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new PayhawkClient(credentials)
    const pagination = this.paginationParams(params)
    const filterBase = `type eq 'invoice'`
    const combined = pagination['$filter']
      ? `${filterBase} and ${pagination['$filter']}`
      : filterBase
    const res = await client.get<PayhawkExpense[]>('expenses', {
      ...pagination,
      '$filter': combined,
    })
    return (Array.isArray(res) ? res : []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new PayhawkClient(credentials)
    const res = await client.get<PayhawkExpense>(`expenses/${id}`)
    return transformBill(res)
  }

  // ── Contacts (suppliers) ─────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new PayhawkClient(credentials)
    const res = await client.get<PayhawkSupplier[]>('suppliers', this.paginationParams(params))
    return (Array.isArray(res) ? res : []).map(transformSupplier)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new PayhawkClient(credentials)
    const res = await client.get<PayhawkSupplier>(`suppliers/${id}`)
    return transformSupplier(res)
  }

  // ── Accounts (fund accounts) ─────────────────────────────────────────────

  /**
   * Every fund account, sorted by id. The endpoint "Returns all fund accounts
   * for an account" and takes no parameter but the accountId in its path, so
   * there is nothing to page upstream.
   *
   * Its order is not documented, and both lists cut positions out of it:
   * listAccounts' pages, and the row offsets of listTransactions' stream. A
   * page read in another order than the page before it would serve some
   * accounts twice and others never, so the order is fixed here.
   *
   * The response's `total` is the size of the whole list. One that says there
   * are more accounts than it carries cannot be completed (there is no paging
   * parameter to ask for the rest), so it throws rather than being reported as
   * the complete list.
   */
  private async fundAccounts(client: PayhawkClient): Promise<PayhawkFundAccount[]> {
    const res = await client.get<FundAccountsResponse>('fund-accounts')
    const items = Array.isArray(res?.items) ? res.items : []
    if (typeof res?.total === 'number' && res.total > items.length) {
      throw new Error(
        `Payhawk: fund-accounts returned ${items.length} of ${res.total} fund accounts, and takes no paging parameter`,
      )
    }
    return [...items].sort(byId)
  }

  /** The whole list comes back in one response, so the caller's page is cut from it. */
  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new PayhawkClient(credentials)
    return pageLocally((await this.fundAccounts(client)).map(transformAccount), params)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new PayhawkClient(credentials)
    const res = await client.get<PayhawkFundAccount>(`fund-accounts/${id}`)
    return transformAccount(res)
  }

  // ── Transactions (bank statement entries) ────────────────────────────────
  // Transactions live under a specific fund account. The stream is every fund
  // account's statement in turn, each paged by $skip/$take.

  /**
   * One caller page of every fund account's statement lines, by fund-account
   * id and then by date.
   *
   * The bank-statement endpoint pages by offset: `$skip` is "Number of
   * objects to skip from the beginning of the result set", `$take` "Max
   * number of objects to return" (at most 10000), and the response's `total`
   * is "Total count of objects. If using pagination, this is the sum of all
   * pages". One upstream page is not one caller page, because a caller page
   * can span the end of one account's statement and the start of the next,
   * and each request asks for at least 500 lines (see statementTake), so
   * `pageByRows` walks accounts × statement pages and cuts exactly the
   * caller's rows from them, with `hasMore` exact.
   *
   * `total` ends an account's statement; a response without one (the spec
   * requires it) ends it on a short page. A response with no lines at a
   * `$skip` its own `total` says is inside the statement throws: moving on
   * would drop the rest of that statement and still report the end of the
   * list, and asking again would never advance.
   *
   * The walk used to send `$take` alone (so page 2 repeated page 1), split
   * it across accounts, filter with a `startDate` the endpoint does not
   * read, and drop an account whose request failed.
   */
  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new PayhawkClient(credentials)
    const take = statementTake(params.limit ?? DEFAULT_PAGE_SIZE)
    const query: Record<string, unknown> = { $orderBy: STATEMENT_ORDER }
    if (params.updatedAfter) {
      // IBankStatementFilter, JSON-stringified as `$filter` requires.
      query['$filter'] = JSON.stringify({
        date: { $greaterThanEqual: params.updatedAfter.toISOString() },
      })
    }

    const { items } = await pageByRows<Transaction, StatementCursor>(
      cursorPagerKey(connectionScope(client.accountId, credentials), 'bank-statement', {
        ...query,
        $take: take,
      }),
      params,
      async (cursor) => {
        const at = cursor ?? {
          accounts: (await this.fundAccounts(client)).map((a) => a.id),
          index: 0,
          skip: 0,
        }
        const fundAccountId = at.accounts[at.index]
        if (fundAccountId === undefined) return { items: [] }
        const res = await client.get<BankStatementResponse>(
          `fund-accounts/${fundAccountId}/bank-statement`,
          { ...query, $skip: at.skip, $take: take },
        )
        const lines = Array.isArray(res?.lines) ? res.lines : []
        const total = typeof res?.total === 'number' ? res.total : undefined
        if (lines.length === 0 && total !== undefined && at.skip < total) {
          throw new Error(
            `Payhawk: fund account ${fundAccountId}'s bank statement returned no lines at $skip ${at.skip} of ${total}`,
          )
        }
        const skip = at.skip + lines.length
        const moreHere = total !== undefined ? skip < total : lines.length >= take
        const next: StatementCursor | undefined = moreHere
          ? { ...at, skip }
          : at.index + 1 < at.accounts.length
            ? { accounts: at.accounts, index: at.index + 1, skip: 0 }
            : undefined
        return { items: lines.map(transformTransaction), next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // Payhawk does not expose a single-statement-entry endpoint; the id is
    // formatted as `{fundAccountId}:{entryId}` so we can derive the account.
    const [fundAccountId, ...rest] = id.split(':')
    const entryId = rest.join(':')
    if (!fundAccountId) throw new Error(`Invalid Payhawk transaction id: ${id}`)

    const client = new PayhawkClient(credentials)
    const entries = await client.get<PayhawkBankStatementEntry[]>(
      `fund-accounts/${fundAccountId}/bank-statement`,
    )
    const entry = (Array.isArray(entries) ? entries : []).find(
      (e) => e.id === entryId || e.id === id,
    )
    if (!entry) throw new Error(`Transaction ${id} not found`)
    return transformTransaction(entry)
  }
}
