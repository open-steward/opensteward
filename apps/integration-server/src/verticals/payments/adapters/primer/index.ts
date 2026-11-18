/**
 * Primer adapter — payments vertical (payments orchestration anchor).
 *
 * Primer is payment-centric: a **Payment** carries the amount, currency,
 * customer, payment method and overall status, so it maps onto the canonical
 * **Charge**. Refunds and cancellations are actions on a Payment
 * (`POST /payments/{id}/refund`, `POST /payments/{id}/cancel`) that return the
 * updated Payment, and there is no standalone refund or customer collection —
 * customers/refunds are embedded in the Payment.
 *
 * Auth: a single API key sent as the `X-Api-Key` header (no OAuth, no token
 * exchange). The key is environment-bound (production vs sandbox), selected on
 * the Connect Link form and carried as `credentials.extra.baseUrl`. Requests
 * are version-pinned with the `X-Api-Version` header.
 *
 * Webhooks: HMAC-SHA256 over the raw body, base64 in `X-Signature-Primary`
 * (and `X-Signature-Secondary` during secret rotation) — see webhook.ts.
 *
 * Docs: https://primer.io/docs/payments/payments-api
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Available:     charge, refund, customer, payment-method
 * Unavailable:   balance-transaction — Primer offers CSV reconciliation reports only; no balance-transaction REST API
 * Unavailable:   dispute — disputes are delivered via DISPUTE.STATUS webhooks only; no REST list/get endpoint
 * Unavailable:   invoice — Primer is a payment orchestration layer with no invoicing surface
 * Unavailable:   payout — Primer's settlement data is CSV-only; no payout REST API
 * Unavailable:   plan — Primer does not manage subscription plans or products
 * Unavailable:   subscription — Primer handles recurring payments via the Payments API (paymentType: SUBSCRIPTION), not as distinct subscription records
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
  reportUpstreamPage,
  type BaseAdapter,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PAYMENT_INSTRUMENTS_PATH,
  PAYMENTS_PATH,
  PROD_BASE_URL,
  paymentCancelPath,
  paymentRefundPath,
} from './constants'
import { CREDENTIAL_FIELDS, buildCredentials } from './auth'
import { PrimerClient, type PrimerListResponse } from './client'
import { parsePrimerWebhookEvents, verifyPrimerWebhook } from './webhook'

import { transformCharge, type RawPrimerPayment } from './transform/charge'
import {
  transformPaymentMethod,
  type RawPrimerPaymentInstrument,
} from './transform/payment-method'
import { transformRefund, type RawPrimerRefund } from './transform/refund'

export class PrimerAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'primer'
  readonly version = '0.1.0'
  /**
   * GET /payments documents `limit` with "maximum: 100". listPaymentMethods
   * pages locally or refuses, so every list method honours this cap.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('Primer uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Primer uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // The stored credential is the long-lived API key; nothing to refresh.
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPrimerWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePrimerWebhookEvents(payload)
  }

  private client(credentials: Credentials): PrimerClient {
    return new PrimerClient(credentials)
  }

  /**
   * One connection: the environment host plus a fingerprint of the API key
   * (a key belongs to exactly one Primer account and environment).
   */
  private scope(credentials: Credentials): string {
    const extra = (credentials.extra ?? {}) as Record<string, unknown>
    const baseUrl = typeof extra.baseUrl === 'string' ? extra.baseUrl : PROD_BASE_URL
    return connectionScope(baseUrl, credentials)
  }

  /**
   * Primer paginates with an opaque `cursor` + `limit` (capped at 100) and
   * accepts merchant-side filters (`customerId`, `orderId`, `status`). The
   * cursor is not taken from the caller: listCharges derives it from `page`.
   */
  private listParams(params: QueryParams): Record<string, unknown> {
    const asked = Math.floor(params.limit ?? DEFAULT_PAGE_SIZE)
    const out: Record<string, unknown> = {
      limit: Math.min(Math.max(asked, 1), MAX_PAGE_SIZE),
    }
    if (params['customer_id']) out.customerId = params['customer_id']
    if (params['order_id']) out.orderId = params['order_id']
    if (params['status']) out.status = params['status']
    return out
  }

  // ── Payment Methods (Primer Payment Instruments) ───────────────────────────
  /**
   * `GET /payment-instruments?customer_id=<id>` returns all vaulted payment
   * methods for one customer: "Retrieve a list of stored payment methods for a
   * customer." Its only query parameter is `customer_id` (required: true) and
   * the response is `{ data }` with no cursor, limit or page, so the whole
   * collection is sliced to the caller's page with pageLocally.
   *
   * Without `customer_id` there is no merchant-wide list to fetch, so the call
   * is refused with 501 before sending anything — an empty list would be
   * cached as a complete, empty collection.
   * (https://primer.io/docs/api-reference/v2.4/api-reference/payment-methods-api/list-saved-payment-methods.md)
   */
  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const customerId = params['customer_id']
    if (!customerId) {
      throw Object.assign(
        new Error(
          'Primer cannot list payment methods without a customer: GET /payment-instruments ' +
            'requires customer_id and has no merchant-wide list.',
        ),
        { statusCode: 501, code: 'NOT_SUPPORTED' },
      )
    }
    const res = await this.client(credentials).get<PrimerListResponse<RawPrimerPaymentInstrument>>(
      PAYMENT_INSTRUMENTS_PATH,
      { customer_id: customerId },
    )
    return pageLocally((res.data ?? []).map(transformPaymentMethod), params)
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const res = await this.client(credentials).get<RawPrimerPaymentInstrument>(
      `${PAYMENT_INSTRUMENTS_PATH}/${id}`,
    )
    return transformPaymentMethod(res ?? {})
  }

  // ── Charges (Primer Payments) ───────────────────────────────────────────────
  /**
   * "To access the next page of result, set the `cursor` query parameter to
   * the value of `nextCursor` in your current result payload."
   * (https://primer.io/docs/api-reference/v2.4/api-reference/payments-api/search-&-list-payments.md)
   * One upstream page of `limit` rows is one caller page; pageByCursor walks
   * the `nextCursor` chain to reach `page`, and an absent `nextCursor` is the end.
   */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const query = this.listParams(params)
    const client = this.client(credentials)
    const key = cursorPagerKey(this.scope(credentials), 'payments', query)
    const { items, hasMore } = await pageByCursor<RawPrimerPayment>(
      key,
      params.page,
      async (cursor) => {
        const res = await client.get<PrimerListResponse<RawPrimerPayment>>(PAYMENTS_PATH, {
          ...query,
          ...(cursor ? { cursor } : {}),
        })
        return { items: res.data ?? [], next: res.nextCursor || null }
      },
    )
    reportUpstreamPage(params, { hasMore })
    return items.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawPrimerPayment>(`${PAYMENTS_PATH}/${id}`)
    return transformCharge(res ?? {})
  }

  /** Cancel an uncaptured (authorised/pending) Primer payment. */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<RawPrimerPayment>(paymentCancelPath(id), {})
    return transformCharge(res ?? {})
  }

  // ── Refunds ─────────────────────────────────────────────────────────────────
  /**
   * Primer refunds a payment in place: `POST /payments/{id}/refund` returns the
   * updated Payment, which we project onto the canonical Refund. The canonical
   * `amount` is already in minor units, matching Primer's wire format.
   */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (Primer payment id) is required for a refund')
    const body: Record<string, unknown> = {}
    if (typeof data.amount === 'number') body.amount = data.amount
    if (data.reason) body.reason = data.reason
    const res = await this.client(credentials).post<RawPrimerRefund>(
      paymentRefundPath(data.chargeId),
      body,
    )
    return transformRefund(res ?? {})
  }
}
