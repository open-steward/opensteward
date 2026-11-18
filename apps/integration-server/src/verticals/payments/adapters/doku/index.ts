/**
 * DOKU (Jokul) adapter — payments vertical (Indonesia).
 *
 * DOKU is an Indonesian payment gateway. Its Jokul Checkout product issues a
 * hosted payment page; orders are then read back by the merchant invoice
 * number, and settled transactions can be refunded. For the canonical payments
 * vertical we map the pieces that have a clean equivalent:
 *
 *   • Charge — a Jokul Checkout order. `createCharge` generates a checkout and
 *     returns the hosted `payment.url` (POST /checkout/v1/payment); `getCharge`
 *     reads the order/transaction status by invoice number
 *     (GET /orders/v1/status/{invoice_number}).
 *   • Refund — a refund against a settled transaction
 *     (POST /credit-card/v1/refund).
 *
 * DOKU has no "customer" object and no list endpoints for these resources
 * (orders are looked up by the invoice number you assign at creation time), so
 * `listCustomers` / `listCharges` / `listRefunds` are intentionally absent — the
 * router returns 501 for them. DOKU signs its notifications, so webhook
 * verification is implemented.
 *
 * Auth: API key — `Client-Id` header + per-request HMAC-SHA256 `Signature`.
 * Submit the Client ID + Secret Key via the Connect Link form.
 *
 * Docs: https://jokul.doku.com/docs and https://developers.doku.com/
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

// ── Resource coverage ──────────────────────────────────────────────
// Available:    charge, refund
// Unavailable:  balance-transaction — no ledger API; settlement data is dashboard-only reports
// Unavailable:  customer — no managed customer object; merchant supplies ID at checkout time
// Unavailable:  dispute — no dispute/chargeback API; handled offline via merchant support
// Unavailable:  invoice — no invoice billing resource; "invoice_number" is a merchant-assigned charge field
// Unavailable:  payment-method — tokens are internal; no listable/retrievable payment-method endpoint
// Unavailable:  payout — Kirim DOKU payout requires separate AGENTKEY credentials, not Jokul Client-Id/Secret-Key
// Unavailable:  plan — transactional gateway only; no recurring billing engine
// Unavailable:  subscription — transactional gateway only; no recurring billing engine

import { CHECKOUT_PAYMENT_PATH, ORDER_STATUS_PATH, REFUND_PATH } from './constants'
import { buildCredentials } from './auth'
import { DokuClient } from './client'
import { parseDokuWebhookEvents, verifyDokuWebhook } from './webhook'

import { transformCharge, type RawDokuOrder } from './transform/charge'
import { transformRefund, type RawDokuRefund } from './transform/refund'

const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'clientId',
    label: 'Client ID',
    type: 'text',
    required: true,
    helpText: 'From the DOKU Back Office: Business Account > Service.',
  },
  {
    name: 'secretKey',
    label: 'Secret key',
    type: 'password',
    required: true,
    helpText: 'The HMAC signing key paired with your Client ID. Keep it confidential.',
  },
  {
    name: 'environment',
    label: 'Environment',
    type: 'select',
    required: true,
    options: [
      { value: 'sandbox', label: 'Sandbox' },
      { value: 'production', label: 'Production' },
    ],
  },
]

const FORM = customForm({
  fields: CREDENTIAL_FIELDS,
  exchange: async (fields) => buildCredentials(fields),
})

export class DokuAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'doku'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('DOKU uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('DOKU uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return FORM.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static API keys never expire — nothing to refresh.
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyDokuWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseDokuWebhookEvents(payload)
  }

  private client(credentials: Credentials): DokuClient {
    return new DokuClient(credentials)
  }

  // ── Charges (Jokul Checkout orders) ────────────────────────────────────────

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawDokuOrder>(
      `${ORDER_STATUS_PATH}/${encodeURIComponent(id)}`,
    )
    return transformCharge(res ?? {})
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const meta = (data.metadata ?? {}) as Record<string, string>
    const invoiceNumber =
      data.externalId ?? data.id ?? meta.invoice_number ?? meta.invoiceNumber ?? `os-${Date.now()}`
    const body: Record<string, unknown> = {
      order: {
        amount: data.amount,
        invoice_number: invoiceNumber,
        currency: data.currency,
      },
      payment: {
        payment_due_date: meta.payment_due_date ? Number(meta.payment_due_date) : 60,
      },
    }
    if (data.receiptEmail || meta.email) {
      body.customer = { email: data.receiptEmail ?? meta.email, name: meta.name }
    }
    const res = await this.client(credentials).post<RawDokuOrder>(CHECKOUT_PAYMENT_PATH, body)
    return transformCharge(res ?? {})
  }

  // ── Refunds ────────────────────────────────────────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (invoice number) is required for a DOKU refund.')
    const meta = (data.metadata ?? {}) as Record<string, string>
    const originalRequestId = meta.original_request_id ?? meta.originalRequestId
    const body: Record<string, unknown> = {
      order: { invoice_number: data.chargeId },
      refund: {
        amount: data.amount,
        reason: data.reason ?? meta.reason,
      },
    }
    if (originalRequestId) body.original_request_id = originalRequestId
    const res = await this.client(credentials).post<RawDokuRefund>(REFUND_PATH, body)
    return transformRefund(res ?? {}, { chargeId: data.chargeId, amount: data.amount })
  }
}
