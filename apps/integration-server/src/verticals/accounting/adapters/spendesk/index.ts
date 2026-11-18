/**
 * SpendeskAdapter — OpenSteward accounting adapter for Spendesk.
 *
 * Spendesk is a spend-management platform that provides:
 *   - Payables (expense claims, card purchases, supplier invoices, credit notes)
 *   - Settlements (payment clearing events)
 *   - Suppliers (vendor/counterparty directory)
 *   - Accounts (chart of accounts from the accounting integration)
 *   - Users (employee roster)
 *
 * Supported canonical resources:
 *   listExpenses / getExpense           → Spendesk Payables (all types)
 *   listInvoices / getInvoice           → Spendesk Payables of type 'invoicePurchase'
 *   listCreditMemos / getCreditMemo     → Spendesk Payables of type 'creditNote'
 *     (lists: POST /v1/payables/search; gets: GET /v1/payables/{id})
 *   listTransactions                    → Spendesk Settlements
 *   listContacts / getContact           → Spendesk Suppliers + Users
 *   listAccounts / getAccount           → Spendesk accounts (GET /v1/experimental/accounts)
 *
 * Auth: OAuth2 client_credentials (server-to-server) OR PKCE (user-facing).
 * Bearer token in Authorization header.
 *
 * Docs: https://developer.spendesk.com/reference/introduction
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: bill          — No dedicated bill endpoint; AP invoices are served
 *                              via listInvoices (type='invoicePurchase' payables).
 * Unavailable: journal       — Spendesk public API has no journal/journal-entry endpoint.
 * Unavailable: order         — Spendesk public API has no generic order endpoint.
 * Unavailable: organization  — Spendesk public API does not expose a company/org endpoint.
 * Unavailable: purchaseorder — Purchase orders exist in the UI but have no public API endpoint.
 * Unavailable: salesorder    — Spendesk is AP-focused; sales orders are not a platform concept.
 * Unavailable: taxrate       — Tax rates are not exposed through the Spendesk public API.
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Expense } from '../../schema/expense'
import type { Invoice } from '../../schema/invoice'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Transaction } from '../../schema/transaction'

import { buildAuthUrl, exchangeCode, refreshAccessToken, fetchClientCredentialsToken } from './auth'
import { SpendeskClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, PATHS, SPENDESK_DEFAULT_SCOPES } from './constants'

import {
  transformPayable,
  transformSearchPayable,
  type SpendeskPayable,
  type SpendeskSearchPayable,
  type SpendeskSearchResponse,
} from './transform/expense'
import { transformPayableAsInvoice, transformSearchPayableAsInvoice } from './transform/invoice'
import {
  transformPayableAsCreditMemo,
  transformSearchPayableAsCreditMemo,
} from './transform/creditmemo'
import {
  transformSupplier,
  transformUser,
  type SpendeskSupplier,
  type SpendeskUser,
} from './transform/contact'
import {
  transformAccount,
  type SpendeskAccount,
  type SpendeskAccountList,
} from './transform/account'
import { transformSettlement, type SpendeskSettlement } from './transform/transaction'

// ── Config ────────────────────────────────────────────────────────────────────

interface SpendeskAdapterConfig {
  clientId: string
  clientSecret: string
  /** Required for PKCE user-facing flows; not needed for client_credentials. */
  redirectUri?: string
  /** Defaults to SPENDESK_DEFAULT_SCOPES. */
  scopes?: string[]
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class SpendeskAdapter implements AccountingAdapter {
  readonly platform = 'spendesk'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  /**
   * Ephemeral PKCE code verifier generated during `getAuthUrl()`.
   * Consumed once by the subsequent `exchangeCode()` call.
   * A single adapter instance is expected to handle one authorization
   * flow at a time (the standard request/response lifecycle).
   */
  private _pendingCodeVerifier: string | undefined

  constructor(config: SpendeskAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri ?? ''
    this.scopes = config.scopes ?? SPENDESK_DEFAULT_SCOPES
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  /**
   * Build a PKCE authorization URL for user-facing OAuth2 flows.
   * Generates a fresh code verifier + S256 challenge internally and stores
   * the verifier on the instance so `exchangeCode()` can supply it without
   * requiring callers to thread it through (the BaseAdapter interface has no
   * room for a `codeChallenge` parameter).
   *
   * For server-to-server integrations use `fetchClientCredentials` instead.
   */
  getAuthUrl(state: string, overrideScopes?: string[]): string {
    const { url, codeVerifier } = buildAuthUrl(
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
    )
    this._pendingCodeVerifier = codeVerifier
    return url
  }

  /** Exchange a PKCE authorization code for tokens. */
  async exchangeCode(
    code: string,
    redirectUri: string,
    codeVerifier?: string,
  ): Promise<Credentials> {
    // Prefer an explicitly supplied verifier; fall back to the one stored
    // by the most recent getAuthUrl() call on this instance.
    const verifier = codeVerifier ?? this._pendingCodeVerifier ?? ''
    this._pendingCodeVerifier = undefined
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri, verifier)
  }

  /** Refresh a PKCE-obtained access token. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) {
      // client_credentials tokens have no refresh token — re-issue
      return fetchClientCredentialsToken(this.clientId, this.clientSecret, credentials.scope)
    }
    const creds = await refreshAccessToken(
      credentials.refreshToken,
      this.clientId,
      this.clientSecret,
    )
    creds.tenantId = credentials.tenantId
    return creds
  }

  // ── Payables: search (lists) and by id (gets) ─────────────────────────────

  /**
   * One caller page of POST /v1/payables/search.
   *
   * v1 has no synchronous payables list: "The synchronous endpoint to
   * retrieve payables has been removed in favor of the asynchronous one"
   * (v1 changelog). The search endpoint "Searches payables using filters with
   * cursor-based pagination": body `limit` ("Maximum number of payables to
   * return per page"), `cursor` ("Opaque pagination cursor returned in the
   * previous response’s nextCursor field. Omit for the first page."), and
   * `filters`, a leaf filter or an `and` group of them. Its results sort
   * by creation date, ascending by default, so a cursor chain is stable.
   *
   * `updatedAfter` becomes a `lastUpdatedAt` `after` filter — the date
   * filter fields are "payableDate, firstCreatedAt, firstExportedAt,
   * lastUpdatedAt, dueDate, accountingDate". The v0 adapter sent
   * `exportedAfter`, which filters on export, not update.
   *
   * `limit` is clamped to the 30 the v1 changelog sets "across all
   * endpoints"; the search reference states no maximum of its own.
   */
  private async searchPayables(
    credentials: Credentials,
    params: QueryParams,
    payableTypes?: string[],
  ): Promise<SpendeskSearchPayable[]> {
    const client = new SpendeskClient(credentials)
    const asked = Math.floor(params.limit ?? DEFAULT_PAGE_SIZE)
    const limit = Math.max(1, Math.min(asked, MAX_PAGE_SIZE))
    if (limit < asked) reportUpstreamPage(params, { pageSize: limit })

    const leaves: Array<Record<string, unknown>> = []
    if (payableTypes) leaves.push({ field: 'payableType', operator: '=', value: payableTypes })
    if (params.updatedAfter) {
      leaves.push({
        field: 'lastUpdatedAt',
        operator: 'after',
        value: params.updatedAfter.toISOString(),
      })
    }
    const filters =
      leaves.length === 0
        ? undefined
        : leaves.length === 1
          ? leaves[0]
          : { operator: 'and', subfilters: leaves }

    const key = cursorPagerKey(connectionScope('spendesk', credentials), PATHS.payableSearch, {
      filters,
      limit,
    })
    const { items, hasMore } = await pageByCursor<SpendeskSearchPayable, string>(
      key,
      params.page,
      async (cursor) => {
        const body: Record<string, unknown> = { limit }
        if (filters) body['filters'] = filters
        if (cursor) body['cursor'] = cursor
        const res = await client.post<SpendeskSearchResponse>(PATHS.payableSearch, body)
        return { items: res.payables ?? [], next: res.nextCursor || undefined }
      },
    )
    reportUpstreamPage(params, { hasMore })
    return items
  }

  /**
   * GET /v1/payables/{id} — "Retrieves a single payable by its ID." The v0
   * adapter sent GET /v1/payables?ids[]=…, an endpoint v1 removed.
   * `expectedType` rejects a payable of another type (an expense claim read
   * as an invoice) as not found.
   */
  private async getPayable(
    credentials: Credentials,
    id: string,
    expectedType?: string,
  ): Promise<SpendeskPayable> {
    const client = new SpendeskClient(credentials)
    const payable = await client.get<SpendeskPayable>(PATHS.payable(id))
    if (!payable?.id || (expectedType && payable.type !== expectedType)) {
      throw Object.assign(new Error(`Spendesk: ${expectedType ?? 'payable'} ${id} not found`), {
        statusCode: 404,
      })
    }
    return payable
  }

  // ── Expenses (all payables) ────────────────────────────────────────────────

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const rows = await this.searchPayables(credentials, params)
    return rows.map(transformSearchPayable)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    return transformPayable(await this.getPayable(credentials, id))
  }

  // ── Invoices (payables of type invoicePurchase) ────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const rows = await this.searchPayables(credentials, params, ['invoicePurchase'])
    return rows.map(transformSearchPayableAsInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    return transformPayableAsInvoice(await this.getPayable(credentials, id, 'invoicePurchase'))
  }

  // ── Credit Memos (payables of type creditNote) ─────────────────────────────

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const rows = await this.searchPayables(credentials, params, ['creditNote'])
    return rows.map(transformSearchPayableAsCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    return transformPayableAsCreditMemo(await this.getPayable(credentials, id, 'creditNote'))
  }

  // ── Transactions (Settlements) ─────────────────────────────────────────────

  /**
   * List settlements from Spendesk.
   * Uses page/pageSize offset pagination.
   */
  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new SpendeskClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1

    const extraParams: Record<string, unknown> = {}
    if (params.updatedAfter) {
      extraParams['exportedAfter'] = params.updatedAfter.toISOString()
    }

    // Spendesk serves at most 30 a page; judged against the caller's larger
    // limit, a full page read as the last one. Reported rather than declared
    // as maxPageSize: listContacts merges two endpoints of 30 into one page.
    reportUpstreamPage(params, { pageSize })

    const res = await client.getPage<SpendeskSettlement>(
      PATHS.settlements,
      page,
      pageSize,
      extraParams,
    )
    return (res.data ?? []).map(transformSettlement)
  }

  // ── Contacts (Suppliers + Users) ───────────────────────────────────────────

  /**
   * List contacts from Spendesk.
   * Returns suppliers (isSupplier=true) and users (employees).
   * Both use page/pageSize offset pagination.
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new SpendeskClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1

    const [suppliersRes, usersRes] = await Promise.all([
      client.getPage<SpendeskSupplier>(PATHS.suppliers, page, pageSize),
      client.getPage<SpendeskUser>(PATHS.users, page, pageSize),
    ])

    const suppliers = suppliersRes.data ?? []
    const users = usersRes.data ?? []
    // One page here is page N of two endpoints, up to 2 × pageSize rows, so
    // its length says nothing about the end: 30 suppliers and 10 users is a
    // short page against a limit of 100 while suppliers still have more. A
    // full page from either endpoint means there may be more.
    reportUpstreamPage(params, {
      hasMore: suppliers.length >= pageSize || users.length >= pageSize,
    })
    return [...suppliers.map(transformSupplier), ...users.map(transformUser)]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new SpendeskClient(credentials)
    // Try supplier first, then user
    const suppliersRes = await client.get<{ data: SpendeskSupplier[] }>(PATHS.suppliers, {
      id,
    })
    if (suppliersRes.data?.[0]) {
      return transformSupplier(suppliersRes.data[0])
    }
    const usersRes = await client.get<{ data: SpendeskUser[] }>(PATHS.users, { id })
    if (usersRes.data?.[0]) {
      return transformUser(usersRes.data[0])
    }
    throw new Error(`Spendesk contact not found: ${id}`)
  }

  // ── Accounts (chart of accounts) ───────────────────────────────────────────

  /**
   * GET /v1/experimental/accounts — "Returns accounts from accounting
   * integrations." Pages by `offset` (integer, minimum 0, default 0) and
   * `fetch`, and answers with `totalResults`, `currentOffset` and
   * `currentFetch`. The v0 adapter called /v1/supplier-accounts, which is not
   * in the v1 reference. `fetch` is clamped to the 30 the v1 changelog sets
   * "across all endpoints".
   */
  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new SpendeskClient(credentials)
    const asked = Math.floor(params.limit ?? DEFAULT_PAGE_SIZE)
    const fetch = Math.max(1, Math.min(asked, MAX_PAGE_SIZE))
    const offset = pageOffset(params, fetch)

    // `includeArchived` (boolean, documented with no default) is sent so the
    // walk also returns archived accounts, which historical payables still
    // reference and which transformAccount maps to ARCHIVED.
    const res = await client.get<SpendeskAccountList>(PATHS.accounts, {
      offset,
      fetch,
      includeArchived: true,
    })
    const rows = res.data ?? []
    reportUpstreamPage(params, {
      ...(fetch < asked ? { pageSize: fetch } : {}),
      ...(typeof res.totalResults === 'number'
        ? { totalCount: res.totalResults, hasMore: offset + rows.length < res.totalResults }
        : {}),
    })
    return rows.map(transformAccount)
  }

  /** GET /v1/experimental/accounts/{accountId} — "Returns a single account by id." */
  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new SpendeskClient(credentials)
    return transformAccount(await client.get<SpendeskAccount>(PATHS.account(id)))
  }
}
