/**
 * Atome adapter — payments vertical (buy-now-pay-later, South-East Asia anchor).
 *
 * Atome (apaylater) v2 is payment-centric: a **payment**
 * (`GET /payments/{referenceId}`) carries the amount, currency, status, the
 * settled `paymentTransaction`, and the `refundTransactions[]` history, so it
 * maps onto the canonical **Charge**. Creating, cancelling, and refunding all
 * operate on that one resource; refunds return the whole payment with the new
 * entry appended, which the adapter resolves back to a canonical **Refund**.
 *
 * Auth: HTTP Basic — a Base64-encoded `username:password` issued by Atome (see
 * auth.ts), sent as `Authorization: Basic <token>`. The merchant also picks
 * sandbox vs. production, stashed on `credentials.extra.environment`.
 *
 * Webhooks ("Callback"): Atome HMAC-SHA256-signs the raw body and sends the
 * signature in `X-Signature`; the body carries only `referenceId` (see
 * webhook.ts), so a delivery is a charge status-change ping.
 *
 * Methods deliberately left off (auto-501): there is **no list/collection
 * endpoint** (so no `listCharges` / `listRefunds` — payments are addressed
 * individually by `referenceId`), and Atome does not model customers, payment
 * methods, subscriptions, invoices, payouts, disputes, plans/prices/products,
 * or balance transactions as first-class REST resources.
 *
 * Docs: https://doc.apaylater.com/v2/
 */
// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   charge, refund
// Unavailable: balance-transaction — Atome v2 has no balance/settlement ledger endpoint
// Unavailable: customer            — consumers are not queryable REST resources; contact info is inline at payment creation
// Unavailable: dispute             — Atome v2 has no dispute or chargeback API endpoint
// Unavailable: invoice             — Atome v2 has no invoice API endpoint
// Unavailable: payment-method      — stored payment methods are not exposed; instalment plans live in the Atome consumer app
// Unavailable: payout              — Atome v2 has no payout or settlement disbursement API endpoint
// Unavailable: plan                — no plan/price/product endpoint; instalment tenors are fixed per market
// Unavailable: subscription        — Atome v2 has no subscription or recurring-billing API endpoint

import type { BaseAdapter, CredentialField, Credentials } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { PAYMENTS_PATH, paymentPath, paymentRefundPath, paymentCancelPath } from './constants'
import { AtomeCredentialForm } from './auth'
import { AtomeClient } from './client'
import { parseAtomeWebhookEvents, verifyAtomeWebhook } from './webhook'

import {
  transformCharge,
  type RawAtomePayment,
  type RawAtomeRefundTransaction,
} from './transform/charge'
import { transformRefund } from './transform/refund'
import { pickCurrency } from './transform/shared'

export class AtomeAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'atome'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Atome uses HTTP Basic auth; submit username/password via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Atome uses HTTP Basic auth; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return AtomeCredentialForm.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return AtomeCredentialForm.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static Basic credentials — nothing to refresh.
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyAtomeWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseAtomeWebhookEvents(payload)
  }

  private client(credentials: Credentials): AtomeClient {
    return new AtomeClient(credentials)
  }

  // ── Charges (Atome payments) ────────────────────────────────────────────────

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawAtomePayment>(paymentPath(id))
    return transformCharge(res ?? {})
  }

  /**
   * Create a new payment. Atome's create body needs BNPL-specific fields the
   * canonical Charge doesn't model (callbackUrl, paymentResultUrl, customerInfo,
   * shippingAddress, items). Callers supply those via `data.raw`; we merge the
   * canonical `amount`/`currency`/`referenceId` on top so the schema's first-
   * class fields always win.
   */
  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const passthrough =
      data.raw && typeof data.raw === 'object' ? (data.raw as Record<string, unknown>) : {}
    const body: Record<string, unknown> = { ...passthrough }
    if (data.amount !== undefined) body.amount = data.amount
    if (data.currency !== undefined) body.currency = pickCurrency(data.currency)
    if (data.id) body.referenceId = data.id
    if (data.externalId) body.referenceId = data.externalId

    const res = await this.client(credentials).post<RawAtomePayment>(PAYMENTS_PATH, body)
    return transformCharge(res ?? {})
  }

  /**
   * Cancel an unpaid payment. Atome returns the whole payment in its new
   * CANCELLED state, which we surface as the canonical charge.
   */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<RawAtomePayment>(paymentCancelPath(id), {})
    return transformCharge(res ?? {})
  }

  // ── Refunds (POST /payments/{referenceId}/refund) ───────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const referenceId = data.chargeId
    if (!referenceId) throw new Error('chargeId (Atome payment referenceId) is required for a refund')

    // refundId is the idempotency key; reuse the caller's id, else mint one.
    const refundId = data.id ?? data.externalId ?? `refund-${Date.now()}`
    const updated = await this.client(credentials).post<RawAtomePayment>(
      paymentRefundPath(referenceId),
      { refundId, refundAmount: data.amount },
    )

    // The refund endpoint returns the whole payment; resolve the entry we just
    // created (by our idempotency key, else the newest one — Atome lists newest
    // first).
    const refunds = updated?.refundTransactions ?? []
    const created: RawAtomeRefundTransaction =
      refunds.find((r) => r.refundId === refundId) ??
      refunds[0] ?? { refundId, amount: data.amount }

    const currency = data.currency ?? pickCurrency(updated?.currency)
    return transformRefund(created, { referenceId, currency })
  }
}
