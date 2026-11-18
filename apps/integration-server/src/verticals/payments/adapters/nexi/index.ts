/**
 * Nexi Checkout adapter (a.k.a. Nets Easy) — payments vertical.
 *
 * Nexi Checkout is the embedded/hosted e-commerce checkout from Nexi Group
 * (the former Nets/DIBS "Easy" product), strong across the Nordics and wider
 * EU. Its Payment API v1 models money movement around a single **payment**
 * object that is reserved, charged, refunded and/or cancelled — which we map
 * onto the canonical `Charge`, with refunds onto canonical `Refund`.
 *
 * Auth: secret API key sent verbatim in the `Authorization` header (no scheme).
 * Collected through the Connect Link form via the shared `simpleApiKey`
 * template; there is no OAuth flow.
 *
 * Resources implemented (only what the Payment API v1 exposes — the rest of the
 * PaymentsAdapter surface auto-501s):
 *   - Charges:       get, create, capture (charge), cancel (release reservation)
 *   - Refunds:       get, create
 *   - Subscriptions: get  (Payment API v1 — GET /v1/subscriptions/{id})
 *   - Payouts:       list, get  (Reporting API — GET /report/v1/payouts[/{id}])
 *
 * There is no list endpoint for payments/charges/refunds in the Payment API v1
 * (bulk reads live in the separate Reporting API) and no standalone Customer
 * resource, so `list*`/customer methods are intentionally omitted.
 *
 * Docs: https://developer.nexigroup.com/nexi-checkout/en-EU/api/payment-v1/
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: customer       — No dedicated customer endpoint in the Payment API v1
 * Unavailable: dispute        — No dispute management endpoint in the Payment API v1
 * Unavailable: invoice        — No invoice endpoint in the Payment API v1
 * Unavailable: payment-method — GET /v1/paymentmethods returns merchant payment-method config (name/enabled), not customer-attached instruments
 * Unavailable: plan           — No plan/product catalog endpoint in the Payment API v1
 * Unavailable: balance-transaction — GET /report/v1/balances returns aggregate credit/debit summaries, not individual transaction records
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { Payout } from '../../schema/payout'
import type { WebhookEvent } from '../../schema/webhook'

import { CREDENTIAL_FORM } from './auth'
import { NexiClient } from './client'
import { API_BASE_URL } from './constants'
import { verifyNexiWebhook, parseNexiWebhookEvents } from './webhook'

import { transformCharge, type RawNexiPayment } from './transform/charge'
import { transformRefund, type RawNexiRefund } from './transform/refund'
import { transformSubscription, type RawNexiSubscription } from './transform/subscription'
import { transformPayout, type RawNexiPayout, type RawNexiPayoutListResponse } from './transform/payout'

/** GET /v1/payments/{paymentId} wraps the payment in a `payment` envelope. */
interface NexiPaymentEnvelope {
  payment?: RawNexiPayment
}

/** POST /v1/payments returns a freshly-created payment id (+ hosted URL). */
interface NexiCreatePaymentResponse {
  paymentId?: string
  hostedPaymentPageUrl?: string
}

/** POST /v1/payments/{id}/charges returns the new chargeId. */
interface NexiCreateChargeResponse {
  chargeId?: string
}

/** POST /v1/charges/{chargeId}/refunds returns the new refundId. */
interface NexiCreateRefundResponse {
  refundId?: string
}

export class NexiAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'nexi'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Nexi Checkout uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Nexi Checkout uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return CREDENTIAL_FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return CREDENTIAL_FORM.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyNexiWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseNexiWebhookEvents(payload)
  }

  private client(credentials: Credentials): NexiClient {
    return new NexiClient(credentials)
  }

  /**
   * Client for the Reporting API, which lives at the same host but under
   * the path prefix /report/v1/ instead of /v1/. We instantiate a second
   * NexiClient passing `API_BASE_URL` as the base so that paths like
   * `/report/v1/payouts` resolve against `https://api.dibspayment.eu/v1`
   * → we override with the base URL string directly for correctness.
   */
  private reportingClient(credentials: Credentials): NexiClient {
    // The NexiClient constructor appends `/${API_VERSION}` to the supplied
    // baseUrl, giving us `https://api.dibspayment.eu/v1`. The Reporting
    // API paths start with `/report/v1/…`, which axios resolves as
    // absolute paths relative to the origin — effectively
    // `https://api.dibspayment.eu/report/v1/…`. This works correctly.
    return new NexiClient(credentials, API_BASE_URL)
  }

  // ── Charges (Payment API) ────────────────────────────────────────────────

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<NexiPaymentEnvelope>(`/payments/${id}`)
    return transformCharge(res.payment ?? {})
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    if (data.amount === undefined) throw new Error('amount required to create a Nexi payment')
    if (!data.currency) throw new Error('currency required to create a Nexi payment')
    const client = this.client(credentials)
    const body: Record<string, unknown> = {
      order: {
        amount: data.amount,
        currency: data.currency.toUpperCase(),
        reference: data.description ?? data.id ?? `charge-${Date.now()}`,
        items: [
          {
            reference: data.description ?? 'item',
            name: data.description ?? 'item',
            quantity: 1,
            unit: 'pcs',
            unitPrice: data.amount,
            grossTotalAmount: data.amount,
            netTotalAmount: data.amount,
          },
        ],
      },
      // A hosted checkout requires a return/termination URL; callers that drive
      // the embedded flow override this via metadata. Keep a placeholder so the
      // create call is well-formed.
      checkout: {
        integrationType: 'EmbeddedCheckout',
        url: (data.metadata?.['checkoutUrl'] as string | undefined) ?? 'https://example.com/checkout',
        termsUrl: (data.metadata?.['termsUrl'] as string | undefined) ?? 'https://example.com/terms',
      },
    }
    const created = await client.post<NexiCreatePaymentResponse>('/payments', body)
    const paymentId = created.paymentId ?? ''
    return this.getCharge(credentials, paymentId)
  }

  /**
   * "Capture" a Nexi payment = charge the reservation. Charges the full order
   * amount by default, or a partial `amount` when supplied. Returns the parent
   * payment re-read so the canonical charge reflects updated summary totals.
   */
  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const client = this.client(credentials)
    const body: Record<string, unknown> = {}
    if (data?.amount !== undefined) body.amount = data.amount
    await client.post<NexiCreateChargeResponse>(`/payments/${id}/charges`, body)
    return this.getCharge(credentials, id)
  }

  /**
   * Cancel an uncaptured Nexi payment — releases the card reservation. Maps to
   * `POST /v1/payments/{paymentId}/cancels`. Re-reads the payment afterwards.
   */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    await this.client(credentials).post(`/payments/${id}/cancels`, {})
    return this.getCharge(credentials, id)
  }

  // ── Refunds ──────────────────────────────────────────────────────────────

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<RawNexiRefund>(`/refunds/${id}`)
    return transformRefund(res ?? {})
  }

  /**
   * Refund a Nexi charge. The canonical `chargeId` is the Nexi `chargeId`
   * (returned by capture / present on `payment.charges[].chargeId`). Refunds
   * the full charged amount by default, or a partial `amount` when supplied.
   */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId required for Nexi refund')
    const body: Record<string, unknown> = {}
    if (data.amount !== undefined) body.amount = data.amount
    const created = await this.client(credentials).post<NexiCreateRefundResponse>(
      `/charges/${data.chargeId}/refunds`,
      body,
    )
    return transformRefund({
      refundId: created.refundId,
      chargeId: data.chargeId,
      amount: data.amount !== undefined ? { amount: data.amount, currency: data.currency } : undefined,
      state: 'Pending',
    })
  }

  // ── Subscriptions ────────────────────────────────────────────────────────

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<RawNexiSubscription>(`/subscriptions/${id}`)
    return transformSubscription(res ?? {})
  }

  // ── Payouts (Reporting API) ──────────────────────────────────────────────

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const queryParams: Record<string, unknown> = {}
    if (params.limit !== undefined) queryParams.pageSize = params.limit
    if (params.page !== undefined) queryParams.pageNumber = params.page
    const res = await this.reportingClient(credentials).get<RawNexiPayoutListResponse>(
      '/report/v1/payouts',
      queryParams,
    )
    return (res.payouts ?? []).map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.reportingClient(credentials).get<RawNexiPayout>(`/report/v1/payouts/${id}`)
    return transformPayout(res ?? {})
  }
}
