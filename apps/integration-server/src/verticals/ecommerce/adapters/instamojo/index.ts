/**
 * Instamojo adapter for the ecommerce vertical.
 *
 * Instamojo is an Indian payment gateway, not a general-purpose ecommerce
 * platform. It supports:
 *
 *  - Payment Requests  → canonical Orders   (create, get, list)
 *  - Payments          → canonical Transactions (get, list)
 *  - Refunds           → canonical Refunds  (create, get; no documented list)
 *  - Products          → canonical Products (list, get)  [scope: products:read]
 *
 * Auth: OAuth2 Authorization Code flow.
 *   Authorize:  https://www.instamojo.com/oauth2/authorize/
 *   Token:      https://www.instamojo.com/oauth2/token/
 *   API:        https://api.instamojo.com/v2/
 *
 * Sandbox:
 *   Authorize:  https://test.instamojo.com/oauth2/authorize/
 *   Token:      https://test.instamojo.com/oauth2/token/
 *   API:        https://test.instamojo.com/v2/
 *
 * Access tokens expire after 10 hours; the adapter uses the stored
 * refresh token to obtain new access tokens transparently.
 *
 * Docs: https://docs.instamojo.com/reference/overview-and-setup-1
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: collection  — no collection concept exists in the Instamojo API
 * Unavailable: customer    — no dedicated customer endpoint; buyer details are
 *                            embedded in orders only (no stable customer id)
 * Unavailable: discount    — no discount management endpoint in the standard v2
 *                            API; MDP store coupons require separate enrollment
 * Unavailable: fulfillment — Instamojo is a payment gateway; no physical
 *                            fulfillment tracking exists
 * Unavailable: inventory   — no inventory management concept in the payment API
 * Unavailable: location    — no warehouse or location concept exists
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Order } from '../../schema/order'
import type { Product } from '../../schema/product'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as instamojoExchangeCode,
  refreshToken as instamojoRefreshToken,
  DEFAULT_SCOPES,
} from './auth'
import { InstamojoClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyInstamojoWebhookFields, parseInstamojoWebhookEvents } from './webhook'

import {
  transformOrder,
  untransformOrder,
  type RawInstamojoPaymentRequest,
} from './transform/order'
import { transformTransaction, type RawInstamojoPayment } from './transform/transaction'
import { transformRefund, untransformRefund, type RawInstamojoRefund } from './transform/refund'
import {
  refundCasePaymentId,
  transformRefundCase,
  type RawInstamojoPaymentDetail,
  type RawInstamojoRefundCase,
} from './transform/refund-case'
import { transformProduct, type RawInstamojoProduct } from './transform/product'

export interface InstamojoAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** Use the sandbox environment. Defaults to false (production). */
  sandbox?: boolean
  scopes?: string[]
}

export class InstamojoAdapter implements EcommerceAdapter {
  readonly platform = 'instamojo'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private sandbox: boolean
  private scopes: string[]

  constructor(config: InstamojoAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.sandbox = config.sandbox ?? false
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
      this.sandbox,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return instamojoExchangeCode(code, this.clientId, this.clientSecret, redirectUri, this.sandbox)
  }

  /**
   * Instamojo access tokens expire after 10 hours. We refresh using the
   * stored refresh_token. If the refresh token is missing or the call fails,
   * the original credentials are returned unchanged so the upstream caller
   * can re-authorize.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return instamojoRefreshToken(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  /**
   * Instamojo's webhook MAC is embedded in the POST body fields, not in an
   * HTTP header. Because the interface receives a raw Buffer, we parse it here
   * into a key-value map and verify using HMAC-SHA1.
   *
   * The `secret` parameter should be the private salt from the Instamojo
   * integrations dashboard.
   */
  verifyWebhook(payload: Buffer, _headers: Record<string, string>, secret: string): boolean {
    try {
      const body = payload.toString('utf8')
      const fields: Record<string, string> = {}
      for (const pair of body.split('&')) {
        const idx = pair.indexOf('=')
        if (idx === -1) continue
        const key = decodeURIComponent(pair.slice(0, idx).replace(/\+/g, ' '))
        const val = decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, ' '))
        fields[key] = val
      }
      return verifyInstamojoWebhookFields(fields, secret)
    } catch {
      return false
    }
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseInstamojoWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): InstamojoClient {
    // Forward the sandbox flag stored in credentials.extra if it differs
    // from the adapter-level config (e.g. per-connection override).
    const sandboxFromCreds = credentials.extra?.['sandbox'] as boolean | undefined
    const effectiveSandbox = sandboxFromCreds ?? this.sandbox
    return new InstamojoClient({
      ...credentials,
      extra: { ...credentials.extra, sandbox: effectiveSandbox },
    })
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params['page'] != null) out['page'] = params['page']
    if (params.updatedAfter) {
      out['min_modified_at'] = params.updatedAfter.toISOString()
    }
    return out
  }

  // ── Orders (Payment Requests) ─────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.client(credentials).listWithPage<RawInstamojoPaymentRequest>(
      'payment_requests/',
      'payment_requests',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<{ payment_request: RawInstamojoPaymentRequest }>(
      `payment_requests/${id}/`,
    )
    return transformOrder(res.payment_request)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).postForm<{
      payment_request: RawInstamojoPaymentRequest
    }>('payment_requests/', untransformOrder(data))
    return transformOrder(res.payment_request)
  }

  // ── Transactions (Payments) ───────────────────────────────────────────────

  /**
   * List payments. Instamojo does not expose a top-level paginated payments
   * list via the v2 API in the same way; instead payments are nested inside
   * payment requests. When `params.orderId` is provided we fetch the payments
   * for that specific payment request. Otherwise we return an empty array to
   * remain non-throwing.
   */
  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const paymentRequestId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!paymentRequestId) {
      // Instamojo does not expose an unscoped /payments/ list endpoint.
      return []
    }
    const res = await this.client(credentials).get<{
      payment_request: RawInstamojoPaymentRequest
    }>(`payment_requests/${paymentRequestId}/`)
    const payments = res.payment_request.payments ?? []
    // The nested payment objects may be stubs. For each we fetch full details.
    const full = await Promise.all(
      payments.map(async (p) => {
        if (!p.payment_id) return null
        try {
          const detail = await this.client(credentials).get<{
            payment: RawInstamojoPayment
          }>(`payments/${p.payment_id}/`)
          return detail.payment
        } catch {
          // Return the stub if the full fetch fails.
          return p as unknown as RawInstamojoPayment
        }
      }),
    )
    return full.filter((p): p is RawInstamojoPayment => p != null).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const res = await this.client(credentials).get<{ payment: RawInstamojoPayment }>(
      `payments/${id}/`,
    )
    return transformTransaction(res.payment)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  /**
   * Instamojo's v2 API documents no way to list refunds. Its reference index
   * (https://docs.instamojo.com/llms.txt) names only "Create a Refund"
   * (POST /v2/payments/{payment_id}/refund/) and "Get details of a refund"
   * (GET /v2/resolutioncenter/cases/{id}/, a lookup by id). The v2-mdp index
   * (https://docs.instamojo.com/v2-mdp/llms.txt) has no refunds list either.
   * The old GET /v2/refunds/ path this method used is not routed by the
   * production gateway. Refuse before sending anything.
   */
  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw Object.assign(
      new Error(
        'Instamojo cannot list refunds: its v2 API documents only "Create a Refund" and "Get details of a refund" (GET /v2/resolutioncenter/cases/{id}/), a lookup by id',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  /**
   * GET /v2/resolutioncenter/cases/{id}/ — "This will fetch the details of a
   * refund made on a payment on Instamojo."
   * https://docs.instamojo.com/reference/get-details-of-a-refund-1
   * The case is the top-level response body.
   *
   * The case names only its payment. The order (payment request) id comes from
   * that payment's documented `payment_request` link, read with
   * GET /v2/payments/{id}/ ("Get Payment Details", top-level body,
   * https://docs.instamojo.com/reference/get-payment-details-1).
   */
  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const client = this.client(credentials)
    const refundCase = await client.get<RawInstamojoRefundCase>(
      `resolutioncenter/cases/${encodeURIComponent(id)}/`,
    )
    const paymentId = refundCasePaymentId(refundCase)
    const payment = await client.get<RawInstamojoPaymentDetail>(
      `payments/${encodeURIComponent(paymentId)}/`,
    )
    return transformRefundCase(refundCase, payment)
  }

  /**
   * Create a refund on a payment.
   *
   * `data.orderId` should be the Instamojo payment_id (not the payment
   * request id). The caller supplies `data.reason` as the three-letter type
   * code and `data.note` as the explanatory body.
   */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId (the Instamojo payment_id)')
    const body = untransformRefund(data)
    const res = await this.client(credentials).postForm<{ refund: RawInstamojoRefund }>(
      `payments/${data.orderId}/refund/`,
      body,
    )
    return transformRefund(res.refund)
  }

  // ── Products ──────────────────────────────────────────────────────────────

  /**
   * List products from the merchant's Instamojo storefront.
   *
   * Requires OAuth scope `products:read`. Products are paginated via the
   * standard Instamojo page-based envelope (envelope key: `products`).
   *
   * Endpoint: GET /v2/products
   * Docs: https://docs.instamojo.com/page/mojo-developers-program
   */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).listWithPage<RawInstamojoProduct>(
      'products/',
      'products',
      this.listParams(params),
    )
    return res.items.map(transformProduct)
  }

  /**
   * Fetch a single product by its slug.
   *
   * Endpoint: GET /v2/products/<slug>/
   */
  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<{ product: RawInstamojoProduct }>(
      `products/${id}/`,
    )
    return transformProduct(res.product)
  }
}
