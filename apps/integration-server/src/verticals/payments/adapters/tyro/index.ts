/**
 * Tyro adapter — payments vertical, on the Tyro Connect Reporting API.
 *
 * Tyro Connect documents no charges or payouts collection. Its Reporting API
 * is the read surface for a merchant's money movement:
 *
 *   "The Reporting API is a suite of read-only REST endpoints that provides
 *    transaction-level (Transactions API) and settlement-level (Settlements
 *    API) data for Tyro merchants. ... Both APIs are queried by merchant ID
 *    (`mid`) and date."
 *   https://docs.connect.tyro.com/docs/business-operations/reporting/overview.md
 *
 *   GET /reporting/merchants/{mid}/transactions?transactionDate=&limit=&page=
 *   GET /reporting/merchants/{mid}/settlements?settlementDate=
 *   https://docs.connect.tyro.com/_spec/api-explorer/reporting/1.0/index.yaml
 *
 * Both take one date per request, so a list walks UTC calendar days
 * newest-first through pageByRows. The newest day is yesterday (UTC):
 * "Transactions and settlements are available from the previous business day
 * onwards (up to 3 years retention); same-day or live pending transactions are
 * not supported." A UTC date is never ahead of the Australian terminal
 * business day, so yesterday-UTC never asks for a same-day report. The oldest
 * day is `params.updatedAfter`'s date, clamped to the documented 3-year
 * retention.
 *
 * ## Why an unfiltered list is refused
 *
 * One date per request is the widest window either endpoint documents: the
 * spec's only query parameters are `transactionDate` ("The date (YYYY-MM-DD)
 * that the terminal has processed the requested transactions"), `limit`
 * ("maximum: 2000") and `page` on transactions, and `settlementDate` alone
 * on settlements. There is no date range, no cursor across days, no
 * updated-since filter and no other merchant-wide transaction list (Sales Data
 * `GET /sales` is POS sale data per location; Embedded Payments
 * `GET /tap-to-pay/merchants/{merchantId}/transactions` covers tap-to-pay
 * only). Bounding an unfiltered list by the retention alone cost one request
 * per day, about 1,094, for page 1 of a merchant with no rows, and pageByRows
 * reads page 1 afresh on every call. So a list without `updated_after` is
 * refused with a 501 before anything is sent, and a list with it walks only
 * the days it names. The sync worker sends no `updated_after`, so it skips
 * both resources (a refusal is not a failure there).
 *
 * There is no lookup by id on either API, so getCharge and getPayout refuse.
 */

import {
  connectionScope,
  pageByRows,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Payout } from '../../schema/payout'

import { buildCredentials, extraFrom, refreshCredentials as doRefresh } from './auth'
import { TyroClient } from './client'
import { RETENTION_YEARS, TRANSACTIONS_PAGE_LIMIT } from './constants'

import { transformCharge, type RawTyroTransaction } from './transform/charge'
import { transformPayout, type RawTyroSettlement } from './transform/payout'

const DAY_MS = 86_400_000

/** reporting-transactions-response: required terminalBusinessDay, merchantDetails, transactions, pagination. */
interface TransactionsResponse {
  terminalBusinessDay: string
  transactions: RawTyroTransaction[]
  pagination: { page: number; size: number; limit: number; total: number }
}

/** reporting-settlements-response: required mid, settlementDate, settlements. */
interface SettlementsResponse {
  mid: string
  settlementDate: string
  settlements: RawTyroSettlement[]
}

function malformed(what: string, date: string): Error {
  return new Error(`Tyro Reporting ${what} response for ${date} is missing a required field`)
}

/**
 * The paging-cache scope of a connection. connectionScope fingerprints the
 * accessToken when there is no refreshToken, and the Tyro JWT is re-minted
 * every 12 hours; the client credentials are what stays fixed, so they are
 * fingerprinted instead (connectionScope hashes them; they are never stored in
 * the key in clear).
 */
function scopeOf(mid: string, credentials: Credentials): string {
  const { clientId, clientSecret } = extraFrom(credentials)
  const stable = clientId && clientSecret ? `${clientId}\0${clientSecret}` : undefined
  return connectionScope(mid, stable ? { accessToken: stable } : credentials)
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function ymd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/**
 * The days a walk covers, as UTC midnights: [oldest, newest]. Refuses (501,
 * before any request) when `params.updatedAfter` is absent: see the header.
 */
export function reportingWindow(
  params: QueryParams,
  resource: string,
  now: Date = new Date(),
): { oldest: number; newest: number } {
  const after = params.updatedAfter
  if (!(after instanceof Date) || Number.isNaN(after.getTime())) {
    throw notSupported(
      `Tyro cannot list ${resource} without updated_after: the Reporting API is "queried by merchant ID (\`mid\`) and date", one date per request, with no date range. ` +
        `An unfiltered list would send one request per day back to the retention limit ("Data is only available for dates within the past 3 years"), about 1,094 requests. ` +
        'Pass updated_after (at most 3 years back) to bound the walk.',
    )
  }
  const today = utcMidnight(now)
  const newest = today - DAY_MS
  const retention = new Date(today)
  retention.setUTCFullYear(retention.getUTCFullYear() - RETENTION_YEARS)
  // "Data is only available for dates within the past 3 years", counted from
  // Tyro's (Australian) business day, which can be one calendar day ahead of
  // the UTC date. The day exactly three years before Tyro's today is excluded,
  // so the oldest day that is inside the window at every hour of the UTC day
  // is (UTC today - 3 years) + 2 days.
  const oldest = Math.max(retention.getTime() + 2 * DAY_MS, utcMidnight(after))
  return { oldest, newest }
}

export interface TyroAdapterConfig {
  /** Unused: Tyro Connect credentials are per connection (see credentialFields). */
  [key: string]: unknown
}

export class TyroAdapter implements PaymentsAdapter {
  readonly platform = 'tyro'
  readonly version = '0.2.0'

  constructor(_config?: TyroAdapterConfig) {}

  getAuthUrl(): string {
    throw new Error(
      'Tyro Connect App integrations use the OAuth 2.0 client-credentials flow; submit client_id, client_secret and mid via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Tyro Connect uses client credentials; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      { name: 'clientId', label: 'Tyro Connect client_id', type: 'text', required: true },
      {
        name: 'clientSecret',
        label: 'Tyro Connect client_secret',
        type: 'password',
        required: true,
      },
      {
        name: 'mid',
        label: 'Merchant ID (mid)',
        type: 'text',
        required: true,
        helpText: 'The Tyro merchant ID the Reporting API is queried by.',
      },
      {
        name: 'currency',
        label: 'Settlement currency (ISO 4217)',
        type: 'text',
        required: true,
        helpText:
          'Tyro Reporting returns amounts in cents without a currency code; enter the merchant account currency.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  private client(credentials: Credentials): TyroClient {
    return new TyroClient(credentials)
  }

  /** The connection's `mid` and `currency`, or a 501 naming what is missing. Sends nothing. */
  private reportingContext(
    credentials: Credentials,
    resource: string,
  ): { mid: string; currency: string } {
    const { mid, currency } = extraFrom(credentials)
    if (!mid) {
      throw notSupported(
        `Tyro cannot list ${resource}: the Reporting API is "queried by merchant ID (\`mid\`)" and this connection has no mid; reconnect with one.`,
      )
    }
    if (!currency) {
      throw notSupported(
        `Tyro cannot list ${resource}: Reporting amounts carry no currency code and this connection has no currency; reconnect with one.`,
      )
    }
    return { mid, currency }
  }

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const { mid, currency } = this.reportingContext(credentials, 'charges')
    const { oldest, newest } = reportingWindow(params, 'charges')
    const client = this.client(credentials)
    const path = `/reporting/merchants/${encodeURIComponent(mid)}/transactions`
    const key = `tyro:transactions:${scopeOf(mid, credentials)}:${ymd(oldest)}:${ymd(newest)}:${TRANSACTIONS_PAGE_LIMIT}`
    const days = Math.max(0, Math.round((newest - oldest) / DAY_MS) + 1)

    const result = await pageByRows<Charge, string>(
      key,
      params,
      async (cursor) => {
        if (newest < oldest) return { items: [] }
        const [date, pageStr] = (cursor ?? `${ymd(newest)}|1`).split('|') as [string, string]
        const page = Number(pageStr)
        const res = await client.get<TransactionsResponse>(path, {
          transactionDate: date,
          limit: TRANSACTIONS_PAGE_LIMIT,
          page,
        })
        if (
          !Array.isArray(res.transactions) ||
          typeof res.terminalBusinessDay !== 'string' ||
          typeof res.pagination?.total !== 'number'
        ) {
          throw malformed('transactions', date)
        }
        const rows = res.transactions
        // Refunds are transactions too ("isRefund: Whether this transaction is
        // a refund"); they are not charges.
        const items = rows
          .filter((t) => t.isRefund !== true)
          .map((t) =>
            transformCharge(t, { currency, terminalBusinessDay: res.terminalBusinessDay }),
          )
        if (page * TRANSACTIONS_PAGE_LIMIT < res.pagination.total) {
          return { items, next: `${date}|${page + 1}` }
        }
        const prev = Date.parse(`${date}T00:00:00Z`) - DAY_MS
        return { items, next: prev >= oldest ? `${ymd(prev)}|1` : undefined }
      },
      { maxUpstreamPages: days + 1000 },
    )
    return result.items
  }

  async getCharge(): Promise<Charge> {
    throw notSupported(
      'Tyro cannot get a charge by id: the Reporting API lists transactions only "for a given terminal business day" and has no lookup by transactionId.',
    )
  }

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const { mid, currency } = this.reportingContext(credentials, 'payouts')
    const { oldest, newest } = reportingWindow(params, 'payouts')
    const client = this.client(credentials)
    const path = `/reporting/merchants/${encodeURIComponent(mid)}/settlements`
    const key = `tyro:settlements:${scopeOf(mid, credentials)}:${ymd(oldest)}:${ymd(newest)}`
    const days = Math.max(0, Math.round((newest - oldest) / DAY_MS) + 1)

    const result = await pageByRows<Payout, string>(
      key,
      params,
      async (cursor) => {
        if (newest < oldest) return { items: [] }
        const date = cursor ?? ymd(newest)
        // The only query parameter is `settlementDate`; the endpoint does not page.
        const res = await client.get<SettlementsResponse>(path, { settlementDate: date })
        if (!Array.isArray(res.settlements) || typeof res.settlementDate !== 'string') {
          throw malformed('settlements', date)
        }
        const items = res.settlements.map((s) =>
          transformPayout(s, { currency, mid, settlementDate: res.settlementDate }),
        )
        const prev = Date.parse(`${date}T00:00:00Z`) - DAY_MS
        return { items, next: prev >= oldest ? ymd(prev) : undefined }
      },
      { maxUpstreamPages: days + 10 },
    )
    return result.items
  }

  async getPayout(): Promise<Payout> {
    throw notSupported(
      'Tyro cannot get a payout by id: the Settlements API returns "settlements for the specified merchant on the given date" and has no lookup by clearingPaymentId.',
    )
  }
}
