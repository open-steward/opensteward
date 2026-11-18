/**
 * Flipkart adapter for the ecommerce vertical.
 *
 * Maps Flipkart's Seller API to the canonical ecommerce resources.
 * OAuth2 authorization-code flow (Flipkart "Third-Party Application"); see auth.ts.
 *
 * Slug: `flipkart`
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: collection  — Flipkart Seller API has no collections/product-grouping concept
 * Unavailable: customer    — Flipkart does not expose buyer PII through the Seller API; no customer resource endpoint exists
 * Unavailable: discount    — Flipkart Seller API exposes no discount/promotion management endpoints
 * Unavailable: location    — Location IDs are referenced in inventory payloads but there is no Seller API endpoint to list or retrieve location details
 */

import { connectionScope, cursorPagerKey, pageByRows } from '@opensteward/shared'
import type { CursorPage, Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { InventoryLevel } from '../../schema/inventory'
import { FlipkartClient } from './client'
import { buildAuthUrl, exchangeCode as flipkartExchangeCode, refreshAccessToken } from './auth'
import {
  transformInventoryLevel,
  transformInventoryLevels,
  type RawFlipkartListingDetail,
} from './transform/inventory'

/** `POST /listings/v3/details`: "Maximum 10 SKU IDs are supported per request." */
const DETAILS_BATCH = 10

/**
 * A replayable position in the inventory stream: a search page to fetch, or
 * a 10-SKU details batch inside a search page already fetched (with the
 * search cursor that follows it, if any).
 */
type FlipkartInventoryCursor =
  | { kind: 'search'; pageId: string }
  | { kind: 'details'; skus: readonly string[]; idx: number; after: string | undefined }

export interface FlipkartAdapterConfig {
  /** Third-party application id (appId) from the Flipkart Partner Dashboard. */
  clientId?: string
  /** Third-party application secret (appSecret). */
  clientSecret?: string
  /** HTTPS redirect URL registered with the application. */
  redirectUri?: string
}

export class FlipkartAdapter implements EcommerceAdapter {
  readonly platform = 'flipkart'
  readonly version = '0.1.0'

  private configClientId: string | undefined
  private configClientSecret: string | undefined
  private configRedirectUri: string | undefined

  constructor(config: FlipkartAdapterConfig = {}) {
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
    this.configRedirectUri = config.redirectUri
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    const clientId = this.configClientId
    if (!clientId) throw new Error('Flipkart adapter requires clientId for auth URL.')
    // The docs require redirect_uri to match the callback registered with the
    // application; an empty one can only fail at Flipkart, so fail here instead.
    const redirectUri = this.configRedirectUri
    if (!redirectUri) {
      throw new Error(
        'Flipkart adapter requires redirectUri (the HTTPS callback registered with the application).',
      )
    }
    return buildAuthUrl(
      clientId,
      redirectUri,
      state,
      overrideScopes && overrideScopes.length > 0 ? overrideScopes : undefined,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    const { appId, appSecret } = this.appCredentials()
    return flipkartExchangeCode(appId, appSecret, code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const { appId, appSecret } = this.appCredentials()
    return refreshAccessToken(credentials, appId, appSecret)
  }

  private appCredentials(): { appId: string; appSecret: string } {
    const appId = this.configClientId
    const appSecret = this.configClientSecret
    if (!appId || !appSecret) {
      throw new Error(
        'Flipkart adapter requires the third-party application clientId and clientSecret in its config.',
      )
    }
    return { appId, appSecret }
  }

  // ── Inventory ──────────────────────────────────────────────────────────────

  /**
   * List inventory levels by fetching listing details from the Listings v3 API.
   *
   * The caller may pass `skuIds` (comma-separated) in `params` to scope the
   * request; otherwise the listings come from `POST /listings/v3/search`.
   * Either way details are fetched 10 SKUs at a time (API limit) and each
   * listing flattens to one level per location.
   *
   * Paging: search returns a fixed batch with no size parameter and chains by
   * cursor ("Provide null as the page_id when retrieving the first page. For
   * subsequent pages, use the next_page_id from the previous response as the
   * page_id, but only if has_more field is true." —
   * https://seller.flipkart.com/api-docs/listing-api-docs/LMAPIRef.html).
   * One upstream page is not one caller page, so the caller's rows are cut
   * out of the stream by `pageByRows`, one upstream page per 10-SKU details
   * batch. The upstream size is fixed, so the caller's limit is not in the key.
   */
  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const client = new FlipkartClient(credentials)

    // Collect SKU IDs to fetch. If the caller passes skuIds, use them directly.
    const rawSkuIds = params['skuIds'] as string | undefined
    const callerSkus: string[] = rawSkuIds
      ? rawSkuIds
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : []

    const key = cursorPagerKey(connectionScope('flipkart', credentials), 'inventory-levels', {
      skuIds: callerSkus.length > 0 ? callerSkus.join(',') : undefined,
    })

    const search = async (
      pageId: string | null,
    ): Promise<{ skus: string[]; after: string | undefined }> => {
      const page = await client.post<{
        listings?: Array<{ sku_id?: string }>
        next_page_id?: string | null
        has_more?: boolean
      }>('/listings/v3/search', { page_id: pageId })
      const skus: string[] = []
      for (const l of page.listings ?? []) {
        if (l.sku_id) skus.push(l.sku_id)
      }
      const after = page.has_more && page.next_page_id ? page.next_page_id : undefined
      return { skus, after }
    }

    const fetch = async (
      cursor: FlipkartInventoryCursor | undefined,
    ): Promise<CursorPage<InventoryLevel, FlipkartInventoryCursor>> => {
      let skus: readonly string[]
      let idx: number
      let after: string | undefined
      if (cursor === undefined && callerSkus.length > 0) {
        skus = callerSkus
        idx = 0
        after = undefined
      } else if (cursor === undefined || cursor.kind === 'search') {
        const found = await search(cursor?.pageId ?? null)
        skus = found.skus
        idx = 0
        after = found.after
      } else {
        skus = cursor.skus
        idx = cursor.idx
        after = cursor.after
      }

      const nextSearch: FlipkartInventoryCursor | undefined = after
        ? { kind: 'search', pageId: after }
        : undefined
      if (idx >= skus.length) return { items: [], next: nextSearch }

      const batch = skus.slice(idx, idx + DETAILS_BATCH)
      const details = await client.post<{
        available?: Record<string, RawFlipkartListingDetail>
      }>('/listings/v3/details', { sku_ids: batch })
      const items = transformInventoryLevels(Object.values(details.available ?? {}))

      const nextIdx = idx + DETAILS_BATCH
      const next: FlipkartInventoryCursor | undefined =
        nextIdx < skus.length ? { kind: 'details', skus, idx: nextIdx, after } : nextSearch
      return { items, next }
    }

    const { items } = await pageByRows(key, params, fetch)
    return items
  }

  /**
   * Get a single inventory level by its synthetic id `${skuId}:${locationId}`.
   */
  async getInventoryLevel(
    credentials: Credentials,
    id: string,
  ): Promise<InventoryLevel> {
    const [skuId, locationId] = id.split(':')
    if (!skuId || !locationId) {
      throw new Error(
        `FlipkartAdapter.getInventoryLevel: id must be in the format "<skuId>:<locationId>", got "${id}"`,
      )
    }

    const client = new FlipkartClient(credentials)
    const details = await client.post<{
      available?: Record<string, RawFlipkartListingDetail>
    }>('/listings/v3/details', { skuIds: [skuId] })

    const listing = (details.available ?? {})[skuId]
    if (!listing) {
      throw new Error(`FlipkartAdapter.getInventoryLevel: SKU "${skuId}" not found`)
    }

    const location = (listing.locations ?? []).find((l) => l.id === locationId)
    if (!location) {
      throw new Error(
        `FlipkartAdapter.getInventoryLevel: location "${locationId}" not found for SKU "${skuId}"`,
      )
    }

    return transformInventoryLevel(listing, location)
  }
}
