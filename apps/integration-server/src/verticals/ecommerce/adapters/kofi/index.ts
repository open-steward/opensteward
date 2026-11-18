// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   customer, order, product  (derived from webhook payloads)
// Unavailable: collection   — Ko-fi has no collection concept; shop items are flat with no grouping API.
// Unavailable: discount     — no discount/promo-code API; managed via dashboard UI only.
// Unavailable: fulfillment  — digital goods delivered instantly; no fulfillment tracking API.
// Unavailable: inventory    — digital-only platform; no stock-level or inventory API.
// Unavailable: location     — digital-delivery platform; no warehouse or location concept.
// Unavailable: refund       — no refund API; refunds are processed via the Ko-fi dashboard.
// Unavailable: transaction  — no separate transaction resource; payment data is in webhook order payloads only.

import { simpleApiKey } from '@opensteward/shared'
/**
 * Ko-fi adapter for the ecommerce vertical.
 *
 * Ko-fi is a creator tip jar and digital products platform. Creators receive
 * one-time tips ("Donation"), monthly memberships ("Subscription"), and sell
 * digital products / commissions via Ko-fi Shop.
 *
 * Slug: `kofi` (both directory and platform identifier).
 *
 * ── Auth ──────────────────────────────────────────────────────────────────────
 *
 * Ko-fi uses a static verification token — no OAuth2, no token refresh. Set
 * `credentials.accessToken` to the token shown in the Ko-fi webhook settings
 * page. Optionally set `credentials.extra.pageId` to the creator's page slug.
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *
 * Implemented (8):
 *
 *   Webhooks:     verifyWebhook, parseWebhookEvents   (primary integration point)
 *   Products:     listProducts, getProduct             (derived from webhook shop_items)
 *   Orders:       listOrders, getOrder                 (derived from stored webhook events)
 *   Customers:    listCustomers, getCustomer           (derived from supporter data)
 *
 * Omitted (34) — the registry returns HTTP 501 automatically:
 *
 *   Product CUD (3)       — no write API.
 *   Variants (5)          — digital-only; no SKU variants.
 *   Collections (5)       — no collection concept.
 *   Locations (2)         — digital delivery; no warehouses.
 *   Inventory (4)         — no stock levels for digital goods.
 *   Fulfillments (5)      — instant digital delivery; no fulfillment tracking.
 *   Customer CUD (3)      — supporters are read-only.
 *   Order CUD/Cancel (4)  — no order write API.
 *   Refunds (3)           — no refund API; handled via Ko-fi dashboard.
 *   Transactions (3)      — no separate transaction resource.
 *   Discounts (5)         — no discount/promo-code API.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Order } from '../../schema/order'
import type { Customer } from '../../schema/customer'
import type { WebhookEvent } from '../../schema/webhook'

import { verifyKofiWebhook } from './auth'
import { transformShopItem, type RawKofiShopItem } from './transform/product'
import { transformTransaction, type KofiWebhookPayload } from './transform/order'
import { transformCustomer } from './transform/customer'
import {
  KOFI_TYPE_DONATION,
  KOFI_TYPE_SUBSCRIPTION,
  KOFI_TYPE_SHOP_ORDER,
  KOFI_TYPE_COMMISSION,
} from './constants'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class KofiAdapter implements EcommerceAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'kofi'
  readonly version = '0.1.0'

  // ── Auth ───────────────────────────────────────────────────────────────────
  // Ko-fi uses a static token — no OAuth2 flows needed.

  // ── Webhooks ───────────────────────────────────────────────────────────────

  /**
   * Verify an incoming Ko-fi webhook.
   *
   * Ko-fi embeds the verification token directly in the JSON payload as
   * `verification_token`. The `secret` argument must be `credentials.accessToken`.
   * The `headers` and raw `payload` Buffer are not used by Ko-fi.
   */
  verifyWebhook(
    _payload: Buffer,
    _headers: Record<string, string>,
    secret: string,
    parsedPayload?: Record<string, unknown>,
  ): boolean {
    if (!parsedPayload) return false
    return verifyKofiWebhook(parsedPayload as KofiWebhookPayload, secret)
  }

  /**
   * Parse a Ko-fi webhook body into canonical WebhookEvent(s).
   *
   * Ko-fi sends one transaction per request. We always emit a single event
   * whose `type` reflects the Ko-fi transaction type.
   */
  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const kofiPayload = payload as KofiWebhookPayload
    const txType = kofiPayload.type ?? 'unknown'
    const txId =
      kofiPayload.kofi_transaction_id ?? kofiPayload.message_id ?? 'unknown'

    let canonicalType: string
    let resourceType: 'orders' | 'customers' | 'unknown'

    switch (txType) {
      case KOFI_TYPE_DONATION:
        canonicalType = 'order.created'
        resourceType = 'orders'
        break
      case KOFI_TYPE_SHOP_ORDER:
        canonicalType = 'order.created'
        resourceType = 'orders'
        break
      case KOFI_TYPE_SUBSCRIPTION:
        canonicalType = kofiPayload.is_first_subscription_payment
          ? 'customer.created'
          : 'customer.updated'
        resourceType = 'customers'
        break
      case KOFI_TYPE_COMMISSION:
        canonicalType = 'order.created'
        resourceType = 'orders'
        break
      default:
        canonicalType = `${txType}.unknown`
        resourceType = 'unknown'
    }

    return [
      {
        platform: this.platform,
        type: canonicalType,
        resourceType,
        action: canonicalType.endsWith('.created')
          ? 'created'
          : canonicalType.endsWith('.updated')
          ? 'updated'
          : 'unknown',
        resourceId: txId,
        payload,
      },
    ]
  }

  // ── Products ───────────────────────────────────────────────────────────────

  /**
   * Ko-fi has no product listing API. If `params.shopItems` is provided
   * (caller-supplied webhook-derived shop items), we transform those.
   * Otherwise we return an empty array.
   */
  async listProducts(
    _credentials: Credentials,
    params: QueryParams,
  ): Promise<Product[]> {
    const rawItems =
      (params['shopItems'] as RawKofiShopItem[] | undefined) ?? []
    return rawItems.map(transformShopItem)
  }

  /**
   * Return a product by `direct_link_code`. Requires `params.shopItems` to
   * contain the item (webhook-derived data only).
   */
  async getProduct(
    _credentials: Credentials,
    id: string,
    params: QueryParams = {},
  ): Promise<Product> {
    const rawItems =
      (params['shopItems'] as RawKofiShopItem[] | undefined) ?? []
    const found = rawItems.find((item) => item.direct_link_code === id)
    if (!found) {
      throw new Error(
        `Ko-fi getProduct: no shop item with direct_link_code="${id}" found in params.shopItems. ` +
          'Ko-fi does not expose a product listing API — supply webhook-derived shop items via params.shopItems.',
      )
    }
    return transformShopItem(found)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  /**
   * Return orders from caller-supplied webhook payloads (params.transactions).
   * Ko-fi has no REST endpoint for listing historical transactions.
   */
  async listOrders(
    _credentials: Credentials,
    params: QueryParams,
  ): Promise<Order[]> {
    const payloads =
      (params['transactions'] as KofiWebhookPayload[] | undefined) ?? []
    return payloads.map(transformTransaction)
  }

  /**
   * Return a single order by Ko-fi transaction ID (params.transactions lookup).
   */
  async getOrder(
    _credentials: Credentials,
    id: string,
    params: QueryParams = {},
  ): Promise<Order> {
    const payloads =
      (params['transactions'] as KofiWebhookPayload[] | undefined) ?? []
    const found = payloads.find(
      (p) =>
        p.kofi_transaction_id === id ||
        p.message_id === id,
    )
    if (!found) {
      throw new Error(
        `Ko-fi getOrder: no transaction with id="${id}" found in params.transactions. ` +
          'Ko-fi does not expose a REST endpoint for historical orders — supply webhook payloads via params.transactions.',
      )
    }
    return transformTransaction(found)
  }

  // ── Customers ──────────────────────────────────────────────────────────────

  /**
   * Derive unique customers from caller-supplied webhook payloads.
   * Deduplicates by email address (or transaction ID when email is absent).
   */
  async listCustomers(
    _credentials: Credentials,
    params: QueryParams,
  ): Promise<Customer[]> {
    const payloads =
      (params['transactions'] as KofiWebhookPayload[] | undefined) ?? []
    const seen = new Set<string>()
    const customers: Customer[] = []

    for (const payload of payloads) {
      const key = payload.email ?? payload.kofi_transaction_id ?? payload.message_id
      if (!key || seen.has(key)) continue
      seen.add(key)
      customers.push(transformCustomer(payload))
    }

    return customers
  }

  /**
   * Return a customer by email or transaction ID from webhook-derived data.
   */
  async getCustomer(
    _credentials: Credentials,
    id: string,
    params: QueryParams = {},
  ): Promise<Customer> {
    const payloads =
      (params['transactions'] as KofiWebhookPayload[] | undefined) ?? []
    const found = payloads.find(
      (p) =>
        p.email === id ||
        p.kofi_transaction_id === id ||
        p.message_id === id,
    )
    if (!found) {
      throw new Error(
        `Ko-fi getCustomer: no supporter with id="${id}" found in params.transactions.`,
      )
    }
    return transformCustomer(found)
  }

  getAuthUrl(_state: string): string {
    throw new Error('Ko-fi uses verification token auth — no user-facing auth URL.')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Ko-fi uses verification token auth — exchangeCode is not applicable.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Verification token auth has no expiry — return credentials unchanged.
    return credentials
  }
}
