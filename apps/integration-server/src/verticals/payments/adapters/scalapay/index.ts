/**
 * Scalapay adapter — payments vertical.
 *
 * Scalapay is a European Buy-Now-Pay-Later gateway (pay-in-3 / pay-in-4 /
 * pay-later). Only the resources that map to real Scalapay endpoints are
 * implemented here:
 *
 *   - Charges  ← orders/payments (`/v2/orders`, `/v2/payments/...`,
 *                `/v1/reporting/orders`)
 *   - Refunds  ← `/v2/payments/{token}/refund`, `/v1/reporting/refunds`
 *   - Payouts  ← `/v1/reporting/payouts`
 *
 * Everything else is left unimplemented and the router returns 501.
 *
 * Auth: the merchant api-key as a Bearer token (production keys start `sp_`).
 *
 * Docs: https://developers.scalapay.com/reference/api-architecture
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — Scalapay has no balance-transaction or ledger endpoint in the merchant API
 * Unavailable: customer — BNPL gateway; no stored customer objects in the merchant API
 * Unavailable: dispute — BNPL gateway; no chargeback/dispute flow exposed in the merchant API
 * Unavailable: invoice — Scalapay has no invoice resource in the merchant API
 * Unavailable: payment-method — BNPL gateway; no card vault or payment-method store in the merchant API
 * Unavailable: plan — BNPL gateway; no subscription billing or plan resource in the merchant API
 * Unavailable: subscription — BNPL gateway; no subscription resource in the merchant API
 */

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import { simpleApiKey } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { ScalapayClient } from './client'
import { parseScalapayWebhookEvents, verifyScalapayWebhook } from './webhook'

import { transformCharge, type RawScalapayOrder } from './transform/charge'
import { transformPayout, type RawScalapayPayout } from './transform/payout'
import { transformRefund, type RawScalapayRefund } from './transform/refund'

const FORM = simpleApiKey({
  fieldName: 'apiKey',
  label: 'API key',
  helpText: 'Found in the Partner Portal → Developers. Production keys start sp_…',
})

/** Reporting list endpoints page from 0 and return a bare JSON array. */
function pageParams(params: QueryParams): { page: number; size: number } {
  const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const page = params.page && params.page > 0 ? params.page - 1 : 0
  return { page, size }
}

export class ScalapayAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'scalapay'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Scalapay uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Scalapay uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    // Use the form helper to validate presence, then attach the api-key to
    // `extra` so webhook HMAC verification can reuse it as the signing secret.
    await FORM.exchangeCredentials(fields)
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys are long-lived; nothing to refresh.
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyScalapayWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseScalapayWebhookEvents(payload)
  }

  private client(credentials: Credentials): ScalapayClient {
    return new ScalapayClient(credentials)
  }

  // ── Charges (Scalapay orders / payments) ───────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const { page, size } = pageParams(params)
    const rows = await this.client(credentials).get<RawScalapayOrder[]>('/v1/reporting/orders', {
      page,
      size,
    })
    return (rows ?? []).map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const order = await this.client(credentials).get<RawScalapayOrder>(`/v2/payments/${id}`)
    return transformCharge(order ?? {})
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    // Creating a Scalapay order returns `{ token, expires, checkoutUrl }`; the
    // shopper must then authorise at `checkoutUrl`, so the new charge starts
    // in a non-captured (pending) state.
    const order = await this.client(credentials).post<RawScalapayOrder>('/v2/orders', {
      totalAmount: {
        amount: minorToDecimalString(data.amount, data.currency),
        currency: (data.currency ?? 'EUR').toUpperCase(),
      },
      merchantReference: data.description ?? undefined,
    })
    return transformCharge(order ?? {})
  }

  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const order = await this.client(credentials).post<RawScalapayOrder>('/v2/payments/capture', {
      token: id,
      ...(data?.amount !== undefined ? { amount: { amount: String(data.amount) } } : {}),
    })
    return transformCharge(order ?? { token: id })
  }

  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    // Scalapay "void" cancels an authorised-but-uncaptured order.
    const order = await this.client(credentials).post<RawScalapayOrder>(
      `/v2/payments/${id}/void`,
      {},
    )
    return transformCharge(order ?? { token: id, status: 'CANCELLED' })
  }

  // ── Refunds ─────────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const { page, size } = pageParams(params)
    const rows = await this.client(credentials).get<RawScalapayRefund[]>('/v1/reporting/refunds', {
      page,
      size,
    })
    return (rows ?? []).map(transformRefund)
  }

  // ── Payouts ──────────────────────────────────────────────────────────────────

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const { page, size } = pageParams(params)
    const rows = await this.client(credentials).get<RawScalapayPayout[]>('/v1/reporting/payouts', {
      page,
      size,
    })
    return (rows ?? []).map(transformPayout)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (order token) required for Scalapay refund')
    const currency = (data.currency ?? 'EUR').toUpperCase()
    const body: Record<string, unknown> = {}
    if (data.amount !== undefined) {
      body.refundAmount = { amount: minorToDecimalString(data.amount, currency), currency }
    }
    const res = await this.client(credentials).post<RawScalapayRefund>(
      `/v2/payments/${data.chargeId}/refund`,
      body,
    )
    return transformRefund(res ?? { token: data.chargeId })
  }
}

/**
 * Convert an integer minor-unit amount into the decimal major-unit string
 * Scalapay expects on the wire (e.g. 12500 EUR → "125.00"). Returns undefined
 * for a missing amount so it is omitted from the request.
 */
function minorToDecimalString(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string | undefined {
  if (amount === null || amount === undefined) return undefined
  const exponent = currencyExponent(currency)
  return (amount / Math.pow(10, exponent)).toFixed(exponent)
}

function currencyExponent(currency: string | null | undefined): number {
  const zeroDecimal = new Set(['JPY', 'KRW', 'ISK', 'CLP', 'VND'])
  const threeDecimal = new Set(['BHD', 'KWD', 'OMR', 'TND'])
  const c = (currency ?? '').toUpperCase()
  if (zeroDecimal.has(c)) return 0
  if (threeDecimal.has(c)) return 3
  return 2
}
