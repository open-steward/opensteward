/**
 * PhonePe Payment Gateway adapter — payments vertical (India anchor).
 *
 * Implements PhonePe's Standard Checkout V2 surface. PhonePe models money
 * as Orders (each addressed by a merchant-supplied `merchantOrderId`) with
 * one or more payment attempts, plus order-scoped Refunds. Autopay
 * subscriptions are supported via the `/subscriptions/v2` surface.
 *
 *   - `createCharge(data)`        → POST /checkout/v2/pay (returns a hosted
 *                                   checkout `redirectUrl` as a pending charge).
 *   - `getCharge(id)`             → id is the `merchantOrderId`; GET order status.
 *   - `createRefund({ chargeId })`→ chargeId is the original `merchantOrderId`.
 *   - `getRefund(id)`             → id is the `merchantRefundId`; GET refund status.
 *   - `getSubscription(id)`       → id is the `merchantSubscriptionId`; GET
 *                                   subscription status from Autopay surface.
 *
 * Auth: an `O-Bearer` access token minted from the merchant's Client ID +
 * Client Secret + Client Version via the OAuth client-credentials grant.
 * The static credentials live in `Credentials.extra` so the token can be
 * re-minted on refresh without re-prompting.
 *
 * Money: PhonePe quotes paise (integer minor units) and settles INR — the
 * canonical schema is already minor units, so no scaling is applied.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: balance-transaction — no balance/settlement transaction REST API on the Standard Checkout V2 surface; settlement data is dashboard-only
 * Unavailable: customer           — PhonePe has no customer management API
 * Unavailable: dispute            — no dispute/chargeback REST API documented
 * Unavailable: invoice            — no invoice API
 * Unavailable: payment-method     — no standalone payment method management API
 * Unavailable: payout             — settlements are automatic and dashboard-visible only; no payout disbursement API
 * Unavailable: plan               — no plan/product catalog API
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import {
  CREATE_PAYMENT_PATH,
  ORDER_STATUS_PATH,
  PG_CHECKOUT_FLOW,
  REFUND_PATH,
} from './constants'
import { exchangeCredentials, refreshCredentials } from './auth'
import { PhonepeClient } from './client'
import { parsePhonepeWebhookEvents, verifyPhonepeWebhook } from './webhook'

import { transformCharge, type RawPhonepeOrder } from './transform/charge'
import { transformRefund, type RawPhonepeRefund } from './transform/refund'
import { transformSubscription, type RawPhonepeSubscription } from './transform/subscription'

export class PhonepeAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'phonepe'
  readonly version = '0.1.0'

  // ── Auth ────────────────────────────────────────────────────────────────────

  getAuthUrl(): string {
    throw new Error(
      'PhonePe uses static API keys; submit Client ID + Secret + Version via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('PhonePe uses static API keys; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'sandbox', label: 'Sandbox (UAT)' },
          { value: 'production', label: 'Production (live)' },
        ],
      },
      {
        name: 'clientId',
        label: 'Client ID',
        type: 'text',
        required: true,
        helpText: 'From the PhonePe Business dashboard → Developer Settings → API Keys.',
      },
      {
        name: 'clientSecret',
        label: 'Client Secret',
        type: 'password',
        required: true,
        helpText: 'Paired with the Client ID; used to mint the O-Bearer access token.',
      },
      {
        name: 'clientVersion',
        label: 'Client Version',
        type: 'text',
        required: true,
        placeholder: '1',
        helpText: 'The client_version supplied by PhonePe (defaults to 1).',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPhonepeWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePhonepeWebhookEvents(payload)
  }

  private client(credentials: Credentials): PhonepeClient {
    return new PhonepeClient(credentials)
  }

  // ── Charges (orders) ────────────────────────────────────────────────────────

  /**
   * Initiate a Standard Checkout payment. Returns the order as a pending
   * charge whose `metadata.redirectUrl` is the hosted checkout page.
   * `data.id` (if supplied) is used as the `merchantOrderId`.
   */
  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const merchantOrderId = data.id ?? `order_${Date.now()}`
    const body: Record<string, unknown> = {
      merchantOrderId,
      amount: data.amount ?? 0,
      paymentFlow: {
        type: PG_CHECKOUT_FLOW,
        ...(data.metadata?.redirectUrl
          ? { merchantUrls: { redirectUrl: data.metadata.redirectUrl } }
          : {}),
        ...(data.description ? { message: data.description } : {}),
      },
    }
    const raw = await this.client(credentials).post<RawPhonepeOrder>(CREATE_PAYMENT_PATH, body)
    // The create response omits merchantOrderId — stitch it back for the id.
    return transformCharge({ merchantOrderId, ...(raw ?? {}) })
  }

  /** Fetch order status. `id` is the `merchantOrderId`. */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawPhonepeOrder>(
      `${ORDER_STATUS_PATH}/${encodeURIComponent(id)}/status`,
    )
    return transformCharge({ merchantOrderId: id, ...(raw ?? {}) })
  }

  // ── Refunds ──────────────────────────────────────────────────────────────────

  /** Initiate a refund against an order. `data.chargeId` = original `merchantOrderId`. */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) {
      throw new Error('chargeId (PhonePe originalMerchantOrderId) required for refund')
    }
    const merchantRefundId = data.id ?? `refund_${Date.now()}`
    const body: Record<string, unknown> = {
      merchantRefundId,
      originalMerchantOrderId: data.chargeId,
      amount: data.amount ?? 0,
    }
    const raw = await this.client(credentials).post<RawPhonepeRefund>(REFUND_PATH, body)
    // The initiate response carries only refundId/amount/state — backfill the ids.
    return transformRefund({
      merchantRefundId,
      originalMerchantOrderId: data.chargeId,
      ...(raw ?? {}),
    })
  }

  /** Fetch refund status. `id` is the `merchantRefundId`. */
  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const raw = await this.client(credentials).get<RawPhonepeRefund>(
      `${REFUND_PATH}/${encodeURIComponent(id)}/status`,
    )
    return transformRefund({ merchantRefundId: id, ...(raw ?? {}) })
  }

  // ── Subscriptions (Autopay) ─────────────────────────────────────────────────

  /**
   * Fetch Autopay subscription status. `id` is the `merchantSubscriptionId`.
   * Endpoint: GET /subscriptions/v2/{merchantSubscriptionId}/status
   *
   * PhonePe has no "list all subscriptions" endpoint; only status-by-id is
   * available. `createSubscription` / `cancelSubscription` are not wired
   * because they require an UPI intent flow that cannot be driven server-side.
   */
  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const raw = await this.client(credentials).get<RawPhonepeSubscription>(
      `/subscriptions/v2/${encodeURIComponent(id)}/status`,
    )
    return transformSubscription({ merchantSubscriptionId: id, ...(raw ?? {}) })
  }
}
