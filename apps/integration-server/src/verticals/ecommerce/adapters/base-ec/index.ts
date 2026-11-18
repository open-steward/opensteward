/**
 * BASE (thebase.in) adapter for the ecommerce vertical.
 *
 * BASE is Japan's largest DIY online-shop builder (https://thebase.com,
 * https://docs.thebase.in/api/) — a single global API host serving every
 * shop (no per-shop subdomain), OAuth2 authorization-code with refresh
 * tokens, and a small, deliberately narrow REST surface: items (products +
 * embedded variations), categories (collections), stock, and orders.
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented:
 *   Products:    list, get, create, update, delete      (items API)
 *   Variants:    delete only                             (items/delete_variation —
 *                the only variation operation independent of the parent item;
 *                creating/renaming a variation is only possible by resubmitting
 *                the full variation arrays on items/add or items/edit)
 *   Collections: list, get*, create, update, delete       (categories API;
 *                *get is synthesised by listing and filtering — BASE has no
 *                categories/detail endpoint)
 *   Orders:      list, get, cancel                        (orders API +
 *                orders/edit_status; BASE tracks ship/cancel status per LINE
 *                ITEM, not per order — cancelOrder fans out over every
 *                still-`ordered` item on the order)
 *
 * Unavailable — see ./metadata.ts for the documented reason on each:
 *   customer, location, inventory, fulfillment, refund, transaction, discount
 *
 * Inventory is deliberately NOT implemented even though `items/edit_stock`
 * genuinely exists: BASE has no location/warehouse resource, stock is not
 * held per location, and the canonical `InventoryLevel.locationId` is
 * required — reporting a synthetic location id would point every level at a
 * location `listLocations` (also unimplemented) never returns, a dangling
 * reference for any consumer that joins stock to locations.
 *
 * Webhooks: BASE's Apps platform has no webhook/callback mechanism
 * (confirmed against https://docs.thebase.in/api/ — no such section exists).
 * `webhook.ts` was removed; see the top-level rebuild report for the
 * required `../../webhooks.ts` edit this repo's convention keeps out of
 * adapter worktrees.
 *
 * Pagination: `limit` (≤100, default 20) + `offset`, confirmed on both
 * `items/` and `orders/`. BASE does not publish a response total, so list
 * methods do not call `reportUpstreamPage` — an unknown total stays unknown
 * rather than being guessed from page length.
 */

import { pageLocally } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeCode as baseEcExchangeCode, refreshCredentials as baseEcRefreshCredentials } from './auth'
import { BaseEcClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, DEFAULT_SCOPES } from './constants'

import {
  transformProduct,
  untransformProduct,
  type RawBaseEcItem,
} from './transform/product'
import { transformCollection, untransformCollection, type RawBaseEcCategory } from './transform/collection'
import { transformOrder, type RawBaseEcOrder } from './transform/order'

export interface BaseEcAdapterConfig {
  /** Deployment-wide OAuth2 app credentials (BASE has no per-shop app). */
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** Parse a `${itemId}:${variationId}` composite id used for variants/inventory levels. */
function splitCompositeId(id: string, expectParts: number): string[] {
  const parts = id.split(':')
  if (parts.length !== expectParts || parts.some((p) => !p)) {
    throw new Error(
      `BASE: invalid id '${id}' — expected ${expectParts} ':'-separated, non-empty parts.`,
    )
  }
  return parts
}

export class BaseEcAdapter implements EcommerceAdapter {
  readonly platform = 'base-ec'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: BaseEcAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return baseEcExchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return baseEcRefreshCredentials(credentials, this.clientId, this.clientSecret)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): BaseEcClient {
    return new BaseEcClient(credentials)
  }

  private pageParams(params: QueryParams): { limit: number; offset: number } {
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    return { limit, offset: Math.max(0, page - 1) * limit }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<{ items: RawBaseEcItem[] }>(
      'items/',
      this.pageParams(params),
    )
    return (res.items ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<{ item: RawBaseEcItem }>(`items/detail/${id}`)
    return transformProduct(res.item)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).post<{ item: RawBaseEcItem }>(
      'items/add',
      untransformProduct(data),
    )
    return transformProduct(res.item)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.client(credentials).post<{ item: RawBaseEcItem }>('items/edit', {
      item_id: id,
      ...untransformProduct(data),
    })
    return transformProduct(res.item)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).post('items/delete', { item_id: id })
  }

  // ── Variants ──────────────────────────────────────────────────────────────
  // Only deletion is a standalone operation — see the module doc comment.

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    const [itemId, variationId] = splitCompositeId(id, 2)
    await this.client(credentials).post('items/delete_variation', {
      item_id: itemId,
      variation_id: variationId,
    })
  }

  // ── Collections (Categories) ─────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const res = await this.client(credentials).get<{ categories: RawBaseEcCategory[] }>(
      'categories/',
    )
    // Every category in one response: paged locally, so a caller limit below
    // the category count (the adapter declares maxPageSize 100) reaches each.
    return pageLocally((res.categories ?? []).map(transformCollection), params)
  }

  /** BASE has no `categories/detail` endpoint — list and filter client-side. */
  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const categories = await this.listCollections(credentials, {})
    const found = categories.find((c) => c.id === id)
    if (!found) throw new Error(`BASE: category '${id}' not found`)
    return found
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const res = await this.client(credentials).post<{ categories: RawBaseEcCategory[] }>(
      'categories/add',
      untransformCollection(data),
    )
    const created = res.categories?.[res.categories.length - 1]
    if (!created) throw new Error('BASE: categories/add returned no category')
    return transformCollection(created)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).post<{ categories: RawBaseEcCategory[] }>(
      'categories/edit',
      { category_id: id, ...untransformCollection(data) },
    )
    const updated = res.categories?.find((c) => String(c.category_id) === id) ?? res.categories?.[0]
    if (!updated) throw new Error('BASE: categories/edit returned no category')
    return transformCollection(updated)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).post('categories/delete', { category_id: id })
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.client(credentials).get<{ orders: RawBaseEcOrder[] }>(
      'orders/',
      this.pageParams(params),
    )
    return (res.orders ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<{ order: RawBaseEcOrder }>(
      `orders/detail/${id}`,
    )
    return transformOrder(res.order)
  }

  /**
   * BASE has no order-level cancel — `POST /1/orders/edit_status` transitions
   * one `order_item_id` at a time (https://docs.thebase.in/api/orders/edit_status),
   * and only from `ordered` to `dispatched` or `cancelled`. This fans out over
   * every line item still in `ordered` status and returns the refreshed order.
   */
  async cancelOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.client(credentials)
    const current = await this.getOrder(credentials, id)
    const pending = (current.lineItems ?? []).filter(
      (li) => (li.metadata as { status?: string } | undefined)?.status === 'ordered',
    )
    for (const li of pending) {
      await client.post('orders/edit_status', { order_item_id: li.id, status: 'cancelled' })
    }
    return this.getOrder(credentials, id)
  }
}
