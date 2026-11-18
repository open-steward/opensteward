/**
 * Tamara adapter — payments vertical (GCC Buy-Now-Pay-Later anchor).
 *
 * Tamara is the leading BNPL gateway across Saudi Arabia, the UAE, Kuwait,
 * Bahrain, and Oman (pay-in-instalments / pay-later). Money settles in
 * SAR / AED / KWD / BHD / OMR.
 *
 * Tamara's merchant API has no first-class customer, payment-method,
 * subscription, invoice, plan, payout, or dispute resource and no list
 * endpoints — orders are addressed individually by `order_id`. Only the
 * resources that map cleanly are implemented; everything else is left
 * unimplemented and the router returns 501:
 *
 *   - getCharge     ← GET  /orders/{order_id}
 *   - captureCharge ← POST /payments/capture
 *   - cancelCharge  ← POST /orders/{order_id}/cancel
 *   - createRefund  ← POST /payments/simplified-refund/{order_id}
 *
 * Auth: a long-lived API Token as a Bearer token. Webhooks are authenticated
 * with a JWT (HS256) signed using the separate Notification Token.
 *
 * Docs: https://docs.tamara.co/reference/tamara-api-reference-documentation
 */

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   charge       ← GET /orders/{order_id}, POST /payments/capture, POST /orders/{order_id}/cancel
// Available:   refund       ← POST /payments/simplified-refund/{order_id}
// Unavailable: balance-transaction — no balance-transaction or ledger API; settlement reports are portal-only
// Unavailable: customer     — no customer management API; consumer data is embedded in order objects only
// Unverified:  dispute      — llms.txt lists "Get Dispute Case details" and "Updating disputes by ID" but docs.tamara.co/reference/getdisputecase returned 404; no authoritative response schema confirmed
// Unavailable: invoice      — no invoice API; settlement statements are Partners Portal only
// Unavailable: payment-method — no payment-method API; payment type is embedded in the order object
// Unavailable: payout       — no payout API; settlements processed automatically via Partners Portal
// Unavailable: plan         — BNPL gateway with no subscription plan or pricing plan API
// Unavailable: subscription — BNPL gateway with no subscription API

import type { BaseAdapter, CredentialField, Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { API_TOKEN_FIELD, NOTIFICATION_TOKEN_FIELD, buildCredentials } from './auth'
import { TamaraClient } from './client'
import { parseTamaraWebhookEvents, verifyTamaraWebhook } from './webhook'

import { transformCharge, type RawTamaraOrder } from './transform/charge'
import { transformRefund, type RawTamaraRefund } from './transform/refund'
import { minorUnitExponent } from './transform/shared'

const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: API_TOKEN_FIELD,
    label: 'API Token',
    type: 'password',
    required: true,
    helpText: 'Generate from the Tamara Partners Portal → Developers → API Tokens.',
  },
  {
    name: NOTIFICATION_TOKEN_FIELD,
    label: 'Notification Token',
    type: 'password',
    required: false,
    helpText: 'Used to verify inbound webhooks (the JWT is signed with this token).',
  },
]

const FORM = customForm({
  fields: CREDENTIAL_FIELDS,
  exchange: async (fields) => {
    const apiToken = (fields[API_TOKEN_FIELD] ?? '').trim()
    if (!apiToken) throw new Error('API Token is required.')
    return buildCredentials(fields)
  },
})

/**
 * Convert an integer minor-unit amount into the decimal major-unit object
 * Tamara expects on the wire (e.g. 12500 SAR → { amount: "125.00", currency:
 * "SAR" }). 3-decimal GCC currencies (BHD/KWD/OMR) are formatted accordingly.
 */
function toTamaraMoney(
  amount: number | null | undefined,
  currency: string | null | undefined,
): { amount: string; currency: string } | undefined {
  if (amount === null || amount === undefined) return undefined
  const cur = (currency ?? 'SAR').toUpperCase()
  const exponent = minorUnitExponent(cur)
  return { amount: (amount / Math.pow(10, exponent)).toFixed(exponent), currency: cur }
}

export class TamaraAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'tamara'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Tamara uses an API token; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Tamara uses an API token; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return FORM.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API tokens are long-lived; nothing to refresh.
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyTamaraWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseTamaraWebhookEvents(payload)
  }

  private client(credentials: Credentials): TamaraClient {
    return new TamaraClient(credentials)
  }

  // ── Charges (Tamara orders) ────────────────────────────────────────────────

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const order = await this.client(credentials).get<RawTamaraOrder>(`/orders/${id}`)
    return transformCharge(order ?? {})
  }

  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    // Tamara requires the full order context after capture to reflect the new
    // amounts, so we capture and then re-read the order for a canonical charge.
    const total = toTamaraMoney(data?.amount, undefined)
    await this.client(credentials).post<unknown>('/payments/capture', {
      order_id: id,
      ...(total ? { total_amount: total } : {}),
    })
    const order = await this.client(credentials).get<RawTamaraOrder>(`/orders/${id}`)
    return transformCharge(order ?? { order_id: id })
  }

  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    // Cancel voids an authorised-but-uncaptured order. Tamara requires
    // `total_amount` on the request — an empty body is rejected, and because
    // this method re-reads the order afterwards either way, that rejection
    // used to surface as a plausible, uncancelled Charge rather than an error.
    //
    // The amount is read from the order rather than taken from the caller:
    // `cancelCharge` receives only an id, and cancelling a total other than
    // the one the order holds is the mistake the field exists to prevent. The
    // read has to precede the cancel, since the cancel is what changes the
    // order's state.
    const client = this.client(credentials)
    const before = await client.get<RawTamaraOrder>(`/orders/${id}`)
    const total = before?.total_amount
    if (!total?.amount || !total.currency) {
      throw new Error(
        `Tamara order ${id} reports no total_amount, which its cancel endpoint requires.`,
      )
    }
    await client.post<unknown>(`/orders/${id}/cancel`, { total_amount: total })
    const order = await client.get<RawTamaraOrder>(`/orders/${id}`)
    return transformCharge(order ?? { order_id: id, status: 'canceled' })
  }

  // ── Refunds ─────────────────────────────────────────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (Tamara order_id) required for refund')
    const total = toTamaraMoney(data.amount, data.currency)
    if (!total) throw new Error('amount required for Tamara refund')
    const res = await this.client(credentials).post<RawTamaraRefund>(
      `/payments/simplified-refund/${data.chargeId}`,
      {
        total_amount: total,
        comment: (data.metadata?.comment as string | undefined) ?? 'Refund requested',
      },
    )
    return transformRefund({ ...res, order_id: res?.order_id ?? data.chargeId })
  }
}
