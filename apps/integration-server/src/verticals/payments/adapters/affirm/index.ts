/**
 * Affirm adapter — payments vertical (BNPL US).
 *
 * Affirm Adaptive Checkout returns a checkout token client-side; the
 * server-side flow is `authorize → capture` (or `authorize → void`). We
 * surface the loan principal as `Charge.amount`; installment schedule lives
 * on `Charge.raw` only.
 *
 * Auth: HTTP Basic from `public_api_key:private_api_key`.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:   charge — GET/POST /api/v1/charges/:id
// Available:   refund — POST /api/v1/charges/:id/refund
// Unverified:  balance-transaction — Settlement events endpoint confirmed (GET /api/v1/settlements/events) but response field names are behind an authenticated reference (429/403 during research)
// Unavailable: customer — Affirm is BNPL; no merchant-facing customer management API exists
// Unverified:  dispute — Partner Disputes API confirmed (GET /api/partner/v1/merchants/{id}/disputes) but response field names are behind an authenticated reference (429 during research)
// Unavailable: invoice — No invoicing concept; Affirm is a single-transaction BNPL gateway
// Unavailable: payment-method — Affirm is itself the payment method; no payment method management API
// Unavailable: payout — Funds disbursed via ACH by lending partners; no merchant-facing Payout API
// Unavailable: plan — Affirm does not support recurring billing or subscription plans
// Unavailable: subscription — Affirm explicitly does not support recurring payments

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { buildCredentials } from './auth'
import { AffirmClient } from './client'
import { parseAffirmWebhookEvents, verifyAffirmWebhook } from './webhook'

import { transformCharge, type RawAffirmCharge } from './transform/charge'
import { transformRefund, type RawAffirmRefund } from './transform/refund'

export class AffirmAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'affirm'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Affirm uses HTTP Basic; submit credentials via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Affirm uses HTTP Basic; call exchangeCredentials instead.')
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
          { value: 'live', label: 'Production' },
        ],
      },
      { name: 'publicKey', label: 'Public API key', type: 'text', required: true },
      { name: 'privateKey', label: 'Private API key', type: 'password', required: true },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyAffirmWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseAffirmWebhookEvents(payload)
  }

  private client(credentials: Credentials): AffirmClient {
    return new AffirmClient(credentials)
  }

  // ── Charges ─────────────────────────────────────────────────────────────

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawAffirmCharge>(`/api/v1/charges/${id}`)
    return transformCharge(raw)
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    return []
  }

  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const raw = await this.client(credentials).post<RawAffirmCharge>(
      `/api/v1/charges/${id}/capture`,
      data?.amount ? { amount: data.amount } : {},
    )
    return transformCharge(raw)
  }

  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).post<RawAffirmCharge>(`/api/v1/charges/${id}/void`)
    return transformCharge(raw)
  }

  // ── Refunds ─────────────────────────────────────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId required for Affirm refund')
    const raw = await this.client(credentials).post<RawAffirmRefund>(
      `/api/v1/charges/${data.chargeId}/refund`,
      { amount: data.amount },
    )
    return transformRefund({ ...raw, charge_id: data.chargeId })
  }
}
