/**
 * TrueLayer adapter: payments vertical (Payments API v3).
 *
 * TrueLayer has no charges or payouts collection. The Payments API v3 GET
 * paths are single-resource reads (GET /v3/payments/{id}, GET
 * /v3/payouts/{id}) plus one list, GET /v3/merchant-accounts/{id}/transactions,
 * whose `type` query parameter "Filters transactions by payments or payouts.
 * If omitted, both payments and payouts are returned."
 * (https://docs.truelayer.com/reference/merchant-account-get-transactions).
 * Charges are its `merchant_account_payment` rows (`type=payment`), payouts its
 * `payout` rows (`type=payout`).
 *
 * That list needs two things the caller does not send:
 *
 * - The merchant account `{id}`: "You must provide the `id` of the merchant
 *   account to get transactions for as a path parameter in your request."
 *   It is read from the connection (`credentials.extra.merchantAccountId`);
 *   without it the lists refuse with 501.
 * - A date range: `from` and `to` are both `required: true`, and "The range
 *   between `from` and `to` cannot be more than 31 days if there are more
 *   than 2,000 transactions." The docs name no retention or lookback limit,
 *   so an unfiltered list refuses with 501, and a list with `updatedAfter`
 *   walks UTC calendar months newest-first down to it.
 *
 * Within a window, pages are fixed: "the `/v3/merchant-account/{id}/transactions`
 * endpoint returns paginated responses, which each contain 2,000 transactions
 * and a `next_cursor` string", and "When the response no longer contains the
 * `pagination.next_cursor` object, you have retrieved all transactions."
 * There is no page-size parameter, so the caller's pages are cut out of the
 * upstream pages with pageByRows. "If you created your Console account before
 * [December 2023], you may need to manually include pagination ... include
 * the `tl-enable-pagination:true` header in any requests you make", so every
 * transactions request sends it.
 *
 * Auth is the Payments API v3 client-credentials grant (auth.ts), so
 * connections are made through the Connect form with the client id and
 * secret, not an authorization-code redirect.
 *
 * Docs: https://docs.truelayer.com/docs/get-your-merchant-account-transactions-or-payment-sources,
 *       https://docs.truelayer.com/reference/get-payment-1,
 *       https://docs.truelayer.com/reference/get-payout,
 *       https://docs.truelayer.com/reference/generateaccesstoken
 */

import { connectionScope, pageByRows } from '@opensteward/shared'
import type { CredentialField, Credentials, CursorPage, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Payout } from '../../schema/payout'

import { exchangeCredentials as doExchangeCredentials, mintToken, readExtra } from './auth'
import { TrueLayerClient } from './client'
import { MERCHANT_ACCOUNTS_PATH, PAYMENTS_PATH, PAYOUTS_PATH } from './constants'

import {
  transformPaymentCharge,
  transformTransactionCharge,
  type RawTrueLayerMerchantAccountPayment,
  type RawTrueLayerPayment,
} from './transform/charge'
import {
  transformPayout,
  transformTransactionPayout,
  type RawTrueLayerPayout,
  type RawTrueLayerPayoutTransaction,
} from './transform/payout'

/** GetTransactions: `items` and `pagination` are both required. */
interface GetTransactionsResponse {
  items: { type: string; [key: string]: unknown }[]
  pagination?: { next_cursor?: string }
}

/** One position in the newest-first walk: a window and the cursor inside it. */
export interface TransactionsCursor {
  from: string
  to: string
  cursor?: string
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** `YYYY-MM-DDTHH:MM:SSZ`, the documented timestamp format at second precision. */
function isoSeconds(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function monthStart(d: Date, back = 0): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1))
}

/**
 * The window before the one that starts at `from`: the previous UTC calendar
 * month (at most 31 days), cut at the lower bound. Undefined once the walk has
 * reached the lower bound.
 */
function previousWindow(from: string, lower: Date): TransactionsCursor | undefined {
  const to = new Date(from)
  if (to.getTime() <= lower.getTime()) return undefined
  const start = monthStart(new Date(to.getTime() - 1))
  return {
    from: isoSeconds(start.getTime() < lower.getTime() ? lower : start),
    to: isoSeconds(to),
  }
}

/** The newest window: the current UTC calendar month up to now, cut at the lower bound. */
function firstWindow(lower: Date): TransactionsCursor | undefined {
  const now = new Date()
  now.setUTCMilliseconds(0)
  if (now.getTime() <= lower.getTime()) return undefined
  const start = monthStart(now)
  return {
    from: isoSeconds(start.getTime() < lower.getTime() ? lower : start),
    to: isoSeconds(now),
  }
}

export class TrueLayerAdapter implements PaymentsAdapter {
  readonly platform = 'truelayer'
  readonly version = '0.2.0'

  getAuthUrl(): string {
    throw new Error(
      'TrueLayer Payments API v3 uses the client-credentials grant; submit the client id and secret via the Connect form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error(
      'TrueLayer Payments API v3 uses the client-credentials grant; call exchangeCredentials instead.',
    )
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'clientId',
        label: 'Client ID',
        type: 'text',
        required: true,
        helpText: 'The Client ID found in TrueLayer Console.',
      },
      {
        name: 'clientSecret',
        label: 'Client Secret',
        type: 'password',
        required: true,
        helpText: 'The Client Secret found in TrueLayer Console.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return doExchangeCredentials(fields)
  }

  /** Tokens are minted from the stored client credentials, never refreshed. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return mintToken(readExtra(credentials))
  }

  private client(credentials: Credentials): TrueLayerClient {
    return new TrueLayerClient(credentials)
  }

  /**
   * The caller's page of one row type out of the merchant-account
   * transactions, walked newest-first through UTC calendar months down to
   * `updatedAfter`, each month through its `next_cursor` chain.
   */
  private async listTransactions<R>(
    credentials: Credentials,
    params: QueryParams,
    resource: 'charges' | 'payouts',
    type: 'payment' | 'payout',
    keep: (row: { type: string }) => boolean,
    transform: (row: never) => R,
  ): Promise<R[]> {
    const extra = readExtra(credentials)
    if (!extra.merchantAccountId) {
      throw notSupported(
        `TrueLayer cannot list ${resource} for this connection: GET /v3/merchant-accounts/{id}/transactions requires the merchant account id ("You must provide the \`id\` of the merchant account to get transactions for as a path parameter in your request."), and the connection has no merchantAccountId.`,
      )
    }
    if (!(params.updatedAfter instanceof Date) || Number.isNaN(params.updatedAfter.getTime())) {
      throw notSupported(
        `TrueLayer cannot list ${resource} without updatedAfter: GET /v3/merchant-accounts/{id}/transactions requires \`from\` and \`to\` ("The range between \`from\` and \`to\` cannot be more than 31 days if there are more than 2,000 transactions.") and documents no retention limit to start an unfiltered walk from.`,
      )
    }
    const lower = new Date(params.updatedAfter.getTime())
    lower.setUTCMilliseconds(0)
    const merchantAccountId = extra.merchantAccountId
    const client = this.client(credentials)
    const path = `${MERCHANT_ACCOUNTS_PATH}/${encodeURIComponent(merchantAccountId)}/transactions`
    // The walk depends on the connection, the merchant account, the row type
    // and the lower bound; the upstream page is a fixed 2,000 rows. The
    // client secret is what identifies a client-credentials connection.
    const key = [
      'truelayer',
      connectionScope(`${extra.clientId}:${merchantAccountId}`, {
        accessToken: extra.clientSecret || credentials.accessToken,
      }),
      resource,
      type,
      isoSeconds(lower),
    ].join(':')

    const fetch = async (
      at: TransactionsCursor | undefined,
    ): Promise<CursorPage<R, TransactionsCursor>> => {
      const pos = at ?? firstWindow(lower)
      if (!pos) return { items: [], next: null }
      const query: Record<string, unknown> = { from: pos.from, to: pos.to, type }
      if (pos.cursor) query.cursor = pos.cursor
      const res = await client.get<GetTransactionsResponse>(path, query, {
        'tl-enable-pagination': 'true',
      })
      const rows = (res.items ?? []).filter(keep).map((row) => transform(row as never))
      const nextCursor = res.pagination?.next_cursor
      const next = nextCursor
        ? { from: pos.from, to: pos.to, cursor: nextCursor }
        : previousWindow(pos.from, lower)
      return { items: rows, next: next ?? null }
    }

    const page = await pageByRows<R, TransactionsCursor>(key, params, fetch)
    return page.items
  }

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    return this.listTransactions<Charge>(
      credentials,
      params,
      'charges',
      'payment',
      // TransactionMerchantAccountPayment: "Payment into the merchant account
      // initiated by a TrueLayer Payment". `external_payment` rows are not
      // TrueLayer payments and carry no `payment_id`.
      (row) => row.type === 'merchant_account_payment',
      (row: RawTrueLayerMerchantAccountPayment) => transformTransactionCharge(row),
    )
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawTrueLayerPayment>(
      `${PAYMENTS_PATH}/${encodeURIComponent(id)}`,
    )
    return transformPaymentCharge(raw)
  }

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    return this.listTransactions<Payout>(
      credentials,
      params,
      'payouts',
      'payout',
      // TransactionPayoutExecuted: "Payment out of the merchant account".
      (row) => row.type === 'payout',
      (row: RawTrueLayerPayoutTransaction) => transformTransactionPayout(row),
    )
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const raw = await this.client(credentials).get<RawTrueLayerPayout>(
      `${PAYOUTS_PATH}/${encodeURIComponent(id)}`,
    )
    return transformPayout(raw)
  }
}
