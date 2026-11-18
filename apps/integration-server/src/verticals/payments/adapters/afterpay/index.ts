/**
 * Afterpay adapter — payments vertical (BNPL US/AU/NZ; Block-owned).
 *
 * Region-specific API hosts (US vs AU). HTTP Basic from `merchantId:secretKey`.
 * Same installments-vs-principal model as Klarna / Affirm — Charge.amount =
 * loan principal; installment schedule lives on Charge.raw only.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: balance-transaction — Afterpay has no merchant ledger/balance API; no settlement account concept exposed
// Unavailable: customer           — Afterpay embeds consumer info inside payment records; no persistent customer objects or customer API
// Unavailable: invoice            — Afterpay is a BNPL installment service; no invoice model exists in their API
// Unavailable: payment-method     — Payment methods are internal to Afterpay; no payment-method management API exposed to merchants
// Unavailable: payout             — Afterpay settles to bank accounts directly; no payouts API endpoint
// Unavailable: plan               — Afterpay uses a fixed 4-installment model; no configurable plan/product API
// Unavailable: subscription       — No merchant subscription management API (consumer-facing only, not REST-accessible)

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Dispute } from '../../schema/dispute'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { buildCredentials } from './auth'
import { AfterpayClient } from './client'
import {
  parseAfterpayWebhookEvents,
  verifyAfterpayWebhook,
} from './webhook'

import { transformCharge, type RawAfterpayPayment } from './transform/charge'
import { transformRefund, type RawAfterpayRefund } from './transform/refund'
import { transformDispute, type RawAfterpayDispute } from './transform/dispute'

export class AfterpayAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'afterpay'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Afterpay uses HTTP Basic; submit credentials via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Afterpay uses HTTP Basic; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'region',
        label: 'Region',
        type: 'select',
        required: true,
        options: [
          { value: 'us_sandbox', label: 'US — Sandbox' },
          { value: 'us_live', label: 'US — Live' },
          { value: 'au_sandbox', label: 'Australia/NZ — Sandbox' },
          { value: 'au_live', label: 'Australia/NZ — Live' },
        ],
      },
      { name: 'merchantId', label: 'Merchant ID', type: 'text', required: true },
      { name: 'secretKey', label: 'Secret key', type: 'password', required: true },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyAfterpayWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseAfterpayWebhookEvents(payload)
  }

  private client(credentials: Credentials): AfterpayClient {
    return new AfterpayClient(credentials)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawAfterpayPayment>(`/v2/payments/${id}`)
    return transformCharge(raw)
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    return []
  }

  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).post<RawAfterpayPayment>(`/v2/payments/${id}/void`)
    return transformCharge(raw)
  }

  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const body = data?.amount
      ? { amount: { amount: (data.amount / 100).toFixed(2), currency: 'USD' } }
      : {}
    const raw = await this.client(credentials).post<RawAfterpayPayment>(
      `/v2/payments/${id}/capture`,
      body,
    )
    return transformCharge(raw)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId required for Afterpay refund')
    const body = {
      requestId: `oi-${Date.now()}`,
      amount: {
        amount: ((data.amount ?? 0) / 100).toFixed(2),
        currency: (data.currency ?? 'USD').toUpperCase(),
      },
    }
    const raw = await this.client(credentials).post<RawAfterpayRefund>(
      `/v2/payments/${data.chargeId}/refund`,
      body,
    )
    return transformRefund({ ...raw, orderId: data.chargeId })
  }

  async listDisputes(credentials: Credentials, _params: QueryParams): Promise<Dispute[]> {
    const resp = await this.client(credentials).get<{ results?: RawAfterpayDispute[] }>(
      '/v2/disputes',
    )
    return (resp.results ?? []).map(transformDispute)
  }

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const raw = await this.client(credentials).get<RawAfterpayDispute>(`/v2/disputes/${id}`)
    return transformDispute(raw)
  }
}
