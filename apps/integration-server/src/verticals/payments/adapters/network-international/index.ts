/**
 * Network International (N-Genius Online) adapter — payments vertical.
 *
 * N-Genius Online is the UAE's largest acquirer. It is an *order-centric*
 * gateway: a merchant server creates an order (PURCHASE or AUTH) scoped to an
 * outlet, the shopper pays, and the order's embedded payment carries the money
 * state. There are no list endpoints and no customer object — orders, captures
 * and refunds are all addressed by reference.
 *
 * Supported canonical resources (everything else auto-501s):
 *   - createCharge   → POST   /transactions/outlets/{outlet}/orders          (create order)
 *   - getCharge      → GET    /transactions/outlets/{outlet}/orders/{ref}    (fetch order)
 *   - createRefund   → POST   …/payments/{payment}/captures/{capture}/refund (refund a capture)
 *
 * Auth: api_key. The Service Account API key is exchanged (Basic → bearer) at
 * the identity service inside the client; see `auth.ts` / `client.ts`.
 *
 * Docs: https://docs.ngenius-payments.com
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — no balance-ledger or settlement-reporting API; platform is order-centric with no balance transaction concept.
 * Unavailable: customer            — no customer management concept or endpoint; orders are addressed by outlet-scoped references, not customer records.
 * Unavailable: dispute             — no dispute or chargeback API; chargebacks are handled offline through the merchant portal.
 * Unavailable: invoice             — the N-Genius "invoice" is a Pay-by-Link generator, not a retrievable billing-invoice record; no list or get-by-ID endpoint exists.
 * Unavailable: payment-method      — card tokens are embedded in order responses; no standalone payment-method list or fetch API.
 * Unverified:  payout              — a separate N-Genius Payout API product exists but its endpoint paths are only available via a merchant-credentialed Postman collection and are not publicly documented.
 * Unavailable: plan                — no subscription plan or pricing model API; recurring intervals are configured in the merchant portal.
 * Unavailable: subscription        — no subscription management API; recurring payments are per-order via the portal, not programmable subscription objects.
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
} from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { PAYMENT_CONTENT_TYPE } from './constants'
import { CREDENTIAL_FIELDS, buildCredentials } from './auth'
import { NetworkInternationalClient } from './client'
import {
  parseNetworkInternationalWebhookEvents,
  verifyNetworkInternationalWebhook,
} from './webhook'

import { transformCharge, type RawNgeniusOrder } from './transform/charge'
import { transformRefund, type RawNgeniusRefundResponse } from './transform/refund'

const FORM = customForm({ fields: CREDENTIAL_FIELDS, exchange: async (f) => buildCredentials(f) })

/** Reference the media-type constant so it stays exported/used by the module. */
void PAYMENT_CONTENT_TYPE

export class NetworkInternationalAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'network-international'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error(
      'Network International uses an API key; submit it via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error(
      'Network International uses an API key; call exchangeCredentials instead.',
    )
  }

  credentialFields(): CredentialField[] {
    return FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return FORM.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // The persisted secret is the long-lived API key; bearer tokens are minted
    // lazily inside the client, so there is nothing to refresh here.
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyNetworkInternationalWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseNetworkInternationalWebhookEvents(payload)
  }

  private client(credentials: Credentials): NetworkInternationalClient {
    return new NetworkInternationalClient(credentials)
  }

  // ── Charges (N-Genius orders) ─────────────────────────────────────────────

  /** Create an order. `metadata.action` selects PURCHASE (default) vs AUTH. */
  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    if (data.amount === undefined) throw new Error('amount required to create a Network International order')
    if (!data.currency) throw new Error('currency required to create a Network International order')
    const client = this.client(credentials)
    const action = (data.metadata?.action ?? 'PURCHASE').toUpperCase()
    const body: Record<string, unknown> = {
      action,
      amount: { currencyCode: data.currency.toUpperCase(), value: data.amount },
    }
    if (data.receiptEmail) body.emailAddress = data.receiptEmail
    const res = await client.post<RawNgeniusOrder>(client.ordersPath(), body)
    return transformCharge(res)
  }

  /** Fetch an order (and its embedded payment) by order reference. */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const client = this.client(credentials)
    const res = await client.get<RawNgeniusOrder>(client.orderPath(id))
    return transformCharge(res)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  /**
   * Refund all or part of a captured payment. N-Genius addresses a refund by
   * three references — order, payment and capture. `chargeId` carries the
   * order reference; the payment + capture references are supplied via
   * `metadata.paymentReference` and `metadata.captureReference`.
   */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const orderRef = data.chargeId
    const paymentRef = data.metadata?.paymentReference
    const captureRef = data.metadata?.captureReference
    if (!orderRef) throw new Error('chargeId (order reference) required for Network International refund')
    if (!paymentRef) throw new Error('metadata.paymentReference required for Network International refund')
    if (!captureRef) throw new Error('metadata.captureReference required for Network International refund')
    const client = this.client(credentials)
    const body: Record<string, unknown> = {}
    if (data.amount !== undefined && data.currency) {
      body.amount = { currencyCode: data.currency.toUpperCase(), value: data.amount }
    }
    const res = await client.post<RawNgeniusRefundResponse>(
      client.refundPath(orderRef, paymentRef, captureRef),
      body,
    )
    return transformRefund(res)
  }
}
