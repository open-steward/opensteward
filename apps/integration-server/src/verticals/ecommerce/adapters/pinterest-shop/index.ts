/**
 * Pinterest Shop adapter for the ecommerce vertical.
 *
 * Maps Pinterest's Catalogs API v5 to the canonical ecommerce resources.
 * Pinterest is primarily a visual discovery and catalog platform — merchants
 * sync product feeds and create Product Pins. It has very limited
 * transactional surface (no real order/checkout API).
 *
 * Slug: `pinterest-shop` (both directory and platform identifier).
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented:
 *
 *   Collections:  list, get               (Product Groups API)
 *   Auth:         getAuthUrl, exchangeCode, refreshCredentials
 *   Webhooks:     verifyWebhook, parseWebhookEvents
 *
 * Refused with 501 NOT_SUPPORTED before any request (see notSupported):
 *
 *   listProducts, getProduct — v5 `/catalogs/items` is POST-only, a lookup by
 *     `item_ids` that also requires `country` and `language`; it cannot list.
 *   listOrders — the v5 spec has no order resource.
 *
 * Omitted — the registry will return HTTP 501 automatically:
 *
 *   Product CUD (3)      — catalog items are synced from feed, not created via API.
 *   Variants (5)         — item variations are separate catalog items.
 *   Collection CUD (3)   — product groups managed via feed config.
 *   Locations (2)        — no warehouse/location concept.
 *   Inventory (4)        — availability comes from the feed, not a stock API.
 *   Customers (5)        — no customer/user management API.
 *   Order CUD (4)        — not a transactional platform.
 *   Fulfillments (5)     — no fulfillment tracking.
 *   Refunds (3)          — no refund API.
 *   Transactions (3)     — no financial transaction resource.
 *   Discounts (5)        — no discount/coupon API.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: customer     — Pinterest has no customer/user management API.
// Unavailable: discount     — Pinterest has no discount or coupon API.
// Unavailable: fulfillment  — Pinterest is not a transactional platform; no fulfillment tracking API.
// Unavailable: inventory    — Product availability comes from the merchant feed, not a stock API.
// Unavailable: location     — Pinterest has no warehouse or physical location concept.
// Unavailable: refund       — Pinterest is not a transactional platform; no refund API.
// Unavailable: transaction  — Pinterest is not a transactional platform; no financial transaction resource.

import crypto from 'node:crypto'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { CursorPage, Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Order } from '../../schema/order'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as pinterestExchangeCode,
  refreshCredentials as pinterestRefreshCredentials,
} from './auth'
import { PinterestClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { transformCollection, type RawPinterestProductGroup } from './transform/collection'

/** Pinterest's own OpenAPI spec, the source every refusal below quotes. */
const SPEC = 'https://raw.githubusercontent.com/pinterest/api-description/main/v5/openapi.yaml'

/**
 * Refuses a read Pinterest's v5 API cannot serve, before anything is sent.
 * The router turns the 501 into NOT_SUPPORTED for the caller.
 */
function notSupported(what: string, reason: string): never {
  throw Object.assign(new Error(`Pinterest cannot ${what}: ${reason} (${SPEC})`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

export interface PinterestShopAdapterConfig {
  /** Pinterest app ID (client id). Optional — may come from credentials. */
  clientId?: string
  /** Pinterest app secret (client secret). Optional — may come from credentials. */
  clientSecret?: string
}

export class PinterestShopAdapter implements EcommerceAdapter {
  readonly platform = 'pinterest-shop'
  readonly version = '0.1.0'

  private configClientId: string | undefined
  private configClientSecret: string | undefined

  constructor(config: PinterestShopAdapterConfig = {}) {
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    const clientId = this.configClientId ?? ''
    return buildAuthUrl(clientId, '', state, overrideScopes)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    const clientId = this.configClientId
    const clientSecret = this.configClientSecret
    if (!clientId || !clientSecret) {
      throw new Error(
        'Pinterest exchangeCode requires clientId and clientSecret — ' +
          'configure them in the adapter config or POST credentials with ' +
          'extra.clientId and extra.clientSecret.',
      )
    }
    const result = await pinterestExchangeCode(clientId, clientSecret, code, redirectUri)
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      extra: { clientId, clientSecret },
    }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return pinterestRefreshCredentials(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    const signature = headers['x-pinterest-signature']
    if (!signature) return false
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const eventType = (payload['event_type'] as string | undefined) ?? 'unknown'

    let type: string
    let resourceType: 'products' | 'collections' | 'unknown'
    let action: 'created' | 'updated' | 'deleted' | 'unknown'

    if (eventType === 'catalog_item.created' || eventType === 'pin.created') {
      type = 'product.created'
      resourceType = 'products'
      action = 'created'
    } else if (eventType === 'catalog_item.updated' || eventType === 'pin.updated') {
      type = 'product.updated'
      resourceType = 'products'
      action = 'updated'
    } else if (eventType === 'catalog_item.deleted' || eventType === 'pin.deleted') {
      type = 'product.deleted'
      resourceType = 'products'
      action = 'deleted'
    } else if (eventType === 'product_group.created') {
      type = 'collection.created'
      resourceType = 'collections'
      action = 'created'
    } else if (eventType === 'product_group.updated') {
      type = 'collection.updated'
      resourceType = 'collections'
      action = 'updated'
    } else {
      type = `${eventType}.unknown`
      resourceType = 'unknown'
      action = 'unknown'
    }

    const resourceId =
      (payload['item_id'] as string | undefined) ??
      (payload['product_group_id'] as string | undefined) ??
      (payload['pin_id'] as string | undefined) ??
      'unknown'

    return [
      {
        platform: this.platform,
        type,
        resourceType,
        action,
        resourceId,
        payload,
      },
    ]
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): PinterestClient {
    return new PinterestClient(credentials)
  }

  // ── Products (refused) ────────────────────────────────────────────────────

  // Considered and rejected: the whole-catalog export. `reports/create`
  // (POST /catalogs/reports) takes `CatalogsRetailReportAllItemsFilter` ("If
  // omitted, all items are included"), and `reports/get` "returns a URL to a
  // report given a token ... You can use the URL to download the report." That
  // is an async build-then-download job, not a list paged by bookmark or
  // page_size, so it cannot serve a caller's page. Revisit it here if a
  // report-backed product sync is ever wanted.
  async listProducts(_credentials: Credentials, _params: QueryParams): Promise<Product[]> {
    notSupported(
      'list products',
      '`/catalogs/items` has only `operationId: items/post` ("Get catalogs items (POST)"), a ' +
        'lookup whose `CatalogsRetailItemsPostFilter` requires `item_ids`, with no `bookmark` or ' +
        '`page_size`',
    )
  }

  async getProduct(_credentials: Credentials, _id: string): Promise<Product> {
    notSupported(
      'read a product',
      'there is no `/catalogs/items/{item_id}` path, and the `items/post` body (`CatalogsItemsRequest`) ' +
        'requires `country`, `filters` and `language`, which the connection does not carry',
    )
  }

  // ── Collections (Product Groups API) ──────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const client = this.clientFor(credentials)
    // `page_size`: "Maximum number of items to include in a single page."
    // (default 25, maximum 250). A larger limit is clamped and reported, so
    // the page is judged at the size Pinterest was asked for.
    const requested = params.limit ?? DEFAULT_PAGE_SIZE
    const pageSize = Math.max(1, Math.min(requested, MAX_PAGE_SIZE))
    if (pageSize < requested) reportUpstreamPage(params, { pageSize })

    // `bookmark`: "Cursor used to fetch the next page of items"; null on the
    // final page. One upstream page is one caller page.
    const fetch = async (bookmark: string | undefined): Promise<CursorPage<Collection, string>> => {
      const queryParams: Record<string, unknown> = { page_size: pageSize }
      if (bookmark !== undefined) queryParams['bookmark'] = bookmark
      const result = await client.list<RawPinterestProductGroup>(
        '/catalogs/product_groups',
        queryParams,
      )
      return {
        items: result.items.map(transformCollection),
        next: result.bookmark ?? undefined,
      }
    }

    const key = cursorPagerKey(connectionScope(this.platform, credentials), 'product_groups', {
      limit: pageSize,
    })
    const { items, hasMore } = await pageByCursor(key, params.page, fetch)
    reportUpstreamPage(params, { hasMore })
    return items
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.clientFor(credentials)
    const result = await client.get<RawPinterestProductGroup>(
      `/catalogs/product_groups/${encodeURIComponent(id)}`,
    )
    return transformCollection(result)
  }

  // ── Orders (refused) ──────────────────────────────────────────────────────

  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    notSupported(
      'list orders',
      'the spec documents no order resource; `/catalogs/feeds/{feed_id}/processing_results` ' +
        '("List feed processing results") returns feed-ingestion reports, not orders',
    )
  }
}
