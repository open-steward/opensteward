/**
 * Midtrans adapter — payments vertical (Indonesia / SE-Asia anchor).
 *
 * Midtrans is transaction-centric and operated through its **Core API**. A
 * transaction (fetched by merchant `order_id` via `GET /v2/{id}/status`)
 * carries the amount, currency, payment status and fraud outcome, so it maps
 * onto the canonical **Charge**. Supported card methods, bank transfers,
 * e-wallets (GoPay/ShopeePay/QRIS) and over-the-counter all surface through
 * the same transaction shape.
 *
 * Auth: HTTP Basic with the merchant Server Key as the username and an empty
 * password. The key selects sandbox vs live; the host differs by environment
 * (carried on `credentials.extra.environment`). No OAuth, no refresh.
 *
 * Webhooks: HTTP notifications signed in-body with
 * `signature_key = SHA512(order_id + status_code + gross_amount + ServerKey)`
 * (see webhook.ts).
 *
 * Resources implemented:
 *   • getCharge          — GET  /v2/{order_id}/status
 *   • captureCharge      — POST /v2/capture        (settle a pre-authorized card)
 *   • cancelCharge       — POST /v2/{order_id}/cancel
 *   • createRefund       — POST /v2/{order_id}/refund
 *   • getSubscription    — GET  /v1/subscriptions/{id}
 *   • createSubscription — POST /v1/subscriptions
 *   • cancelSubscription — POST /v1/subscriptions/{id}/cancel
 *   • getInvoice         — GET  /v1/invoices/{id}
 *   • createInvoice      — POST /v1/invoices
 *   • voidInvoice        — POST /v1/invoices/{id}/void
 *
 * Docs: https://docs.midtrans.com/reference/core-api-overview
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: balance-transaction — Midtrans has no balance/ledger transaction API; the Core API only exposes individual charge statuses
// Unavailable: customer — Midtrans is transaction-centric; no customer management endpoints in the Core API
// Unavailable: dispute — Midtrans surfaces fraud outcomes as fraud_status on the transaction, not as a standalone disputes API
// Unavailable: payment-method — Midtrans uses per-transaction tokens, not a stored/listable payment methods API
// Unavailable: payout — Iris payout API requires a separate host (app.midtrans.com/iris) and dedicated credentials not shared with the Core API Server Key
// Unavailable: plan — Midtrans Subscription API embeds schedule inline; no named plan/price/product catalog resources

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { Invoice } from '../../schema/invoice'
import type { WebhookEvent } from '../../schema/webhook'

import { statusPath, refundPath, cancelPath, CAPTURE_PATH } from './constants'
import { buildCredentials } from './auth'
import { MidtransClient } from './client'
import { parseMidtransWebhookEvents, verifyMidtransWebhook } from './webhook'

import { transformCharge, type RawMidtransTransaction } from './transform/charge'
import {
  transformRefund,
  extractRefund,
  type RawMidtransRefundResponse,
} from './transform/refund'
import {
  transformSubscription,
  type RawMidtransSubscription,
} from './transform/subscription'
import { transformInvoice, type RawMidtransInvoice } from './transform/invoice'

export class MidtransAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'midtrans'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Midtrans uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Midtrans uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'serverKey',
        label: 'Server key',
        type: 'password',
        required: true,
        placeholder: 'SB-Mid-server-xxxxxxxxxxxxxxxx',
        helpText:
          'Your Midtrans Server Key (Dashboard → Settings → Access Keys). Sandbox keys start SB-Mid-server-…',
      },
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: false,
        options: [
          { value: 'sandbox', label: 'Sandbox' },
          { value: 'production', label: 'Production' },
        ],
        helpText: 'Which Midtrans host to call. Defaults to sandbox.',
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
    return verifyMidtransWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseMidtransWebhookEvents(payload)
  }

  private client(credentials: Credentials): MidtransClient {
    return new MidtransClient(credentials)
  }

  // ── Charges (Midtrans transactions) ─────────────────────────────────────────
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawMidtransTransaction>(statusPath(id))
    return transformCharge(res ?? {})
  }

  /**
   * Capture a pre-authorized card transaction (`POST /v2/capture`). Midtrans
   * keys this on the `transaction_id`, not the `order_id`, and wants the
   * capture `gross_amount` in major units — so we first resolve the
   * transaction via its status, then convert the requested minor-unit amount
   * back to major units (defaulting to the full pre-authorized amount).
   */
  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const client = this.client(credentials)
    const status = await client.get<RawMidtransTransaction>(statusPath(id))
    const transactionId = status?.transaction_id ?? id
    const grossAmount =
      data?.amount != null ? (data.amount / 100).toFixed(2) : status?.gross_amount
    const res = await client.post<RawMidtransTransaction>(CAPTURE_PATH, {
      transaction_id: transactionId,
      gross_amount: grossAmount != null ? Number(grossAmount) : undefined,
    })
    return transformCharge(res ?? {})
  }

  /** Cancel a transaction that is not yet settled (`POST /v2/{order_id}/cancel`). */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<RawMidtransTransaction>(cancelPath(id))
    return transformCharge(res ?? {})
  }

  // ── Refunds (POST /v2/{order_id}/refund) ─────────────────────────────────────
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const orderId = data.chargeId
    if (!orderId) throw new Error('chargeId (Midtrans order_id) is required for a refund')
    const res = await this.client(credentials).post<RawMidtransRefundResponse>(
      refundPath(orderId),
      {
        // Midtrans refund amount is in major units; canonical amount is minor.
        amount: data.amount != null ? Math.round(data.amount / 100) : undefined,
        reason: data.reason,
      },
    )
    const extracted = extractRefund(res ?? {})
    if (extracted) {
      return transformRefund(
        extracted.line,
        extracted.orderId,
        extracted.orderCurrency,
        res?.status_code,
      )
    }
    // Never throw out of a resource method: synthesise a pending refund keyed
    // on the order when the response omits the refund line.
    return transformRefund(
      { refund_amount: data.amount != null ? (data.amount / 100).toFixed(2) : undefined },
      orderId,
      data.currency,
      res?.status_code,
    )
  }

  // ── Subscriptions (GET/POST /v1/subscriptions) ───────────────────────────────
  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<RawMidtransSubscription>(
      `/v1/subscriptions/${encodeURIComponent(id)}`,
    )
    return transformSubscription(res ?? {})
  }

  async createSubscription(
    credentials: Credentials,
    data: Partial<Subscription>,
  ): Promise<Subscription> {
    // Map from canonical fields to Midtrans subscription request shape.
    const amount = data.items?.[0]?.amount
    const body: Record<string, unknown> = {
      // amount in major units (Midtrans expects a string without decimals for IDR)
      amount: amount != null ? String(Math.round(amount / 100)) : undefined,
      currency: data.currency ?? 'IDR',
      // name is required by Midtrans; fall back to the id if provided
      name: data.metadata?.['name'] ?? data.id ?? `sub-${Date.now()}`,
      // payment_type and token are required at creation but cannot be derived
      // from the canonical schema — the caller must supply them via metadata.
      payment_type: data.metadata?.['payment_type'],
      token: data.metadata?.['token'],
    }
    const res = await this.client(credentials).post<RawMidtransSubscription>(
      '/v1/subscriptions',
      body,
    )
    return transformSubscription(res ?? {})
  }

  async cancelSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    // Fetch the current state first so we can return a well-formed object.
    const client = this.client(credentials)
    const current = await client.get<RawMidtransSubscription>(
      `/v1/subscriptions/${encodeURIComponent(id)}`,
    )
    await client.post(`/v1/subscriptions/${encodeURIComponent(id)}/cancel`)
    return transformSubscription({ ...(current ?? {}), status: 'inactive' })
  }

  // ── Invoices (GET/POST /v1/invoices) ─────────────────────────────────────────
  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).get<RawMidtransInvoice>(
      `/v1/invoices/${encodeURIComponent(id)}`,
    )
    return transformInvoice(res ?? {})
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const body: Record<string, unknown> = {
      order_id: data.externalId ?? data.id,
      invoice_number: data.number,
      due_date: data.dueDate,
      invoice_date: data.createdAt,
      payment_type: 'payment_link',
      customer_details: data.customerId ? { id: data.customerId } : undefined,
      item_details: [
        {
          item_id: data.id ?? '1',
          description: 'Invoice',
          quantity: 1,
          // Midtrans invoice items use major units
          price: data.total != null ? Math.round(data.total / 100) : 0,
        },
      ],
    }
    const res = await this.client(credentials).post<RawMidtransInvoice>('/v1/invoices', body)
    return transformInvoice(res ?? {})
  }

  async voidInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = this.client(credentials)
    const current = await client.get<RawMidtransInvoice>(
      `/v1/invoices/${encodeURIComponent(id)}`,
    )
    await client.post(`/v1/invoices/${encodeURIComponent(id)}/void`)
    return transformInvoice({ ...(current ?? {}), status: 'voided' })
  }
}
