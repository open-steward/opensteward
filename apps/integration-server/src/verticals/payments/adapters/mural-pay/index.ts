/**
 * Mural Pay adapter — payments vertical.
 *
 * Auth: API key, "provided via Bearer Authentication in the request header
 * for *all* requests" (https://developers.muralpay.com/docs/get-api-key.md).
 * Host: https://api.muralpay.com, with every path under "/api/..." (the
 * reference's embedded OpenAPI, e.g.
 * https://developers.muralpay.com/reference/searchpayoutrequests.md).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * charge  — payins: POST /api/payins/search, GET /api/payins/payin/{id}
 * payout  — recipient payouts of payout requests: POST /api/payouts/search,
 *           GET /api/payouts/payout/{id}
 * customer, refund — refused: Mural's reference has no such resource
 * balance-transaction — refused: the only list is per Account and the
 *           connection holds no Account id
 * Unavailable: dispute       — Mural Pay is a stablecoin-native B2B platform; no traditional payment dispute/chargeback concept exists
 * Unavailable: invoice       — Mural Pay has no invoicing system
 * Unavailable: payment-method — Mural Pay has no stored customer payment methods (cards/bank debits for charging)
 * Unavailable: plan          — Mural Pay has no subscription billing plans
 * Unavailable: subscription  — Mural Pay has no subscription billing
 */

import { connectionScope, cursorPagerKey, pageByRows } from '@opensteward/shared'
import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  CursorPage,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'

import { API_HOST, DEFAULT_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { MuralPayClient, type MuralPaginated } from './client'

import { isFiatPayin, transformCharge, type RawMuralPayin } from './transform/charge'
import { transformRefund, type RawMuralPayRefund } from './transform/refund'
import {
  PAYOUT_ID_SEPARATOR,
  isFiatPayout,
  transformPayout,
  type RawMuralPayoutRequest,
} from './transform/payout'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** The upstream page size: the caller's limit. `limit` has no documented maximum. */
function upstreamLimit(params: QueryParams): number {
  const l = params.limit
  return typeof l === 'number' && Number.isFinite(l) && l >= 1 ? Math.floor(l) : DEFAULT_PAGE_SIZE
}

export class MuralPayAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'mural-pay'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Mural Pay uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Mural Pay uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): MuralPayClient {
    return new MuralPayClient(credentials)
  }

  /**
   * Refused. Mural's reference index (https://developers.muralpay.com/llms.txt)
   * has no customer resource; the nearest list, Search Counterparties, is of
   * payout recipients: "Creates a new counterparty (recipient) that can be
   * referenced in future payouts."
   */
  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported(
      'Mural Pay cannot list customers: its API reference documents no customer resource, only counterparties, which are payout recipients',
    )
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported(
      'Mural Pay cannot read customers: its API reference documents no customer resource, only counterparties, which are payout recipients',
    )
  }

  /**
   * Payins, via Search Payins: POST /api/payins/search, "Get all Payins
   * associated with the provided Organization ID." Query params `limit`
   * (number) and `nextId` (uuid); no request body is documented. The 200 body
   * is PaginatedResponse { total, nextId } + results: Payin[].
   *
   * Payins whose source amount is a token (sourceAmount.type "blockchain")
   * have no ISO 4217 currency and are left out; the pager cuts the caller's
   * rows from what remains.
   */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const client = this.client(credentials)
    const limit = upstreamLimit(params)
    const key = cursorPagerKey(connectionScope(API_HOST, credentials), 'payins', { limit })
    const { items } = await pageByRows<Charge>(
      key,
      params,
      async (nextId): Promise<CursorPage<Charge, string>> => {
        const res = await client.post<MuralPaginated<RawMuralPayin>>(
          '/api/payins/search',
          undefined,
          nextId === undefined ? { limit } : { limit, nextId },
        )
        const results = res.results ?? []
        return {
          items: results.filter(isFiatPayin).map(transformCharge),
          next: results.length > 0 ? (res.nextId ?? null) : null,
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  /** GET /api/payins/payin/{id}: "Gets the Payin identified by the provided ID." */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawMuralPayin>(
      `/api/payins/payin/${encodeURIComponent(id)}`,
    )
    return transformCharge(raw)
  }

  /**
   * Refused. The reference index has no refund resource
   * (https://developers.muralpay.com/llms.txt); "refunded" appears only as a
   * payout or payin status, e.g. "refundTransactionId": "The transaction ID of
   * the refund in the Transactions API" on a failed fiat payout.
   */
  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported(
      'Mural Pay cannot list refunds: its API reference documents no refund resource, only a refunded status on payouts and payins',
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawMuralPayRefund }>(
      '/api/v1/refunds',
      {
        chargeId: data.chargeId,
        amount: data.amount,
      },
    )
    return transformRefund(res.data ?? {})
  }

  /**
   * Recipient payouts, flattened from Search Payout Requests: POST
   * /api/payouts/search with query params `limit` and `nextId`, and a
   * required body of MuralSearchPayoutRequestsInput, whose `filter` says "An
   * empty filter will result in all payouts being returned." The 200 body is
   * PaginatedResponse { total, nextId } + results: PayoutRequest[], each with
   * `payouts` of PayoutRequestRecipientInfo.
   *
   * A request holds any number of payouts, so the pager cuts the caller's rows
   * from the flattened stream. Blockchain payouts (details.type "blockchain")
   * are paid in a token, which has no ISO 4217 currency, and are left out.
   */
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const client = this.client(credentials)
    const limit = upstreamLimit(params)
    const key = cursorPagerKey(connectionScope(API_HOST, credentials), 'payouts', { limit })
    const { items } = await pageByRows<Payout>(
      key,
      params,
      async (nextId): Promise<CursorPage<Payout, string>> => {
        const res = await client.post<MuralPaginated<RawMuralPayoutRequest>>(
          '/api/payouts/search',
          {},
          nextId === undefined ? { limit } : { limit, nextId },
        )
        const results = res.results ?? []
        const rows: Payout[] = []
        for (const request of results) {
          for (const payout of request.payouts ?? []) {
            if (isFiatPayout(payout)) rows.push(transformPayout(request, payout))
          }
        }
        return { items: rows, next: results.length > 0 ? (res.nextId ?? null) : null }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  /**
   * Reads back an id from listPayouts, `<payoutRequestId>:<payoutId>`, through
   * GET /api/payouts/payout/{id} ("Payout request ID"), the only documented
   * read of a payout.
   */
  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const at = id.indexOf(PAYOUT_ID_SEPARATOR)
    if (at <= 0 || at === id.length - 1) {
      throw Object.assign(
        new Error(
          `Mural Pay payout ids are "<payoutRequestId>${PAYOUT_ID_SEPARATOR}<payoutId>", as listPayouts returns them; got "${id}"`,
        ),
        { statusCode: 400, code: 'INVALID_ID' },
      )
    }
    const requestId = id.slice(0, at)
    const payoutId = id.slice(at + 1)
    const request = await this.client(credentials).get<RawMuralPayoutRequest>(
      `/api/payouts/payout/${encodeURIComponent(requestId)}`,
    )
    const payout = (request.payouts ?? []).find((p) => p.id === payoutId)
    if (!payout) {
      throw Object.assign(
        new Error(`Mural Pay payout request ${requestId} has no payout ${payoutId}`),
        { statusCode: 404, code: 'NOT_FOUND' },
      )
    }
    return transformPayout(request, payout)
  }

  /**
   * Refused. The only documented list is Search Transactions, POST
   * /api/transactions/search/account/{accountId}: "Search for Transactions
   * associated with the provided Account ID". The connection holds no Account
   * id, and the canonical list takes no account filter.
   */
  async listBalanceTransactions(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    throw notSupported(
      'Mural Pay cannot list balance transactions: Search Transactions requires an Account ID ("/api/transactions/search/account/{accountId}") and the connection has none',
    )
  }
}
