/**
 * CoinGate adapter — payments vertical (crypto payment gateway).
 *
 * CoinGate is order-centric: an **Order** carries the amount, currency and
 * payment status, so it maps onto the canonical **Charge**. Creating a charge
 * mints a CoinGate order (and returns a hosted `payment_url` checkout link).
 * Refunds are created against an order (`POST /orders/{id}/refunds`) and also
 * listed account-wide (`GET /refunds`).
 *
 * Auth: a single API token sent as `Authorization: Token <token>`. Live and
 * sandbox are separate environments with separate tokens, selected on the
 * form. No OAuth, no refresh.
 *
 * Webhooks (callbacks): verified by a per-order `token` echoed in the body,
 * not an HMAC header (see webhook.ts).
 *
 * Docs: https://developer.coingate.com/reference/api-overview
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: customer        — CoinGate has no standalone customer resource; shopper data is embedded on the order.
 * Unavailable: dispute         — Crypto payments are immutable on-chain; CoinGate has no dispute concept or endpoint.
 * Unavailable: payment-method  — Crypto-only gateway; no traditional card/bank payment method storage.
 * Unavailable: plan            — No subscription plan/pricing catalog in CoinGate's API.
 * Unverified:  balance-transaction — GET /v2/ledger/transactions endpoint is confirmed to exist but response field schema could not be verified from public docs.
 * Unverified:  invoice         — GET /billing/requests endpoint exists (invoice-like billing requests) but response field schema could not be verified from public docs.
 * Unverified:  subscription    — GET /billing/subscriptions endpoint referenced in docs index but page returns 404; schema unverifiable.
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE, ORDERS_PATH, REFUNDS_PATH, SENDS_PATH, orderRefundsPath } from './constants'
import { buildCredentials } from './auth'
import { CoingateClient, type CoingatePage, pageItems } from './client'
import { parseCoingateWebhookEvents, verifyCoingateWebhook } from './webhook'

import { transformCharge, type RawCoingateOrder } from './transform/charge'
import { transformPayout, type RawCoingateSend } from './transform/payout'
import { transformRefund, type RawCoingateRefund } from './transform/refund'

export class CoingateAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'coingate'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('CoinGate uses an API token; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('CoinGate uses an API token; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiToken',
        label: 'API token',
        type: 'password',
        required: true,
        placeholder: 'YOUR_API_TOKEN',
        helpText:
          'Generate an API app token in the CoinGate dashboard (Apps → API). Sandbox tokens must be minted at sandbox.coingate.com.',
      },
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'live', label: 'Live (api.coingate.com)' },
          { value: 'sandbox', label: 'Sandbox (api-sandbox.coingate.com)' },
        ],
        helpText: 'Live and sandbox are separate accounts with separate tokens.',
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
    return verifyCoingateWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseCoingateWebhookEvents(payload)
  }

  private client(credentials: Credentials): CoingateClient {
    return new CoingateClient(credentials)
  }

  /** CoinGate paginates with 1-based `page` + `per_page` (1–100), plus `sort`. */
  private pageParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = { per_page: params.limit ?? DEFAULT_PAGE_SIZE }
    if (typeof params.page === 'number') out.page = params.page
    return out
  }

  // ── Charges (CoinGate Orders) ───────────────────────────────────────────────
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const res = await this.client(credentials).get<CoingatePage<RawCoingateOrder>>(
      ORDERS_PATH,
      this.pageParams(params),
    )
    return pageItems<RawCoingateOrder>(res, 'orders').map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawCoingateOrder>(`${ORDERS_PATH}/${id}`)
    return transformCharge(res ?? {})
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    if (data.amount === undefined) throw new Error('amount is required to create a CoinGate order')
    if (!data.currency) throw new Error('currency is required to create a CoinGate order')
    // Canonical amount is integer minor units; CoinGate prices in major-unit
    // decimal strings, so divide by 100 back to a fiat-style major amount.
    const priceAmount = (data.amount / 100).toString()
    const res = await this.client(credentials).post<RawCoingateOrder>(ORDERS_PATH, {
      order_id: data.externalId,
      price_amount: priceAmount,
      price_currency: data.currency,
      // Settle in the same currency the order is priced in unless the merchant
      // configures conversion elsewhere; CoinGate accepts the price currency as
      // the receive currency for a no-conversion order.
      receive_currency: data.currency,
      title: data.description ?? 'Order',
      description: data.description ?? 'Order',
    })
    return transformCharge(res ?? {})
  }

  // ── Payouts (CoinGate Send Requests) ───────────────────────────────────────
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const res = await this.client(credentials).get<CoingatePage<RawCoingateSend>>(
      SENDS_PATH,
      this.pageParams(params),
    )
    return pageItems<RawCoingateSend>(res, 'sends').map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<RawCoingateSend>(`${SENDS_PATH}/${id}`)
    return transformPayout(res ?? {})
  }

  // ── Refunds ─────────────────────────────────────────────────────────────────
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const res = await this.client(credentials).get<CoingatePage<RawCoingateRefund>>(
      REFUNDS_PATH,
      this.pageParams(params),
    )
    return pageItems<RawCoingateRefund>(res, 'refunds').map(transformRefund)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const orderId = data.chargeId
    if (!orderId) throw new Error('chargeId (CoinGate order id) is required for a refund')
    const res = await this.client(credentials).post<RawCoingateRefund>(orderRefundsPath(orderId), {
      // Canonical amount is integer minor units → CoinGate major-unit string.
      amount: data.amount !== undefined ? (data.amount / 100).toString() : undefined,
      reason: data.reason,
    })
    return transformRefund(res ?? {})
  }
}
