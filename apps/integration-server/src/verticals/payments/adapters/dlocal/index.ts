/**
 * dLocal adapter — payments vertical (cross-border collector).
 *
 * Single global API at api.dlocal.com; per-country settlement. Covers
 * local methods like Boleto (BR), OXXO (MX), PIX, bank transfers, alt
 * cards, and mobile money across LatAm + APAC + Africa.
 *
 * Auth: per-request HMAC-SHA-256 signature over `${xLogin}${xDate}${body}`
 * keyed with the merchant secret.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: customer       — dLocal has no standalone customer/payer CRUD endpoints; payer is embedded in payment objects only
 * Unavailable: invoice        — dLocal has no invoice object or endpoint
 * Unavailable: plan           — dLocal has no plan/price/product catalog endpoints
 * Unavailable: subscription   — dLocal recurring payments use wallet-specific enrollment flows (not a generic subscription resource)
 * Unavailable: balance-transaction — dLocal exposes only an account-level balance for payouts; no per-transaction ledger endpoint
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Dispute } from '../../schema/dispute'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { buildCredentials } from './auth'
import { DLocalClient } from './client'
import { parseDLocalWebhookEvents, verifyDLocalWebhook } from './webhook'

import { transformCharge, type RawDLocalPayment } from './transform/charge'
import { transformDispute, type RawDLocalChargeback } from './transform/dispute'
import { transformPaymentMethod, type RawDLocalCard } from './transform/payment-method'
import { transformRefund, type RawDLocalRefund } from './transform/refund'
import { transformPayout, type RawDLocalPayout } from './transform/payout'

export class DLocalAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'dlocal'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('dLocal uses signed API requests; submit credentials via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('dLocal uses signed API requests; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'sandbox', label: 'Sandbox' },
          { value: 'live', label: 'Live' },
        ],
      },
      { name: 'xLogin', label: 'X-Login', type: 'text', required: true },
      { name: 'xTransKey', label: 'X-Trans-Key', type: 'text', required: true },
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
    return verifyDLocalWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseDLocalWebhookEvents(payload)
  }

  private client(credentials: Credentials): DLocalClient {
    return new DLocalClient(credentials)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawDLocalPayment>(`/payments/${id}`)
    return transformCharge(raw)
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    return []
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId required for dLocal refund')
    const raw = await this.client(credentials).post<RawDLocalRefund>('/refunds', {
      payment_id: data.chargeId,
      amount: data.amount ? data.amount / 100 : undefined,
      currency: data.currency,
    })
    return transformRefund({ ...raw, payment_id: data.chargeId })
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const raw = await this.client(credentials).get<RawDLocalPayout>(`/payouts/${id}`)
    return transformPayout(raw)
  }

  async listPayouts(_credentials: Credentials, _params: QueryParams): Promise<Payout[]> {
    return []
  }

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const raw = await this.client(credentials).get<RawDLocalChargeback>(`/chargebacks/${id}`)
    return transformDispute(raw)
  }

  async listDisputes(_credentials: Credentials, _params: QueryParams): Promise<Dispute[]> {
    return []
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const raw = await this.client(credentials).get<RawDLocalCard>(`/cards/${id}`)
    return transformPaymentMethod(raw)
  }
}
