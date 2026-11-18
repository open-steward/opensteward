/**
 * Vipps MobilePay adapter — payments vertical (Nordic anchor).
 *
 * Vipps MobilePay is the dominant mobile wallet across Norway, Denmark and
 * Finland (the merged Vipps + MobilePay product). Its ePayment API models money
 * movement around a single **payment** object that is created, authorized
 * (reserved), captured, refunded and/or cancelled — which we map onto the
 * canonical `Charge`, with refunds onto canonical `Refund`.
 *
 * Auth: api_key. There is no OAuth redirect flow. The merchant supplies four
 * values (client_id, client_secret, Ocp-Apim-Subscription-Key, merchant serial
 * number) plus the environment through the Connect Link form; the adapter
 * exchanges them for a short-lived Bearer access token via the Access Token API
 * (see `auth.ts`). `refreshCredentials` re-runs that grant from `extra`.
 *
 * Resources implemented:
 *   - Charges:       get, create, capture, cancel  (ePayment API)
 *   - Refunds:       create                         (ePayment API)
 *   - Subscriptions: list, get                      (Recurring API /recurring/v3)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — no discrete balance-transaction object in the ePayment API; settlement ledger entries live in the separate Report API which requires its own ledger discovery flow
 * Unavailable: customer — no customer management API; the only user identifier is the pseudonymous `sub` claim on payment/agreement objects
 * Unavailable: dispute — no disputes/chargebacks API; chargeback ledger entries surface only in the Report API
 * Unavailable: invoice — no invoice API
 * Unavailable: payment-method — no stored payment-method management API; method is always WALLET with no CRUD surface
 * Unavailable: payout — no discrete payout object; bank transfers are ledger entries in the Report API only
 * Unavailable: plan — no plan/price/product catalog API; Recurring API embeds pricing directly in each agreement
 *
 * There are NO list endpoints on the ePayment API (payments are read one
 * reference at a time; bulk reporting lives in a separate Report API), no
 * standalone customer resource (only a `profile.sub` pseudonymous id), and no
 * `GET /refunds/{id}` — so list / customer / getRefund / invoice / payout /
 * dispute / plan methods are intentionally omitted and auto-501.
 *
 * Docs: https://developer.vippsmobilepay.com/docs/APIs/epayment-api/
 */

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_CURRENCY, RECURRING_BASE_PATH } from './constants'
import { CREDENTIAL_FORM, extraOf, fetchAccessToken } from './auth'
import { VippsMobilepayClient } from './client'
import {
  verifyVippsMobilepayWebhook,
  parseVippsMobilepayWebhookEvents,
} from './webhook'

import { transformCharge, type RawVippsPayment } from './transform/charge'
import { transformRefund, type RawVippsRefundResponse } from './transform/refund'
import { transformSubscription, type RawVippsAgreement } from './transform/subscription'

export class VippsMobilepayAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'vipps-mobilepay'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error(
      'Vipps MobilePay uses API keys (api_key); submit them via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Vipps MobilePay uses API keys; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return CREDENTIAL_FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return CREDENTIAL_FORM.exchangeCredentials(fields)
  }

  /**
   * Re-run the access-token grant from the persisted API keys on
   * `credentials.extra`. The Bearer token is short-lived (1h test / 24h prod)
   * so the platform calls this whenever the token is near expiry.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const extra = extraOf(credentials)
    const token = await fetchAccessToken(extra)
    return {
      ...credentials,
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
      extra: { ...extra },
    }
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyVippsMobilepayWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseVippsMobilepayWebhookEvents(payload)
  }

  private client(credentials: Credentials): VippsMobilepayClient {
    return new VippsMobilepayClient(credentials)
  }

  /** Recurring API client — same credentials, different base path. */
  private recurringClient(credentials: Credentials): VippsMobilepayClient {
    return new VippsMobilepayClient(credentials, RECURRING_BASE_PATH)
  }

  // ── Charges (ePayment payment object) ──────────────────────────────────────

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawVippsPayment>(`/payments/${id}`)
    return transformCharge(res ?? {})
  }

  /**
   * Create + authorize a Vipps payment. The canonical `amount` is in minor
   * units; `metadata.reference` (when present) is used as the merchant payment
   * reference, otherwise one is minted. Callers driving the hosted wallet flow
   * pass the return URL via `metadata.returnUrl`.
   */
  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    if (data.amount === undefined) throw new Error('amount required to create a Vipps payment')
    const currency = (data.currency ?? DEFAULT_CURRENCY).toUpperCase()
    const reference = data.metadata?.['reference'] ?? `charge-${Date.now()}`
    const returnUrl = data.metadata?.['returnUrl']
    // WEB_REDIRECT requires returnUrl; QR requires neither returnUrl nor customer.
    // PUSH_MESSAGE requires customer.phoneNumber which we don't collect here, so
    // we must not default to it — QR is the safe no-prerequisite fallback.
    const userFlow = returnUrl ? 'WEB_REDIRECT' : 'QR'

    const body: Record<string, unknown> = {
      amount: { value: data.amount, currency },
      paymentMethod: { type: 'WALLET' },
      reference,
      userFlow,
      paymentDescription: data.description ?? `Payment ${reference}`,
    }
    if (returnUrl) body.returnUrl = returnUrl

    await this.client(credentials).post<{ reference?: string; redirectUrl?: string }>(
      '/payments',
      body,
    )
    return this.getCharge(credentials, String(reference))
  }

  /**
   * Capture a previously-authorized payment. Captures the full authorized
   * amount by default, or a partial `amount` when supplied. Re-reads the
   * payment afterwards so the canonical charge reflects updated aggregates.
   */
  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const current = await this.getCharge(credentials, id)
    const value = data?.amount ?? current.amount
    await this.client(credentials).post(`/payments/${id}/capture`, {
      modificationAmount: { value, currency: current.currency },
    })
    return this.getCharge(credentials, id)
  }

  /**
   * Cancel an uncaptured (authorized) payment — releases the reservation. Maps
   * to `POST /epayment/v1/payments/{reference}/cancel`. Re-reads afterwards.
   */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    await this.client(credentials).post(`/payments/${id}/cancel`, {})
    return this.getCharge(credentials, id)
  }

  // ── Subscriptions (Recurring API agreements) ───────────────────────────────

  /**
   * List all Recurring API agreements for the merchant. The Recurring API
   * returns a bare array of agreement objects — no pagination envelope.
   *
   * Docs: https://developer.vippsmobilepay.com/docs/APIs/recurring-api/
   */
  async listSubscriptions(
    credentials: Credentials,
    _params: QueryParams,
  ): Promise<Subscription[]> {
    const res = await this.recurringClient(credentials).get<RawVippsAgreement[]>('/agreements')
    return (res ?? []).map((a) => transformSubscription(a))
  }

  /** Retrieve a single agreement by its `agreementId`. */
  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.recurringClient(credentials).get<RawVippsAgreement>(`/agreements/${id}`)
    return transformSubscription(res ?? {})
  }

  // ── Refunds ────────────────────────────────────────────────────────────────

  /**
   * Refund a captured Vipps payment. The canonical `chargeId` is the Vipps
   * payment `reference`. Refunds the full captured amount by default, or a
   * partial `amount` when supplied.
   */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId required for Vipps MobilePay refund')
    const reference = data.chargeId
    // Derive the refund amount + currency: explicit when supplied, else fall
    // back to the captured amount on the current payment.
    let value = data.amount
    let currency = data.currency
    if (value === undefined || !currency) {
      const charge = await this.getCharge(credentials, reference)
      value = value ?? charge.amountCaptured ?? charge.amount
      currency = currency ?? charge.currency
    }
    const modificationAmount = { value: value ?? 0, currency: (currency ?? DEFAULT_CURRENCY).toUpperCase() }

    const res = await this.client(credentials).post<RawVippsRefundResponse>(
      `/payments/${reference}/refund`,
      { modificationAmount },
    )
    return transformRefund(res ?? {}, { reference, modificationAmount })
  }
}
