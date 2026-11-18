/**
 * SumUp adapter — payments vertical.
 *
 * Every read here is checked against SumUp's first-party OpenAPI spec
 * (https://raw.githubusercontent.com/sumup/sumup-openapi/refs/heads/main/openapi.json,
 * linked from https://developer.sumup.com/api):
 *
 *   - charges: GET /v2.1/merchants/{merchant_code}/transactions/history with
 *     `types[]=PAYMENT`, keyset-paged by its `links[rel=next].href`;
 *     read back by GET /v2.1/merchants/{merchant_code}/transactions?id=…
 *   - payouts: GET /v1.0/merchants/{merchant_code}/payouts, which needs a
 *     `start_date`/`end_date` window and has no paging;
 *   - customers: GET /v0.1/customers/{customer_id} only — SumUp documents no
 *     customer list;
 *   - refunds: refused — the history's REFUND rows name no refunded payment.
 *
 * The reporting endpoints are scoped to a `merchant_code` ("Short unique
 * identifier for the merchant."), which the connection must carry as
 * `credentials.extra.merchantCode`.
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Customer } from '../../schema/customer'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Payout } from '../../schema/payout'

import { buildAuthUrl, exchangeCode as doExchange, refreshCredentials as doRefresh } from './auth'
import { SumupClient } from './client'
import { DEFAULT_SCOPES, PAYOUTS_MAX_LIMIT } from './constants'

import { transformCustomer, type RawSumupCustomer } from './transform/customer'
import { transformCharge, type RawSumupTransaction } from './transform/charge'
import { transformPayout, type RawSumupPayout } from './transform/payout'

export interface SumupAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** The connection's merchant, or a 501 naming the missing value. */
function merchantCode(credentials: Credentials, resource: string): string {
  const value = credentials.extra?.['merchantCode']
  if (typeof value === 'string' && value !== '') return value
  throw notSupported(
    `SumUp cannot list ${resource} for this connection: its endpoints are scoped to ` +
      '/merchants/{merchant_code} ("Short unique identifier for the merchant.", required), ' +
      'and the connection has no merchantCode.',
  )
}

/** GET /v2.1/merchants/{merchant_code}/transactions/history response. */
interface TransactionsHistoryResponse {
  /** "Transactions in the current result page." */
  items?: RawSumupTransaction[]
  /** "Pagination links for navigating the transaction history." */
  links?: { rel: string; href: string }[]
}

function utcMonthStart(ms: number, delta = 0): number {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1)
}

/** `YYYY-MM-DD` in UTC — the documented `start_date`/`end_date` format. */
function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

const DAY_MS = 86_400_000

export class SumupAdapter implements PaymentsAdapter {
  readonly platform = 'sumup'
  readonly version = '0.2.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: SumupAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return doExchange(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): SumupClient {
    return new SumupClient(credentials)
  }

  // ── Customers ───────────────────────────────────────────────────────────────

  async listCustomers(): Promise<Customer[]> {
    throw notSupported(
      'SumUp cannot list customers: its Customers API documents only POST /v0.1/customers, ' +
        'GET and PUT /v0.1/customers/{customer_id} and the payment-instrument calls; ' +
        'no GET lists customers.',
    )
  }

  /** GET /v0.1/customers/{customer_id}: "Retrieves an identified saved customer resource". */
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawSumupCustomer>(
      `/v0.1/customers/${encodeURIComponent(id)}`,
    )
    return transformCustomer(raw)
  }

  // ── Charges (transaction history, type PAYMENT) ─────────────────────────────

  /**
   * GET /v2.1/merchants/{merchant_code}/transactions/history, `types[]=PAYMENT`.
   *
   * `limit`: "Specifies the maximum number of results per page. Value must be
   * a positive integer and if not specified, will return 10 results." No
   * maximum is documented, so the caller's limit is sent as is. The next page
   * is the `links` entry with `rel` "next", whose `href` is a query string
   * ("limit=10&oldest_ref=…&order=ascending"); no such link ends the walk.
   * `updatedAfter` maps to `changes_since` ("returns only transactions that
   * are modified *at or after* the specified timestamp").
   */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const merchant = merchantCode(credentials, 'charges')
    const base: Record<string, unknown> = { 'types[]': 'PAYMENT' }
    if (typeof params.limit === 'number') base.limit = Math.max(1, Math.floor(params.limit))
    if (params.updatedAfter instanceof Date) base.changes_since = params.updatedAfter.toISOString()
    const client = this.client(credentials)
    const path = `/v2.1/merchants/${encodeURIComponent(merchant)}/transactions/history`
    const key = cursorPagerKey(connectionScope(`sumup:${merchant}`, credentials), 'charges', base)
    const { items, hasMore } = await pageByCursor<Charge>(key, params.page, async (cursor) => {
      const query = { ...base }
      if (cursor !== undefined) {
        for (const [k, v] of new URLSearchParams(cursor)) query[k] = v
      }
      const res = await client.get<TransactionsHistoryResponse>(path, query)
      const next = (res.links ?? []).find((l) => l.rel === 'next')?.href
      return {
        items: (res.items ?? []).map((raw) => transformCharge(raw, 'transaction_id')),
        next: next || null,
      }
    })
    reportUpstreamPage(params, { hasMore })
    return items
  }

  /**
   * GET /v2.1/merchants/{merchant_code}/transactions?id=…: "Retrieves the
   * transaction resource with the specified transaction ID (the `id` parameter
   * in the transaction resource)."
   */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const merchant = merchantCode(credentials, 'charges')
    const raw = await this.client(credentials).get<RawSumupTransaction>(
      `/v2.1/merchants/${encodeURIComponent(merchant)}/transactions`,
      { id },
    )
    return transformCharge(raw, 'id')
  }

  // ── Refunds ─────────────────────────────────────────────────────────────────

  async listRefunds(): Promise<Refund[]> {
    throw notSupported(
      'SumUp cannot list refunds: its only refund endpoint is the write ' +
        'POST /v1.0/merchants/{merchant_code}/payments/{transaction_id}/refunds, and the ' +
        'transaction history\'s REFUND rows ("types[]" REFUND) carry no field naming the ' +
        "refunded payment, which a refund's chargeId requires.",
    )
  }

  async getRefund(): Promise<Refund> {
    throw notSupported(
      'SumUp cannot read a refund by id: its API documents no refund retrieval endpoint.',
    )
  }

  // ── Payouts ─────────────────────────────────────────────────────────────────

  /**
   * GET /v1.0/merchants/{merchant_code}/payouts: "Lists payout and
   * payout-deduction records for the specified merchant account within the
   * requested date range." `start_date` and `end_date` are both
   * `required: true` (inclusive, `YYYY-MM-DD`), and the docs name no
   * retention or lookback limit, so a call without `updatedAfter` is refused
   * before any request. With it, the walk runs over UTC calendar months,
   * newest first (`order=desc`), one request per month at the documented
   * maximum `limit` of 9999; the endpoint has no page, offset or cursor, so a
   * month that fills the limit cannot be read whole and fails the call.
   * Deduction records (`type` other than PAYOUT) are not payouts and are
   * dropped. `pageByRows` cuts the caller's pages out of the stream.
   */
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    if (!(params.updatedAfter instanceof Date)) {
      throw notSupported(
        'SumUp cannot list payouts without updated_after: GET /v1.0/merchants/{merchant_code}/payouts ' +
          'requires a start_date/end_date window (both "required: true") and documents no ' +
          'lookback limit. Pass updated_after to walk the months since then.',
      )
    }
    const merchant = merchantCode(credentials, 'payouts')
    const lowerDay = Date.parse(`${isoDate(params.updatedAfter.getTime())}T00:00:00Z`)
    const now = Date.now()
    if (lowerDay > now) {
      reportUpstreamPage(params, { hasMore: false })
      return []
    }
    const newest = utcMonthStart(now)
    const oldest = utcMonthStart(lowerDay)
    const d0 = new Date(oldest)
    const d1 = new Date(newest)
    const windows =
      (d1.getUTCFullYear() - d0.getUTCFullYear()) * 12 + (d1.getUTCMonth() - d0.getUTCMonth()) + 1
    const client = this.client(credentials)
    const path = `/v1.0/merchants/${encodeURIComponent(merchant)}/payouts`
    const key =
      `sumup:${connectionScope(`sumup:${merchant}`, credentials)}:payouts:` +
      `${lowerDay}:${newest}:${PAYOUTS_MAX_LIMIT}`
    const { items } = await pageByRows<Payout, number>(
      key,
      params,
      async (cursor) => {
        const w = cursor ?? 0
        const start = Math.max(utcMonthStart(now, -w), lowerDay)
        const end = utcMonthStart(now, -w + 1) - DAY_MS
        const res = await client.get<RawSumupPayout[]>(path, {
          start_date: isoDate(start),
          end_date: isoDate(end),
          order: 'desc',
          limit: PAYOUTS_MAX_LIMIT,
        })
        const rows = Array.isArray(res) ? res : []
        if (rows.length >= PAYOUTS_MAX_LIMIT) {
          throw new Error(
            `SumUp returned ${rows.length} payout records for ${isoDate(start)}..${isoDate(end)}, ` +
              'the documented maximum; the endpoint has no paging, so the month cannot be read whole.',
          )
        }
        return {
          items: rows.filter((r) => r.type === 'PAYOUT').map(transformPayout),
          next: w + 1 < windows ? w + 1 : null,
        }
      },
      { maxUpstreamPages: windows + 1 },
    )
    return items
  }

  async getPayout(): Promise<Payout> {
    throw notSupported(
      'SumUp cannot read a payout by id: its only payout endpoint is the date-range list ' +
        'GET /v1.0/merchants/{merchant_code}/payouts.',
    )
  }
}
