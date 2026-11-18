/**
 * Triple-A adapter — payments vertical.
 *
 * Charges are Triple-A payments (GET /payments, GET /payment/{payment_reference})
 * and payouts are Triple-A crypto payouts (GET /payouts,
 * GET /payout/withdraw/{payout_reference}), per the vendor's
 * Crypto-Payments.yaml and Crypto-Payouts.yaml at
 * https://developers.triple-a.io/api/v1/projects/triplea-technologies/triplea-api-doc/nodes/references/.
 *
 * Auth is the OAuth 2 client-credentials grant only (see auth.ts).
 */

import { reportUpstreamPage } from '@opensteward/shared'
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Payout } from '../../schema/payout'

import {
  TRIPLE_A_CREDENTIAL_FIELDS,
  exchangeTripleACredentials,
  refreshTripleACredentials,
} from './auth'
import { TripleAClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformCharge, type RawTripleAPayment } from './transform/charge'
import { transformPayout, type RawTripleAPayout } from './transform/payout'

export class TripleAAdapter implements PaymentsAdapter {
  readonly platform = 'triple-a'
  readonly version = '0.2.0'
  /** GET /payments and GET /payouts, `page_size`: "Maximum value is `100`." */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error(
      'Triple-A implements only the OAuth 2 client-credentials grant; submit the client ID and secret via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error(
      'Triple-A implements only the OAuth 2 client-credentials grant; call exchangeCredentials instead.',
    )
  }

  credentialFields(): CredentialField[] {
    return TRIPLE_A_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeTripleACredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshTripleACredentials(credentials)
  }

  private client(credentials: Credentials): TripleAClient {
    return new TripleAClient(credentials)
  }

  /**
   * One page of GET /payments or GET /payouts. Both document the same paging
   * parameters: `page_size` ("Maximum value is `100`", default 10) and
   * `offset`, which is a 0-based PAGE index, not a row offset: "Example:
   * `offset=0&page_size=10` will retrieve records 1-10, `offset=1&page_size=10`
   * will retrieve records 11-20, and so on." `sort` takes "`asc` or `desc`"
   * (default desc); ascending keeps earlier pages stable while new records
   * arrive during a walk.
   *
   * The 200 body is a bare JSON array with no total or next marker, so a page
   * shorter than `page_size` is the only end signal.
   */
  private async listPage<R>(
    credentials: Credentials,
    path: '/payments' | '/payouts',
    params: QueryParams,
  ): Promise<R[]> {
    const asked = Math.max(Math.floor(params.limit ?? DEFAULT_PAGE_SIZE), 1)
    const size = Math.min(asked, MAX_PAGE_SIZE)
    const page =
      typeof params.page === 'number' && Number.isFinite(params.page) && params.page >= 1
        ? Math.floor(params.page)
        : 1
    const rows = await this.client(credentials).get<R[]>(path, {
      offset: page - 1,
      page_size: size,
      sort: 'asc',
    })
    if (!Array.isArray(rows)) {
      throw new Error(`Triple-A GET ${path} did not return a JSON array.`)
    }
    const hasMore = rows.length >= size
    reportUpstreamPage(params, size < asked ? { hasMore, pageSize: size } : { hasMore })
    return rows
  }

  // ── Charges (Triple-A payments) ───────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.listPage<RawTripleAPayment>(credentials, '/payments', params)
    return rows.map(transformCharge)
  }

  /** GET /payment/{payment_reference}: "Get the payment details." */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawTripleAPayment>(
      `/payment/${encodeURIComponent(id)}`,
    )
    return transformCharge(raw)
  }

  // ── Payouts ───────────────────────────────────────────────────────────────

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const rows = await this.listPage<RawTripleAPayout>(credentials, '/payouts', params)
    return rows.map(transformPayout)
  }

  /**
   * GET /payout/withdraw/{payout_reference}: "Get the details of the payout,
   * including current status etc."
   */
  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const raw = await this.client(credentials).get<RawTripleAPayout>(
      `/payout/withdraw/${encodeURIComponent(id)}`,
    )
    return transformPayout(raw)
  }
}
