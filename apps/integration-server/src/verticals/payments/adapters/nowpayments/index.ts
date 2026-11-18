/**
 * NOWPayments adapter — payments vertical.
 *
 * Auth: API key in the `x-api-key` header; the payments and customer lists
 * also need a JWT from POST /v1/auth (dashboard e-mail and password).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — no balance transaction ledger API; NOWPayments has no general ledger endpoint
 * Unavailable: dispute — crypto transactions are irreversible by design; no dispute/chargeback API exists
 * Unavailable: payment-method — NOWPayments accepts cryptocurrency addresses, not traditional payment methods (cards/bank accounts)
 * Unavailable: refund — no refund endpoint; "refunded" is only a payment status (listRefunds refuses)
 */

import { minorToMajor, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Invoice } from '../../schema/invoice'
import type { Payout } from '../../schema/payout'
import type { Plan } from '../../schema/plan'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE, PAYMENT_LIST_MAX_LIMIT } from './constants'
import { buildCredentials, dashboardLogin } from './auth'
import { NowpaymentsClient } from './client'
import { verifyNowpaymentsWebhook, parseNowpaymentsWebhookEvents } from './webhook'

import { transformCustomer, type RawNowpaymentsCustomer } from './transform/customer'
import { transformCharge, type RawNowpaymentsPayment } from './transform/charge'
import { transformInvoice, type RawNowpaymentsInvoice } from './transform/invoice'
import { transformPlan, type RawNowpaymentsplan } from './transform/plan'
import { transformRefund, type RawNowpaymentsRefund } from './transform/refund'
import { transformSubscription, type RawNowpaymentsSubscription } from './transform/subscription'

/**
 * Why payouts refuse: the documented payout is crypto ("currency": "trx",
 * "amount": "94.088939"; the Withdrawals webhook example has "usdttrc20"), which the fiat Money schema cannot
 * hold without inventing an ISO code or dropping decimals.
 */
const CRYPTO_PAYOUT =
  'payouts are crypto (the documented example is "currency": "trx", "amount": "94.088939", and tickers such as "usdttrc20" occur) and the canonical payout carries only an ISO 4217 fiat currency in 2-decimal minor units'

export class NowpaymentsAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'nowpayments'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('NOWPayments uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('NOWPayments uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
      },
      {
        name: 'email',
        label: 'Dashboard e-mail (for the payments and customer lists)',
        type: 'email',
        required: false,
      },
      {
        name: 'password',
        label: 'Dashboard password (for the payments and customer lists)',
        type: 'password',
        required: false,
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyNowpaymentsWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseNowpaymentsWebhookEvents(payload)
  }

  private client(credentials: Credentials): NowpaymentsClient {
    return new NowpaymentsClient(credentials)
  }

  /**
   * One caller page of a NOWPayments offset list.
   *
   * The Recurring Payments endpoints page by `limit` ("the amount of shown
   * items") and `offset` ("setting the offset"), e.g.
   * "https://api.nowpayments.io/v1/subscriptions/plans?limit=10&offset=3",
   * and "Get customers" documents no parameter list, only its example URL,
   * "https://api.nowpayments.io/v1/sub-partner?id=111&offset=1&limit=10&order=DESC".
   * All answer `{"result":[...],"count":N}`.
   * https://documenter.gw.postman.com/api/collections/7907941/2s93JusNJt
   *
   * `offset` is taken as a row offset (the docs do not say rows or pages),
   * so page k starts at `(k − 1) × limit`. No maximum `limit` is documented,
   * so the caller's limit is sent as is. `count` is not documented as a
   * total, so the end is a short page.
   */
  private async offsetPage<R, T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    transform: (raw: R) => T,
    jwt?: string,
  ): Promise<T[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const res = await this.client(credentials).get<{ result?: R[]; count?: number }>(
      path,
      { limit, offset: pageOffset(params, limit) },
      jwt ? 'jwt' : 'apiKey',
      jwt,
    )
    const rows = res.result ?? []
    reportUpstreamPage(params, { hasMore: rows.length >= limit })
    return rows.map(transform)
  }

  /**
   * A JWT for the endpoints that need one, from the connection's dashboard
   * e-mail and password. Refuses (501, before any request) when the
   * connection was made with the API key alone.
   */
  private async jwt(credentials: Credentials, what: string): Promise<string> {
    const login = dashboardLogin(credentials)
    if (!login) {
      throw Object.assign(
        new Error(
          `NOWPayments cannot list ${what} with an API key alone: the endpoint needs a JWT from POST /v1/auth, which takes "your email and password which you are using for signing in into dashboard". Reconnect with the dashboard e-mail and password.`,
        ),
        { statusCode: 501, code: 'NOT_SUPPORTED' },
      )
    }
    return this.client(credentials).jwt(login.email, login.password)
  }

  // ── Customers ─────────────────────────────────────────────────────────────
  //
  // "Customer management / Get customers": GET /v1/sub-partner, "This method
  // returns the entire list of your customers.", Bearer JWT only.

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const jwt = await this.jwt(credentials, 'customers')
    return this.offsetPage<RawNowpaymentsCustomer, Customer>(
      credentials,
      '/sub-partner',
      params,
      transformCustomer,
      jwt,
    )
  }

  /**
   * NOWPayments has no get-one-customer endpoint; "Get customers" takes an
   * `id` filter ("https://api.nowpayments.io/v1/sub-partner?id=111&..."), so
   * the customer is the row with that id.
   */
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const jwt = await this.jwt(credentials, 'customers')
    const res = await this.client(credentials).get<{ result?: RawNowpaymentsCustomer[] }>(
      '/sub-partner',
      { id },
      'jwt',
      jwt,
    )
    const row = (res.result ?? []).find((r) => r.id != null && String(r.id) === id)
    if (!row) {
      throw Object.assign(new Error(`NOWPayments customer ${id} not found`), { statusCode: 404 })
    }
    return transformCustomer(row)
  }

  // ── Charges (payments) ────────────────────────────────────────────────────

  /**
   * "Payments / Get list of payments": GET /v1/payment/, headers
   * `Authorization: Bearer {{token}}` and `x-api-key`. "limit - number of
   * records in one page. (possible values: from 1 to 500)"; "page - the page
   * number you want to get (possible values: from 0 to page count - 1)". The
   * response is {"data":[...],"limit":10,"page":0,"pagesCount":582,"total":5815}.
   */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const jwt = await this.jwt(credentials, 'payments')
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    const limit = Math.min(asked, PAYMENT_LIST_MAX_LIMIT)
    const page = Math.max(1, params.page ?? 1)
    const res = await this.client(credentials).get<{
      data?: RawNowpaymentsPayment[]
      pagesCount?: number
      total?: number
    }>('/payment/', { limit, page: page - 1 }, 'both', jwt)
    const rows = res.data ?? []
    reportUpstreamPage(params, {
      hasMore: typeof res.pagesCount === 'number' ? page < res.pagesCount : false,
      ...(typeof res.total === 'number' ? { totalCount: res.total } : {}),
      ...(typeof res.pagesCount === 'number' ? { totalPages: res.pagesCount } : {}),
      ...(limit < asked ? { pageSize: limit } : {}),
    })
    return rows.map(transformCharge)
  }

  /** "Payments / Get payment status": GET /v1/payment/:payment_id, x-api-key; the body is the payment. */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawNowpaymentsPayment>(
      `/payment/${encodeURIComponent(id)}`,
    )
    return transformCharge(res)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw Object.assign(
      new Error(
        'NOWPayments cannot list refunds: the API has no refund endpoint; a refund appears only as the payment status "refunded - the funds were refunded back to the user;"',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawNowpaymentsRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }

  // ── Payouts ───────────────────────────────────────────────────────────────

  /**
   * Refused: NOWPayments mass payouts are crypto, and the canonical Payout is
   * fiat (an ISO 4217 code and integer minor units). "Mass payouts / List of
   * payouts" (GET /v1/payout) answers
   * {"payouts":[{ ... "currency": "trx", "amount": "94.088939", ... }]}, and
   * the collection's "Webhooks Examples" / "Withdrawals:" snippet shows a
   * payout with "currency":"usdttrc20","amount":"50"
   * (https://documenter.gw.postman.com/api/collections/7907941/2s93JusNJt).
   * Mapping them upper-cased a ticker into a pseudo-ISO code ('TRX'), rounded
   * 94.088939 to 2 decimals (9409), and threw on 'usdttrc20'.
   */
  async listPayouts(_credentials: Credentials, _params: QueryParams): Promise<Payout[]> {
    throw Object.assign(new Error(`NOWPayments cannot list payouts: ${CRYPTO_PAYOUT}`), {
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
  }

  /** Refused for the same reason as listPayouts ("Get payout status", GET /v1/payout/:payout_id). */
  async getPayout(_credentials: Credentials, _id: string): Promise<Payout> {
    throw Object.assign(new Error(`NOWPayments cannot read a payout: ${CRYPTO_PAYOUT}`), {
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
  }

  // ── Invoices ──────────────────────────────────────────────────────────────
  //
  // NOWPayments exposes invoice creation at POST /v1/invoice.
  // There is no list or get-by-id endpoint; only createInvoice is available.

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const res = await this.client(credentials).post<RawNowpaymentsInvoice>('/invoice', {
      price_amount: minorToMajor(data.total, data.currency),
      price_currency: data.currency,
      order_id: data.number,
    })
    return transformInvoice(res ?? {})
  }

  // ── Plans ─────────────────────────────────────────────────────────────────
  //
  // NOWPayments exposes recurring payment plans at GET /v1/subscriptions/plans
  // (list) and GET /v1/subscriptions/plans/:id (single).

  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    return this.offsetPage<RawNowpaymentsplan, Plan>(
      credentials,
      '/subscriptions/plans',
      params,
      transformPlan,
    )
  }

  /** "Get one plan": GET /v1/subscriptions/plans/:plan-id answers {"result":{...}}. */
  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const res = await this.client(credentials).get<{ result?: RawNowpaymentsplan }>(
      `/subscriptions/plans/${encodeURIComponent(id)}`,
    )
    if (!res.result) {
      throw Object.assign(new Error(`NOWPayments plan ${id} not found`), { statusCode: 404 })
    }
    return transformPlan(res.result)
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────
  //
  // NOWPayments exposes email subscriptions at GET /v1/subscriptions (list)
  // and POST /v1/subscriptions (create).

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    return this.offsetPage<RawNowpaymentsSubscription, Subscription>(
      credentials,
      '/subscriptions',
      params,
      transformSubscription,
    )
  }
}
