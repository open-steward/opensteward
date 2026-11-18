/**
 * Payhip adapter for the ecommerce vertical.
 *
 * Payhip's public REST API (v2) currently supports only:
 *  - Coupons (Discounts): list, get, create
 *  - License keys (not an ecommerce canonical resource)
 *
 * All other canonical resources (products, collections, locations, inventory,
 * customers, orders, fulfillments, refunds, transactions) are NOT yet exposed
 * via the Payhip API and auto-501 via the registry.
 *
 * Webhooks: Payhip pushes four event types:
 *  - paid → orders.created
 *  - refunded → refunds.created
 *  - subscription.created → orders.created
 *  - subscription.deleted → orders.updated
 *
 * Auth: static API key sent as `payhip-api-key` header.
 *
 * Docs: https://payhip.com/api-reference
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: product      — Payhip REST API v2 exposes only coupons and license keys; no product endpoint exists (confirmed https://payhip.com/api-reference)
// Unavailable: collection   — No collection endpoint in Payhip REST API v2
// Unavailable: customer     — No customer endpoint in Payhip REST API v2
// Unavailable: order        — No order endpoint in Payhip REST API v2 (webhook-only: paid / subscription events)
// Unavailable: fulfillment  — No fulfillment endpoint in Payhip REST API v2
// Unavailable: refund       — No refund endpoint in Payhip REST API v2 (webhook-only: refunded event)
// Unavailable: transaction  — No transaction endpoint in Payhip REST API v2
// Unavailable: inventory    — No inventory endpoint in Payhip REST API v2
// Unavailable: location     — No location endpoint in Payhip REST API v2

import type { Credentials, QueryParams } from '@opensteward/shared'
import { pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import { PAYHIP_API_KEY_FORM } from './auth'
import { PayhipClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyPayhipWebhook, parsePayhipWebhookEvents } from './webhook'
import {
  transformDiscount,
  untransformDiscount,
  type RawPayhipCoupon,
} from './transform/discount'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PayhipAdapterConfig {
  // No OAuth config needed — Payhip uses a static API key supplied by the
  // user at connection time via the simpleApiKey credential form.
}

export class PayhipAdapter implements EcommerceAdapter {
  readonly platform = 'payhip'
  readonly version = '0.1.0'
  /** "Limit can range between 1 and 100, and the default is 10." (payhip.com/api-reference) */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // ── Credential form (static API key) ──────────────────────────────────────
  credentialFields = PAYHIP_API_KEY_FORM.credentialFields
  exchangeCredentials = PAYHIP_API_KEY_FORM.exchangeCredentials

  constructor(_config: PayhipAdapterConfig = {}) {}

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * Payhip does not use OAuth — there is no authorization URL. This method
   * is required by BaseAdapter but is unused in practice; returning an empty
   * string keeps the implementation well-typed.
   */
  getAuthUrl(_state: string): string {
    return ''
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'Payhip does not use OAuth code exchange. ' +
        'Supply an API key from Payhip Settings → Developer via the credential form.',
    )
  }

  /** API keys do not expire — return unchanged. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    // Payhip embeds the signature inside the JSON body; parse it first.
    let parsed: Record<string, unknown> | undefined
    try {
      parsed = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
    } catch {
      return false
    }
    return verifyPayhipWebhook(payload, headers, secret, parsed)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePayhipWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): PayhipClient {
    return new PayhipClient(credentials)
  }

  /**
   * Payhip's `limit` + `offset` for the caller's 1-based `page`: `limit` is the
   * caller's limit clamped to Payhip's 1–100 range (default 10), and `offset`
   * is `(page - 1) × limit` at that clamped size.
   */
  private offsetParams(params: QueryParams): { limit: number; offset: number } {
    const asked = params.limit
    const limit =
      typeof asked === 'number' && Number.isFinite(asked) && asked >= 1
        ? Math.min(Math.floor(asked), MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE
    return { limit, offset: pageOffset(params, limit) }
  }

  // ── Discounts (Coupons) ───────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const query = this.offsetParams(params)
    const res = await this.client(credentials).listWithOffset<RawPayhipCoupon>(
      '/coupons',
      'coupons',
      query,
    )
    // No total, has_more or next link in the envelope: a full page may be
    // followed by more, a short one is the end.
    reportUpstreamPage(params, { hasMore: res.items.length >= query.limit, pageSize: query.limit })
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.client(credentials).get<{ data: RawPayhipCoupon }>(
      `/coupons/${id}`,
    )
    return transformDiscount(res.data)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const res = await this.client(credentials).post<{ data: RawPayhipCoupon }>(
      '/coupons',
      untransformDiscount(data),
    )
    return transformDiscount(res.data)
  }
}
