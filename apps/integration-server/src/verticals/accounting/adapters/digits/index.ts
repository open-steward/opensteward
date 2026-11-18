/**
 * Digits accounting adapter.
 *
 * Digits Connect API: https://developer.digits.com/docs
 * Spec: https://developer.digits.com/openapi/openapi.yaml (server https://connect.digits.com)
 * Auth: OAuth 2.0 authorization-code
 * Base URL: https://connect.digits.com/v1
 *
 * Resources:
 *   - Organization → GET /v1/company
 *   - Account      → GET /v1/ledger/categories ("Fetch the full Chart of Accounts
 *                    from the Ledger."; no paging parameters), GET /v1/ledger/category/{id}
 *   - Contact      → GET /v1/ledger/parties (cursor-paged), GET /v1/ledger/party/{id}
 *   - Transaction  → GET /v1/ledger/entries (cursor-paged), one row per ledger entry.
 *                    No single-entry read is documented, so getTransaction refuses.
 *   - Journal      → GET /v1/ledger/transaction/{id}. No list of ledger
 *                    transactions is documented, so listJournals refuses.
 *
 * Paging (https://developer.digits.com/docs/pagination.md): `limit` and
 * `cursor`; the response's `next` holds `cursor` and `more`. On parties and
 * entries `limit` is "The number of items to return per request. Default and
 * max size is 100."
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: bill         — no /bills endpoint; bills are represented only as ledger entries
 * Unavailable: creditmemo   — no credit-memo concept; adjustments appear as ledger entries
 * Unavailable: expense      — no /expenses endpoint; expenses are categorised ledger entries
 * Unavailable: invoice      — no /invoices endpoint; invoice details may attach to ledger entries but no dedicated resource exists
 * Unavailable: order        — no order concept or endpoint in the Digits Connect API
 * Unavailable: purchaseorder — no purchase-order concept or endpoint in the Digits Connect API
 * Unavailable: salesorder   — no sales-order concept or endpoint in the Digits Connect API
 * Unavailable: taxrate      — no /taxrates endpoint; tax handling is not exposed via the Connect API
 */
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Account } from '../../schema/account'
import type { Contact } from '../../schema/contact'
import type { Journal } from '../../schema/journal'
import type { Organization } from '../../schema/organization'
import type { Transaction } from '../../schema/transaction'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { DigitsClient, nextCursor, type DigitsPage } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformCategory, type DigitsCategory } from './transform/account'
import { transformParty, type DigitsParty } from './transform/contact'
import { transformOrganization, type DigitsCompany } from './transform/organization'
import { transformEntryDetail, type DigitsEntryDetail } from './transform/transaction'
import { transformLedgerTransaction, type DigitsLedgerTransaction } from './transform/journal'

interface DigitsAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * The pager scope. A Digits token carries no documented company id, so the
 * connection is told apart by its token fingerprint alone.
 */
function scope(credentials: Credentials): string {
  return connectionScope('digits', credentials)
}

export class DigitsAdapter implements AccountingAdapter {
  readonly platform = 'digits'
  readonly version = '0.1.0'
  /** Parties and entries: "Default and max size is 100." */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: DigitsAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

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

  /**
   * One caller page of a cursor-paged Digits list (parties, entries).
   *
   * Sends the caller's limit, clamped to the documented maximum of 100, and
   * reports the clamped size when it is below the ask. The end of the list is
   * Digits' own signal: `next.more`.
   */
  private async listByCursor<T>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    listKey: string,
    filters: Record<string, string>,
  ): Promise<T[]> {
    const client = new DigitsClient(credentials)
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    const limit = Math.min(asked, MAX_PAGE_SIZE)
    const query: Record<string, unknown> = { ...filters, limit }
    const { items, hasMore } = await pageByCursor<T, string>(
      cursorPagerKey(scope(credentials), path, query),
      params.page,
      async (cursor) => {
        const data = await client.get<Record<string, unknown>>(
          path,
          cursor === undefined ? query : { ...query, cursor },
        )
        const rows = data[listKey]
        return {
          items: Array.isArray(rows) ? (rows as T[]) : [],
          next: nextCursor(data['next'] as DigitsPage | undefined, path),
        }
      },
    )
    reportUpstreamPage(params, limit < asked ? { hasMore, pageSize: limit } : { hasMore })
    return items
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new DigitsClient(credentials)
    const res = await client.get<DigitsCompany>('company')
    return transformOrganization(res)
  }

  // --- Accounts (chart of accounts = ledger categories) ---

  /**
   * GET /v1/ledger/categories: "Fetch the full Chart of Accounts from the
   * Ledger." Its documented parameters are created/updated before/after and
   * the entity selector, with no limit or cursor, and its response has no
   * `next`, so the whole chart is sliced locally.
   */
  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new DigitsClient(credentials)
    const query: Record<string, string> = {}
    if (params.updatedAfter) query['updatedAfter'] = params.updatedAfter.toISOString()
    const res = await client.get<{ categories?: DigitsCategory[] }>('ledger/categories', query)
    const rows = (res.categories ?? []).map(transformCategory)
    return pageLocally(rows, params)
  }

  /** GET /v1/ledger/category/{id} returns one `Category`. */
  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new DigitsClient(credentials)
    const res = await client.get<DigitsCategory>(`ledger/category/${encodeURIComponent(id)}`)
    return transformCategory(res)
  }

  // --- Contacts (ledger parties) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const filters: Record<string, string> = {}
    if (params.updatedAfter) filters['updatedAfter'] = params.updatedAfter.toISOString()
    const rows = await this.listByCursor<DigitsParty>(
      credentials,
      params,
      'ledger/parties',
      'parties',
      filters,
    )
    return rows.map(transformParty)
  }

  /** GET /v1/ledger/party/{id} returns `{ party: Party }`. */
  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new DigitsClient(credentials)
    const res = await client.get<{ party?: DigitsParty }>(`ledger/party/${encodeURIComponent(id)}`)
    if (!res.party) throw new Error(`Digits returned no party for ${id}`)
    return transformParty(res.party)
  }

  // --- Transactions (ledger entries) ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const filters: Record<string, string> = {}
    if (params.updatedAfter) filters['updatedAfter'] = params.updatedAfter.toISOString()
    const rows = await this.listByCursor<DigitsEntryDetail>(
      credentials,
      params,
      'ledger/entries',
      'entryDetails',
      filters,
    )
    return rows.map(transformEntryDetail)
  }

  /**
   * listTransactions serves ledger ENTRIES, keyed by the entry id. Digits
   * documents no read of one entry: GET /v1/ledger/transaction/{id} takes
   * "The digits ledger transaction id" (getJournal), and the spec has no
   * single-entry path.
   */
  async getTransaction(_credentials: Credentials, _id: string): Promise<Transaction> {
    throw notSupported(
      'Digits cannot read one ledger entry: the Connect API documents no single-entry GET, only GET /v1/ledger/transaction/{id} for a whole ledger transaction',
    )
  }

  // --- Journals (ledger transactions) ---

  /**
   * Digits documents no list of ledger transactions. GET /v1/ledger/entries
   * lists entries ("An entry is a single line item within a transaction"),
   * in no documented order, so its pages cannot be grouped into whole
   * transactions without splitting or repeating one across pages.
   */
  async listJournals(_credentials: Credentials, _params: QueryParams): Promise<Journal[]> {
    throw notSupported(
      'Digits cannot list journals: the Connect API reads a ledger transaction only by id (GET /v1/ledger/transaction/{id}); GET /v1/ledger/entries lists single line items, "An entry is a single line item within a transaction"',
    )
  }

  /** GET /v1/ledger/transaction/{id}: "The full transaction for this ID, with all lines". */
  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new DigitsClient(credentials)
    const res = await client.get<{ transaction?: DigitsLedgerTransaction }>(
      `ledger/transaction/${encodeURIComponent(id)}`,
    )
    if (!res.transaction) throw new Error(`Digits returned no transaction for ${id}`)
    return transformLedgerTransaction(res.transaction)
  }
}
