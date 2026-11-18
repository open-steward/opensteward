/**
 * Global Payments (GP-API) adapter: payments vertical.
 *
 * Charges are GP-API transactions of type SALE (GET /ucp/transactions,
 * GET /ucp/transactions/{id}); payouts are settlement deposits
 * (GET /ucp/settlement/deposits, GET /ucp/settlement/deposits/{id}).
 * GP-API has no /charges or /payouts path.
 *
 * Auth is the app-credential token exchange (POST /ucp/accesstoken, see
 * auth.ts), not an authorization-code redirect, so connections are made
 * through the Connect form with the app id and app key.
 *
 * Paging: both lists take "page" ("Indicates the page sequence to return in
 * the response. ... 1 means the first page, 2 the second and so on.") and
 * "page_size" (maximum 1000). The end signal is `current_page_size`: "If
 * current_page_size is less than the page_size using in the querystring then
 * this is the final page for that search." `total_record_count` is "returned
 * on the first page only and when the date range is a month or less".
 *
 * Docs: https://developer.globalpayments.com/api/transactions,
 *       https://developer.globalpayments.com/api/settlement-reporting,
 *       https://developer.globalpayments.com/api/access-token
 */

import { DEFAULT_PAGE_LIMIT, reportUpstreamPage } from '@opensteward/shared'
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Payout } from '../../schema/payout'

import { exchangeCredentials as doExchangeCredentials, mintToken, readExtra } from './auth'
import { GlobalPaymentsClient } from './client'
import { DEPOSITS_PATH, MAX_PAGE_SIZE, TRANSACTIONS_PATH } from './constants'

import { transformCharge, type RawGlobalPaymentsTransaction } from './transform/charge'
import { transformPayout, type RawGlobalPaymentsDeposit } from './transform/payout'

interface GpListResponse {
  total_record_count?: number
  current_page_size?: number
}

interface TransactionList extends GpListResponse {
  transactions?: RawGlobalPaymentsTransaction[]
}

interface DepositList extends GpListResponse {
  deposits?: RawGlobalPaymentsDeposit[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class GlobalPaymentsAdapter implements PaymentsAdapter {
  readonly platform = 'global-payments'
  readonly version = '0.2.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error(
      'Global Payments uses app credentials; submit the app id and app key via the Connect form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Global Payments uses app credentials; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'appId',
        label: 'App ID',
        type: 'text',
        required: true,
        helpText: 'The id of your GP-API app, sent as app_id to POST /accesstoken.',
      },
      {
        name: 'appKey',
        label: 'App Key',
        type: 'password',
        required: true,
        helpText: 'Your GP-API app key. Used to build the SHA-512 secret; never sent itself.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return doExchangeCredentials(fields)
  }

  /** Tokens are minted from the stored app credentials, never refreshed. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return mintToken(readExtra(credentials))
  }

  private client(credentials: Credentials): GlobalPaymentsClient {
    return new GlobalPaymentsClient(credentials)
  }

  /**
   * The caller's 1-based page and limit, clamped to the documented 1000, in
   * ascending creation order so rows created during a walk land after it
   * rather than shifting every later page (order / order_by are documented
   * on both lists; the default order is DESC).
   */
  private pageParams(params: QueryParams): { query: Record<string, unknown>; size: number } {
    const page =
      typeof params.page === 'number' && Number.isFinite(params.page) && params.page >= 1
        ? Math.floor(params.page)
        : 1
    const asked =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_PAGE_LIMIT
    const size = Math.min(asked, MAX_PAGE_SIZE)
    if (size < asked) reportUpstreamPage(params, { pageSize: size })
    return { query: { page, page_size: size, order: 'ASC', order_by: 'TIME_CREATED' }, size }
  }

  /** Report the platform's own end signal and first-page total. */
  private reportPage(params: QueryParams, res: GpListResponse, rows: number, size: number): void {
    const returned = typeof res.current_page_size === 'number' ? res.current_page_size : rows
    if (typeof res.total_record_count === 'number') {
      reportUpstreamPage(params, { totalCount: res.total_record_count })
    }
    if (returned < size) reportUpstreamPage(params, { hasMore: false })
  }

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const { query, size } = this.pageParams(params)
    // `type`: "Describes whether the transaction is a SALE, that moves funds
    // from Payer to Merchant, or a REFUND where funds move from Merchant to Payer."
    const res = await this.client(credentials).get<TransactionList>(TRANSACTIONS_PATH, {
      ...query,
      type: 'SALE',
    })
    const rows = res.transactions ?? []
    this.reportPage(params, res, rows.length, size)
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawGlobalPaymentsTransaction>(
      `${TRANSACTIONS_PATH}/${encodeURIComponent(id)}`,
    )
    if (raw.type !== 'SALE') {
      throw Object.assign(
        new Error(
          `Global Payments transaction ${id} is a ${String(raw.type)}, not a charge (SALE)`,
        ),
        {
          statusCode: 404,
          code: 'NOT_FOUND',
        },
      )
    }
    return transformCharge(raw)
  }

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    // GET /settlement/deposits declares `account_name` required: true, "A
    // meaningful label for the merchant account set by Global Payments."
    const accountName = readExtra(credentials).accountName
    if (!accountName) {
      throw notSupported(
        'Global Payments cannot list payouts for this connection: GET /settlement/deposits requires account_name ("A meaningful label for the merchant account set by Global Payments."), and the connection has no accountName.',
      )
    }
    const { query, size } = this.pageParams(params)
    const res = await this.client(credentials).get<DepositList>(DEPOSITS_PATH, {
      ...query,
      account_name: accountName,
    })
    const rows = res.deposits ?? []
    this.reportPage(params, res, rows.length, size)
    return rows.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const raw = await this.client(credentials).get<RawGlobalPaymentsDeposit>(
      `${DEPOSITS_PATH}/${encodeURIComponent(id)}`,
    )
    return transformPayout(raw)
  }
}
