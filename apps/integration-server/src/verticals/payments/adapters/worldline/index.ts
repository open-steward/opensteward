/**
 * Worldline Direct adapter — payments vertical.
 *
 * Worldline Direct (formerly Ingenico / Ogone) is a European-anchored gateway
 * exposing a server-to-server REST API (v2). The PSPID/merchantId is part of
 * every resource path.
 *
 * Auth: API key + API secret pair; requests are signed per-call with
 * HMAC-SHA256 (`GCS v1HMAC` Authorization header). No OAuth.
 *
 * Docs: https://docs.direct.worldline-solutions.com/en/integration/api-developer-guide/index
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Available:   charge, refund, dispute, payout (get only; no list operation), payment-method (token)
 * Unavailable: customer            — no dedicated customer endpoint; customer data is embedded in tokens/payments
 * Unavailable: subscription        — Worldline Direct has no subscription billing concept
 * Unavailable: invoice             — no invoice concept in Worldline Direct
 * Unavailable: plan                — no subscription plan/product catalog in Worldline Direct
 * Unavailable: balance-transaction — no balance/ledger transaction concept in Worldline Direct
 */

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Dispute } from '../../schema/dispute'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { buildCredentials } from './auth'
import { WorldlineClient } from './client'
import { parseWorldlineWebhookEvents, verifyWorldlineWebhook } from './webhook'

import { transformCharge, type RawWorldlinePayment } from './transform/charge'
import { transformDispute, type RawWorldlineDispute } from './transform/dispute'
import { transformPaymentMethod, type RawWorldlineToken } from './transform/payment-method'
import { transformPayout, type RawWorldlinePayout } from './transform/payout'
import { transformRefund, type RawWorldlineRefund } from './transform/refund'

const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'merchantId',
    label: 'PSPID (merchant ID)',
    type: 'text',
    required: true,
    helpText: 'Your Worldline Direct merchant identifier, shown in the Merchant Portal.',
  },
  {
    name: 'apiKeyId',
    label: 'API key ID',
    type: 'text',
    required: true,
    helpText: 'Created under "Add API Key" in the Merchant Portal. Rotates yearly.',
  },
  {
    name: 'apiSecret',
    label: 'API secret',
    type: 'password',
    required: true,
    helpText: 'The secret half of the API key pair; only shown once at creation.',
  },
  {
    name: 'environment',
    label: 'Environment',
    type: 'select',
    required: true,
    options: [
      { value: 'sandbox', label: 'Sandbox (pre-production)' },
      { value: 'production', label: 'Production' },
    ],
  },
]

const FORM = customForm({
  fields: CREDENTIAL_FIELDS,
  exchange: async (fields) => buildCredentials(fields),
})

export class WorldlineAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'worldline'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Worldline Direct uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Worldline Direct uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return FORM.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWorldlineWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWorldlineWebhookEvents(payload)
  }

  private client(credentials: Credentials): WorldlineClient {
    return new WorldlineClient(credentials)
  }

  // ── Charges (Worldline "payments") ──────────────────────────────────────────

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawWorldlinePayment>(`/payments/${id}`)
    return transformCharge(res ?? {})
  }

  // ── Refunds ─────────────────────────────────────────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId required to refund a Worldline payment')
    const body: Record<string, unknown> = {}
    if (data.amount !== undefined) {
      body.amountOfMoney = { amount: data.amount, currencyCode: data.currency }
    }
    const res = await this.client(credentials).post<RawWorldlineRefund>(
      `/payments/${data.chargeId}/refund`,
      body,
    )
    return transformRefund(res ?? {})
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<RawWorldlineRefund>(`/refunds/${id}`)
    return transformRefund(res ?? {})
  }

  // ── Disputes ─────────────────────────────────────────────────────────────────
  // Note: Worldline has no top-level list-disputes endpoint. Disputes are
  // listed per-payment via GET /payments/{paymentId}/disputes. We expose
  // only getDispute via the top-level GET /disputes/{disputeId} endpoint.

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const res = await this.client(credentials).get<RawWorldlineDispute>(`/disputes/${id}`)
    return transformDispute(res ?? {})
  }

  // ── Payouts ──────────────────────────────────────────────────────────────────
  // Worldline's public OpenAPI (v2.507.0,
  // https://payment.preprod.direct.worldline-solutions.com/v1/public-contract-definition.yaml)
  // defines only `post` ("Create payout") at /v2/{merchantId}/payouts and a
  // by-id read ("Get payout") at /v2/{merchantId}/payouts/{payoutId}. There is
  // no list-payouts operation, so listPayouts refuses before sending anything.

  async listPayouts(_credentials: Credentials, _params: QueryParams): Promise<Payout[]> {
    throw Object.assign(
      new Error(
        'Worldline cannot list payouts: the API defines only "Create payout" (POST /v2/{merchantId}/payouts) and "Get payout" (GET /v2/{merchantId}/payouts/{payoutId}); there is no list operation.',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<RawWorldlinePayout>(`/payouts/${id}`)
    return transformPayout(res ?? {})
  }

  // ── Payment methods (tokens) ─────────────────────────────────────────────────
  // Worldline exposes GET /tokens/{tokenId} to retrieve a stored card/bank token.
  // There is no list-all-tokens endpoint in the public API; only single-token
  // retrieval is available.

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const res = await this.client(credentials).get<RawWorldlineToken>(`/tokens/${id}`)
    return transformPaymentMethod(res ?? {})
  }
}
