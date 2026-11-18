/**
 * Tink adapter — payments vertical, on Tink Settlement Accounts.
 *
 * Tink's payments API has no charges or payouts collection. The merchant's
 * money movement is the settlement account's ledger:
 *
 *   GET /payment/v1/merchants/{merchantId}/accounts/{accountId}/transactions
 *     "Lists the transactions for a specific settlement account for a given merchant."
 *   GET .../transactions/{transactionId}
 *     "Retrieves a specific transaction for a specific settlement account and merchant."
 *   GET .../refunds
 *     "Lists the refunds for a specific settlement account and merchant."
 *   GET .../refunds/{refundId}
 *     "Retrieves a specific refund for a specific settlement account and merchant."
 *   https://docs.tink.com/api#payment/settlement-accounts
 *
 * Each is a GA endpoint ("Payment.Settlement Accounts", not tagged BETA) that
 * works with "Client token settlement-accounts:readonly". The product itself:
 * "Settlement accounts is currently available in the UK and is in beta for
 * enterprise customers in Europe."
 * (https://docs.tink.com/resources/payments/one-time-payments/get-started-settlement-accounts)
 *
 *   charges               transactions with typeEq=PAYIN
 *   payouts               transactions with typeEq=SWEEP
 *   balance transactions  every transaction
 *   refunds               the refunds list
 *
 * Not read: withdrawals (tagged BETA, and "a payout to an end-user", not to
 * the merchant); payment requests ("/api/v1/payments/requests" is POST only,
 * so they cannot be listed); customers, payment methods, disputes,
 * subscriptions, invoices and the catalog (no such resource among the
 * documented paths). Those methods are not implemented, so the router answers
 * 501.
 *
 * Not charges, by choice: EXTERNAL_PAYIN, "Received direct bank payment
 * (outside Tink PIS).". Tink does not say who sends it, and a manual top-up
 * is one ("To pay in to a settlement account using a manual bank transfer,
 * use the account identifier ...",
 * https://docs.tink.com/resources/payments/one-time-payments/set-up-settlement-accounts-one-time-payments),
 * so it is not presented as a customer charge. It appears among balance
 * transactions as type 'other'.
 *
 * ## Auth: the connection's own Tink app and settlement account
 *
 * auth_type is oauth2_cc, wired like checkout-com: the Connect Link form
 * takes the connecting party's own Tink Console app credentials ("Make sure
 * you use the correct `client_id` and `client_secret` found in the Tink
 * Console", https://docs.tink.com/resources/api-setup/get-access-token),
 * which mint a client token, "The __Client Token__ - Allows access to
 * requests made by your app.". The form also names the settlement account:
 * "Your `merchant_id` and `account_id` will be provided during onboarding
 * and can also be found in __Console__ > __Payments__ > __Settlements__."
 *
 * Why not one operator-level app: Tink documents no credential scoped to one
 * merchant, and one app's client token reaches every merchant of that app
 * ("GET /partner-integration/v1/merchants": "List all merchants associated
 * with the given application."). With a shared operator token, whoever
 * completed a Connect Link could type another merchant's ids and read that
 * merchant's settlement account. With the connection's own app the token
 * reaches only merchants under an app the connecting party already controls.
 * The operator's platform config (clientId, clientSecret, tokenUrl, scopes)
 * is not read.
 *
 * Connections made before this rebuild went through Tink Link (an AIS user
 * token, with no app credentials and no merchantId/accountId). They cannot
 * read settlement accounts and must reconnect. While the old token is
 * unexpired every read refuses with 501 before any request; once it expires,
 * refreshCredentials refuses, so the auth middleware answers 401
 * TOKEN_REFRESH_FAILED before the adapter runs.
 *
 * ## Paging
 *
 * Both lists page by `pageSize` ("The maximum number of items to return.",
 * no documented maximum) and `pageToken` ("Token to the requested page."),
 * answering `nextPageToken`, `prevPageToken` and `totalSize` ("Total number
 * of transactions." / "Total number of refunds."). The caller's exact limit
 * is sent as pageSize and the cursor chain is walked through pageByCursor.
 * The documented example answers its only page with `"nextPageToken" :
 * "MA="` and `"totalSize" : "1"`, so a non-empty token does not by itself
 * mean more rows: the walk ends on an empty or missing token, when the rows
 * seen reach totalSize, or on an empty page.
 *
 * `updated_after` is not sent. The only date filters are on the processing
 * time (`timestampGte`) and the refund's creation time (`createdTimeGte`),
 * and a refund updated after it was created would be dropped by either;
 * ignoring the bound returns a superset.
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Payout } from '../../schema/payout'
import type { BalanceTransaction } from '../../schema/balance-transaction'

import { connectionFrom, mintCredentials, settlementIdsFrom, type TinkSettlementIds } from './auth'
import { TinkClient } from './client'
import { settlementAccountPath } from './constants'
import type { RawTinkTransaction } from './transform/shared'
import { transformCharge } from './transform/charge'
import { transformPayout } from './transform/payout'
import { transformRefund, type RawTinkRefund } from './transform/refund'
import { transformBalanceTransaction } from './transform/balance-transaction'

/** ListSettlementAccountTransactionsResponse: `transactions` is required. */
interface ListTransactionsResponse {
  nextPageToken?: string
  prevPageToken?: string
  totalSize?: string | number
  transactions: RawTinkTransaction[]
}

/** ListSettlementAccountRefundsResponse: `refunds` is required. */
interface ListRefundsResponse {
  nextPageToken?: string
  prevPageToken?: string
  totalSize?: string | number
  refunds: RawTinkRefund[]
}

/**
 * Where the next upstream page starts, how many rows came before it, and the
 * id of the walk's first row (to detect a token that restarts the walk).
 */
interface TinkCursor {
  token: string
  seen: number
  firstId?: string
}

function rowId(row: unknown): string | undefined {
  const id = (row as { id?: unknown } | null)?.id
  return typeof id === 'string' ? id : undefined
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

/** totalSize is typed integer and shown as a string ("1") in the examples. */
function parseTotal(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim())
  return undefined
}

/** The caller's page size, exactly, or undefined when none was given. */
function pageLimit(params: QueryParams): number | undefined {
  const l = params.limit
  return typeof l === 'number' && Number.isFinite(l) && l >= 1 ? Math.floor(l) : undefined
}

/**
 * The cursor that starts the next upstream page, or undefined at the end.
 * Besides an empty/missing token, totalSize and an empty page, a token that
 * repeats the one that fetched this page ends the walk: the documented
 * examples keep a non-empty token ("MA=") on their last page, and a token
 * that points back at this page or the start would otherwise loop.
 */
function nextCursor(
  cursor: TinkCursor | undefined,
  rows: unknown[],
  nextPageToken: unknown,
  totalSize: unknown,
): TinkCursor | undefined {
  if (rows.length === 0) return undefined
  const token = typeof nextPageToken === 'string' ? nextPageToken : ''
  if (token === '' || token === cursor?.token) return undefined
  const seen = (cursor?.seen ?? 0) + rows.length
  const total = parseTotal(totalSize)
  if (total !== undefined && seen >= total) return undefined
  return { token, seen, firstId: cursor ? cursor.firstId : rowId(rows[0]) }
}

/**
 * The platform config is deliberately not read: an operator-level app token
 * would reach every merchant under that app (see the header). The factory
 * still passes it, so the constructor accepts and ignores it.
 */
export type TinkAdapterConfig = Record<string, unknown>

export class TinkAdapter implements PaymentsAdapter {
  readonly platform = 'tink'
  readonly version = '0.2.0'

  constructor(_config: TinkAdapterConfig = {}) {}

  getAuthUrl(): string {
    throw new Error(
      'Tink uses oauth2_cc: submit your Tink app client ID and secret, Merchant ID and Settlement account ID via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Tink uses oauth2_cc; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'clientId',
        label: 'Client ID',
        type: 'text',
        required: true,
        helpText: 'Your Tink Console app.',
      },
      {
        name: 'clientSecret',
        label: 'Client secret',
        type: 'password',
        required: true,
        helpText: 'Your Tink Console app.',
      },
      {
        name: 'merchantId',
        label: 'Merchant ID',
        type: 'text',
        required: true,
        helpText: 'Tink Console > Payments > Settlements.',
      },
      {
        name: 'accountId',
        label: 'Settlement account ID',
        type: 'text',
        required: true,
        helpText: 'Tink Console > Payments > Settlements.',
      },
    ]
  }

  /**
   * Mint a client token with the connection's own app, then prove it reaches
   * the settlement account: GET /payment/v1/merchants/{merchantId}/accounts/{accountId},
   * "Retrieves a specific settlement account for a given merchant." (403 "The
   * resource does not belong to subject associated with the access token.",
   * 404 "The merchant or account specified could not be found.").
   */
  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    const clientId = str(fields['clientId'])
    const clientSecret = str(fields['clientSecret'])
    const merchantId = str(fields['merchantId'])
    const accountId = str(fields['accountId'])
    if (!clientId) throw new Error('Tink Client ID is required.')
    if (!clientSecret) throw new Error('Tink Client secret is required.')
    if (!merchantId) throw new Error('Tink Merchant ID is required.')
    if (!accountId) throw new Error('Tink Settlement account ID is required.')
    const credentials = await mintCredentials({ clientId, clientSecret, merchantId, accountId })
    try {
      await new TinkClient(credentials).get(settlementAccountPath(merchantId, accountId))
    } catch (err) {
      const status = (err as { statusCode?: unknown }).statusCode
      if (status === 403 || status === 404) {
        throw Object.assign(
          new Error(
            `Tink settlement account ${merchantId}/${accountId} is not reachable with this app's client token (${status}). Check the Merchant ID and Settlement account ID in Tink Console > Payments > Settlements.`,
          ),
          { statusCode: 400 },
        )
      }
      throw err
    }
    return credentials
  }

  /** No refresh token exists: "use the same endpoint again to get a new access token". */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const conn = connectionFrom(credentials)
    if (!conn) {
      throw new Error(
        'Tink connection has no app client credentials or settlement merchantId/accountId; reconnect it through the Connect Link form.',
      )
    }
    return mintCredentials(conn)
  }

  /** The connection's settlement account, or a 501 before any request. */
  private settlement(credentials: Credentials, what: string): TinkSettlementIds {
    const { merchantId, accountId } = settlementIdsFrom(credentials)
    if (!merchantId || !accountId) {
      throw notSupported(
        `Tink cannot ${what}: this connection has no settlement merchantId/accountId (Tink reads payments only from a settlement account, GET /payment/v1/merchants/{merchantId}/accounts/{accountId}/...); reconnect it through the Connect Link form with the Merchant ID and Settlement account ID from Tink Console > Payments > Settlements.`,
      )
    }
    return { merchantId, accountId }
  }

  /**
   * One caller page of a settlement-account list, walked by pageToken.
   * `collection` names the cache key; `filter` is the only query parameter
   * besides the paging pair.
   */
  private async listPage<R>(
    credentials: Credentials,
    params: QueryParams,
    ids: TinkSettlementIds,
    collection: 'transactions' | 'refunds',
    filter: { typeEq?: string },
  ): Promise<R[]> {
    const limit = pageLimit(params)
    const client = new TinkClient(credentials)
    const path = `${settlementAccountPath(ids.merchantId, ids.accountId)}/${collection}`
    const key = cursorPagerKey(
      connectionScope(`tink:${ids.merchantId}/${ids.accountId}`, credentials),
      collection,
      { limit, ...filter },
    )
    let total: number | undefined
    const result = await pageByCursor<R, TinkCursor>(key, params.page, async (cursor) => {
      const body = await client.get<ListTransactionsResponse & ListRefundsResponse>(path, {
        pageSize: limit,
        pageToken: cursor?.token,
        ...filter,
      })
      const rows = (body as unknown as Record<string, unknown> | null)?.[collection]
      if (!Array.isArray(rows)) {
        throw new Error(`Tink ${collection} list response has no ${collection} array`)
      }
      total = parseTotal(body.totalSize)
      // A later page that starts with the walk's first row means the token
      // restarted the walk: those rows were already served.
      if (cursor?.firstId !== undefined && rowId(rows[0]) === cursor.firstId) {
        return { items: [], next: undefined }
      }
      return {
        items: rows as R[],
        next: nextCursor(cursor, rows, body.nextPageToken, body.totalSize),
      }
    })
    reportUpstreamPage(params, {
      hasMore: result.hasMore,
      // totalSize counts the query's rows; a typeEq-filtered total is not
      // documented as filtered, so it is published only for unfiltered lists.
      ...(total !== undefined && filter.typeEq === undefined ? { totalCount: total } : {}),
      // No documented maximum pageSize: a full page shorter than the ask that
      // is not the last means the platform capped it, and the caller must
      // judge pages at that size.
      ...(limit !== undefined && result.hasMore && result.items.length < limit
        ? { pageSize: result.items.length }
        : {}),
    })
    return result.items
  }

  private async getTransaction(
    credentials: Credentials,
    ids: TinkSettlementIds,
    id: string,
  ): Promise<RawTinkTransaction> {
    return new TinkClient(credentials).get<RawTinkTransaction>(
      `${settlementAccountPath(ids.merchantId, ids.accountId)}/transactions/${encodeURIComponent(id)}`,
    )
  }

  // ── Charges: PAYIN transactions ─────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const ids = this.settlement(credentials, 'list charges')
    const rows = await this.listPage<RawTinkTransaction>(credentials, params, ids, 'transactions', {
      typeEq: 'PAYIN',
    })
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const ids = this.settlement(credentials, 'read a charge')
    const raw = await this.getTransaction(credentials, ids, id)
    if (raw?.type !== 'PAYIN') {
      throw notFound(
        `Tink settlement transaction ${id} is ${String(raw?.type)}, not a PAYIN charge`,
      )
    }
    return transformCharge(raw)
  }

  // ── Payouts: SWEEP transactions ─────────────────────────────────────────

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const ids = this.settlement(credentials, 'list payouts')
    const rows = await this.listPage<RawTinkTransaction>(credentials, params, ids, 'transactions', {
      typeEq: 'SWEEP',
    })
    return rows.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const ids = this.settlement(credentials, 'read a payout')
    const raw = await this.getTransaction(credentials, ids, id)
    if (raw?.type !== 'SWEEP') {
      throw notFound(
        `Tink settlement transaction ${id} is ${String(raw?.type)}, not a SWEEP payout`,
      )
    }
    return transformPayout(raw)
  }

  // ── Refunds ─────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const ids = this.settlement(credentials, 'list refunds')
    const rows = await this.listPage<RawTinkRefund>(credentials, params, ids, 'refunds', {})
    return rows.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const ids = this.settlement(credentials, 'read a refund')
    const raw = await new TinkClient(credentials).get<RawTinkRefund>(
      `${settlementAccountPath(ids.merchantId, ids.accountId)}/refunds/${encodeURIComponent(id)}`,
    )
    return transformRefund(raw)
  }

  // ── Balance transactions: every settlement transaction ──────────────────

  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    const ids = this.settlement(credentials, 'list balance transactions')
    const rows = await this.listPage<RawTinkTransaction>(
      credentials,
      params,
      ids,
      'transactions',
      {},
    )
    return rows.map(transformBalanceTransaction)
  }

  async getBalanceTransaction(credentials: Credentials, id: string): Promise<BalanceTransaction> {
    const ids = this.settlement(credentials, 'read a balance transaction')
    return transformBalanceTransaction(await this.getTransaction(credentials, ids, id))
  }
}
