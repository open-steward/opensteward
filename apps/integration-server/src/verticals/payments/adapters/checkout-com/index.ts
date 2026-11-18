/**
 * Checkout.com adapter — payments vertical.
 *
 * OAuth 2.0 client credentials. Coverage: payments, refunds, customers,
 * instruments (payment methods), disputes, payouts. No native subscription /
 * invoice surface.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: balance-transaction — GET /financial-actions requires payment_id or action_id, so there is no unfiltered list; listBalanceTransactions throws 501 NOT_SUPPORTED.
// Unavailable: invoice      — Checkout.com has no native invoice API; invoicing is handled externally or via third-party platforms.
// Unavailable: plan         — Checkout.com has no native billing plan API; subscription plans are managed by the merchant externally.
// Unavailable: subscription — Checkout.com has no native subscription management API; recurring payments are implemented by merchants using stored card credentials against the payments endpoint.

import { pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Customer } from '../../schema/customer'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Dispute } from '../../schema/dispute'
import type { Payout } from '../../schema/payout'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { WebhookEvent } from '../../schema/webhook'

import { fetchToken } from './auth'
import { CheckoutComClient } from './client'
import { DISPUTES_DEFAULT_PAGE_SIZE, DISPUTES_MAX_PAGE_SIZE } from './constants'
import { parseCheckoutComWebhookEvents, verifyCheckoutComWebhook } from './webhook'

import { transformCharge, type RawCheckoutPayment } from './transform/charge'
import { transformRefund, type RawCheckoutRefund } from './transform/refund'
import { transformCustomer, type RawCheckoutCustomer } from './transform/customer'
import { transformPaymentMethod, type RawCheckoutInstrument } from './transform/payment-method'
import { transformDispute, type RawCheckoutDispute } from './transform/dispute'
import { transformPayout, type RawCheckoutPayout } from './transform/payout'

export class CheckoutComAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'checkout-com'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Checkout.com uses oauth2_cc; submit credentials via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Checkout.com uses oauth2_cc; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      { name: 'clientId', label: 'Client ID', type: 'text', required: true },
      { name: 'clientSecret', label: 'Client secret', type: 'password', required: true },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return fetchToken(fields.clientId ?? '', fields.clientSecret ?? '')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
    return fetchToken(String(extra.clientId ?? ''), String(extra.clientSecret ?? ''))
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyCheckoutComWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseCheckoutComWebhookEvents(payload)
  }

  private client(credentials: Credentials): CheckoutComClient {
    return new CheckoutComClient(credentials)
  }

  // ── Charges ─────────────────────────────────────────────────────────────

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawCheckoutPayment>(`/payments/${id}`)
    return transformCharge(raw)
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    return []
  }

  // ── Refunds ─────────────────────────────────────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId required for Checkout.com refund')
    const raw = await this.client(credentials).post<RawCheckoutRefund>(
      `/payments/${data.chargeId}/refunds`,
      { amount: data.amount },
    )
    return transformRefund({ ...raw, payment_id: data.chargeId, currency: data.currency })
  }

  // ── Customers ───────────────────────────────────────────────────────────

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawCheckoutCustomer>(`/customers/${id}`)
    return transformCustomer(raw)
  }

  // ── Payment methods (instruments) ───────────────────────────────────────

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const raw = await this.client(credentials).get<RawCheckoutInstrument>(`/instruments/${id}`)
    return transformPaymentMethod(raw)
  }

  // ── Disputes ────────────────────────────────────────────────────────────

  /**
   * GET /disputes pages by offset: "You can use the optional parameters below
   * to skip or limit results." (https://api-reference.checkout.com/tag/Disputes)
   * `limit` is 1..250 (default 50) and `skip` >= 0; `total_count` counts every
   * match regardless of skip/limit. The 1-based `page` becomes a skip at the
   * size actually sent, after the clamp to 250.
   *
   * No `capabilities.maxPageSize` is declared: listBalanceTransactions does not
   * page, so the router may ask for up to 500 here, and the clamp is reported
   * as `pageSize`.
   */
  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    const asked = params.limit ?? DISPUTES_DEFAULT_PAGE_SIZE
    const size = Math.min(
      Math.max(Math.floor(Number.isFinite(asked) ? asked : 1), 1),
      DISPUTES_MAX_PAGE_SIZE,
    )
    const skip = pageOffset(params, size)
    const res = await this.client(credentials).get<{
      data?: RawCheckoutDispute[]
      total_count?: number
    }>('/disputes', { limit: size, skip })
    reportUpstreamPage(params, {
      ...(typeof res.total_count === 'number'
        ? { totalCount: res.total_count, hasMore: skip + size < res.total_count }
        : {}),
      pageSize: size,
    })
    return (res.data ?? []).map(transformDispute)
  }

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const raw = await this.client(credentials).get<RawCheckoutDispute>(`/disputes/${id}`)
    return transformDispute(raw)
  }

  // ── Payouts ─────────────────────────────────────────────────────────────

  async listPayouts(_credentials: Credentials, _params: QueryParams): Promise<Payout[]> {
    // Payouts are read from the Reporting Hub; v1 surfaces them via webhooks only.
    return []
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const raw = await this.client(credentials).get<RawCheckoutPayout>(`/payouts/${id}`)
    return transformPayout(raw)
  }

  // ── Balance transactions ────────────────────────────────────────────────

  /**
   * Checkout.com has no unfiltered balance-transaction list. The documented
   * endpoint is GET /financial-actions ('/reporting/financial-actions' is not
   * in the API reference), and it needs a payment or action id: payment_id is
   * "The ID of the payment you want to retrieve financial actions for.
   * Required if `action_id` is not used."
   * (https://api-reference.checkout.com/tag/Financial-actions)
   */
  async listBalanceTransactions(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    throw Object.assign(
      new Error(
        'Checkout.com cannot list balance transactions: GET /financial-actions requires payment_id ("Required if `action_id` is not used") or action_id, so there is no unfiltered list.',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }
}
