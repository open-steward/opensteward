/**
 * PayU (GPO / EMEA REST API) adapter — payments vertical (Central / Eastern
 * Europe anchor: PL, CZ, RO, and the wider CEE market).
 *
 * PayU models money as Orders. Each order has a status lifecycle
 * (NEW → PENDING → WAITING_FOR_CONFIRMATION → COMPLETED / CANCELED) and zero or
 * more order-scoped Refunds.
 *
 * Resource id conventions:
 *   - `getCharge(id)` / `createCharge` / `cancelCharge(id)` → id is the PayU `orderId`.
 *   - `getRefund(id)`              → id is `"<orderId>:<refundId>"`.
 *   - `listRefunds({ orderId })`   → refunds for that order.
 *   - `createRefund({ chargeId })` → chargeId is the `orderId`.
 *   - `getPayout(id)`              → id is the PayU `payoutId`.
 *
 * Auth: OAuth `client_credentials` bearer token (auth model `api_key` — the
 * POS client id / secret are pasted into the Connect Link form, no interactive
 * redirect). Tokens are short-lived; `refreshCredentials` re-mints them.
 *
 * Money: PayU quotes integer MINOR units already (encoded as strings), matching
 * the canonical schema — transforms parse, they do not scale.
 *
 * Docs: https://developers.payu.com/europe/docs/payment-flows/auth-and-order/
 *
 * ── Resource coverage ──────────────────────────────────────────────────────────
 * Unavailable: balance-transaction — no structured balance-transaction API; statements endpoint returns CSV/PDF file downloads only
 * Unavailable: customer           — no general buyer/customer resource; buyer is embedded inside each order; marketplace /customers/ext/... endpoints are seller-account-only
 * Unavailable: dispute            — no disputes endpoint in the PayU REST API v2_1
 * Unavailable: invoice            — no invoices endpoint; recurring payments reuse the orders endpoint with a recurring=STANDARD flag
 * Unavailable: payment-method     — /api/v2_1/paymethods returns merchant-wide available payment types, not per-customer stored instruments
 * Unavailable: plan               — no subscription billing plans concept in the PayU API
 * Unavailable: subscription       — no subscriptions endpoint; recurring is implemented via orders with recurring=FIRST/STANDARD
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildCredentials,
  extraFrom,
  refreshCredentials as refreshPayuCredentials,
} from './auth'
import { PayuClient } from './client'
import { parsePayuWebhookEvents, verifyPayuWebhook } from './webhook'

import {
  transformCharge,
  untransformCharge,
  type RawPayuOrder,
} from './transform/charge'
import {
  transformRefund,
  untransformRefund,
  type RawPayuRefund,
} from './transform/refund'
import { transformPayout, type RawPayuPayout } from './transform/payout'

/** `GET /orders/{id}` returns an `orders[]` array; create echoes top-level fields. */
interface PayuOrderEnvelope {
  status?: { statusCode?: string; statusDesc?: string }
  orders?: RawPayuOrder[]
  // Create-order response promotes these to the top level.
  orderId?: string
  extOrderId?: string
  redirectUri?: string
}

interface PayuRefundEnvelope {
  status?: { statusCode?: string; statusDesc?: string }
  refund?: RawPayuRefund
  refunds?: RawPayuRefund[]
}

interface PayuPayoutEnvelope {
  status?: { statusCode?: string; statusDesc?: string }
  payout?: RawPayuPayout
}

/** Split a `getRefund` id into its order + refund components.
 *  Accepts `"<orderId>:<refundId>"`; falls back to treating the whole string
 *  as the refund id (callers may also pass `orderId` via params). */
function splitRefundId(id: string): { orderId?: string; refundId: string } {
  const idx = id.indexOf(':')
  if (idx === -1) return { refundId: id }
  return { orderId: id.slice(0, idx), refundId: id.slice(idx + 1) }
}

export class PayuAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'payu'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error(
      'PayU uses an OAuth client_credentials key pair; submit the POS client id + secret via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('PayU uses a client_credentials key pair; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'sandbox', label: 'Sandbox (test)' },
          { value: 'production', label: 'Production (live)' },
        ],
      },
      {
        name: 'merchantPosId',
        label: 'Merchant POS ID (pos_id)',
        type: 'text',
        required: true,
        helpText: 'Numeric point-of-sale id from the PayU management panel (POS → key configuration).',
      },
      {
        name: 'clientId',
        label: 'OAuth client ID',
        type: 'text',
        required: false,
        helpText: 'Defaults to the POS ID. Set only if you created a separate private OAuth client.',
      },
      {
        name: 'clientSecret',
        label: 'OAuth client secret',
        type: 'password',
        required: true,
        helpText: 'Client secret / "OAuth protocol" key from the same POS configuration.',
      },
      {
        name: 'secondKey',
        label: 'Second key (MD5)',
        type: 'password',
        required: false,
        helpText: 'Used to verify the OpenPayu-Signature on incoming notifications.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshPayuCredentials(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPayuWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePayuWebhookEvents(payload)
  }

  private client(credentials: Credentials): PayuClient {
    return new PayuClient(credentials)
  }

  // ── Charges (orders) ────────────────────────────────────────────────────────

  /** Fetch an order and present it as a canonical charge. `id` = `orderId`. */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<PayuOrderEnvelope>(
      `/orders/${encodeURIComponent(id)}`,
    )
    const order = res.orders?.[0] ?? {}
    return transformCharge(order)
  }

  /** Create an order; the response is presented as a pending charge with the
   *  PayU `redirectUri` (where the buyer completes payment) in metadata. */
  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const { merchantPosId } = extraFrom(credentials)
    const body = untransformCharge(data, merchantPosId)
    const res = await this.client(credentials).post<PayuOrderEnvelope>('/orders', body)
    const charge = transformCharge({
      orderId: res.orderId,
      extOrderId: res.extOrderId,
      status: res.orderId ? 'PENDING' : undefined,
      totalAmount: typeof data.amount === 'number' ? String(data.amount) : undefined,
      currencyCode: data.currency,
      description: data.description ?? undefined,
      merchantPosId,
    })
    if (res.redirectUri) {
      charge.metadata = { ...charge.metadata, redirectUri: res.redirectUri }
    }
    return charge
  }

  /** Cancel an order. PayU `DELETE /orders/{id}` requests cancellation; the
   *  order moves to CANCELED asynchronously, so we present it as cancelled. */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).delete<PayuOrderEnvelope>(
      `/orders/${encodeURIComponent(id)}`,
    )
    return transformCharge({ orderId: id, status: 'CANCELED', ...(res.orders?.[0] ?? {}) })
  }

  // ── Refunds ──────────────────────────────────────────────────────────────────

  /** List refunds for one order. Requires `params.orderId`; returns `[]`
   *  otherwise (PayU refunds are order-scoped). */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = typeof params.orderId === 'string' ? params.orderId : undefined
    if (!orderId) return []
    const res = await this.client(credentials).get<PayuRefundEnvelope>(
      `/orders/${encodeURIComponent(orderId)}/refunds`,
    )
    return (res.refunds ?? []).map((r) => transformRefund({ ...r, orderId }))
  }

  /** Fetch a single refund. `id` is `"<orderId>:<refundId>"`. */
  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const { orderId, refundId } = splitRefundId(id)
    if (!orderId) {
      throw new Error('PayU refund lookup needs "<orderId>:<refundId>"; order id missing.')
    }
    const res = await this.client(credentials).get<PayuRefundEnvelope>(
      `/orders/${encodeURIComponent(orderId)}/refunds/${encodeURIComponent(refundId)}`,
    )
    return transformRefund({ ...(res.refund ?? {}), orderId })
  }

  /** Create a refund against an order. `data.chargeId` = `orderId`. */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (PayU orderId) required for refund')
    const body = untransformRefund(data)
    const res = await this.client(credentials).post<PayuRefundEnvelope>(
      `/orders/${encodeURIComponent(data.chargeId)}/refunds`,
      body,
    )
    return transformRefund({ ...(res.refund ?? {}), orderId: data.chargeId })
  }

  // ── Payouts ──────────────────────────────────────────────────────────────────

  /**
   * Fetch a single payout. `id` = `payoutId` (PayU-generated).
   * PayU has no list-payouts endpoint; only individual retrieval is supported.
   * Docs: GET /api/v2_1/payouts/{payoutId}
   */
  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<PayuPayoutEnvelope>(
      `/payouts/${encodeURIComponent(id)}`,
    )
    return transformPayout(res.payout ?? { payoutId: id })
  }
}
