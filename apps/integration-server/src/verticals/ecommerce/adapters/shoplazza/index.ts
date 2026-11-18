/**
 * Shoplazza adapter for the ecommerce vertical.
 *
 * Maps the Shoplazza Admin REST API (v2025-06) to the canonical ecommerce
 * resources. Auth: OAuth2 with expiring access tokens + refresh tokens.
 *
 * Base URL: https://{shop}.myshoplaza.com/openapi/2025-06/
 * Auth header: Access-Token: {access_token}
 *
 * Supported resources: products, variants, collections, customers, orders,
 * fulfillments, refunds, transactions, discounts (price_rules), locations,
 * inventory_levels.
 *
 * Docs: https://www.shoplazza.dev/reference/api-usage
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as shoplazzaExchangeCode,
  refreshToken as shoplazzaRefreshToken,
} from './auth'
import { ShoplazzaClient, type ListPage } from './client'
import {
  COLLECTIONS_MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SCOPES,
  MAX_PAGE_SIZE,
} from './constants'
import { verifyShoplazzaWebhook, parseShoplazzaWebhookEvents } from './webhook'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawShoplazzaProduct,
  type RawShoplazzaVariant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawShoplazzaCollection,
} from './transform/collection'
import { transformLocation, type RawShoplazzaLocation } from './transform/location'
import {
  transformInventoryLevel,
  type RawShoplazzaInventoryLevel,
} from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawShoplazzaCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawShoplazzaOrder,
} from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShoplazzaFulfillment,
} from './transform/fulfillment'
import {
  transformRefund,
  untransformRefund,
  type RawShoplazzaRefund,
} from './transform/refund'
import {
  transformTransaction,
  untransformTransaction,
  type RawShoplazzaTransaction,
} from './transform/transaction'
import {
  transformDiscount,
  untransformDiscount,
  type RawShoplazzaPriceRule,
  type RawShoplazzaDiscountCode,
} from './transform/discount'

export interface ShoplazzaAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /**
   * Store subdomain, e.g. `mystore` (without `.myshoplaza.com` suffix), or
   * the full host `mystore.myshoplaza.com`.
   */
  shop: string
  scopes?: string[]
}

export class ShoplazzaAdapter implements EcommerceAdapter {
  readonly platform = 'shoplazza'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private shop: string
  private scopes: string[]

  constructor(config: ShoplazzaAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.shop = config.shop
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(
      this.shop,
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return shoplazzaExchangeCode(
      this.shop,
      code,
      this.clientId,
      this.clientSecret,
      redirectUri || this.redirectUri,
    )
  }

  /**
   * Shoplazza access tokens expire. Refresh using the refresh_token before
   * the access token expires (`credentials.expiresAt`).
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const rt = credentials.refreshToken
    if (!rt) return credentials
    return shoplazzaRefreshToken(
      this.shop,
      this.clientId,
      this.clientSecret,
      rt,
      this.redirectUri,
    )
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyShoplazzaWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const topic =
      (payload['__topic'] as string | undefined) ??
      (payload['topic'] as string | undefined)
    return parseShoplazzaWebhookEvents(payload, topic)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): ShoplazzaClient {
    return new ShoplazzaClient(credentials, this.shop)
  }

  /**
   * Build the common pagination/filter query params for list endpoints.
   * Shoplazza cursor is passed directly as `cursor` (not `page_info`).
   */
  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    const cursor = params['cursor']
    if (cursor) {
      out.cursor = cursor
    } else if (params.updatedAfter) {
      out.updated_at_min = params.updatedAfter.toISOString()
    }
    return out
  }

  /** The page size actually sent: the caller's limit, clamped to the endpoint's `max`. */
  private pageSize(params: QueryParams, max: number): number {
    return Math.min(params.limit ?? DEFAULT_PAGE_SIZE, max)
  }

  /** `pageSize` for the report, only when the limit was clamped below the caller's. */
  private clampReport(params: QueryParams, size: number): { pageSize?: number } {
    return params.limit !== undefined && size < params.limit ? { pageSize: size } : {}
  }

  /** The `updatedAfter` filter the adapter has always sent. */
  private updatedFilter(params: QueryParams): Record<string, unknown> {
    return params.updatedAfter ? { updated_at_min: params.updatedAfter.toISOString() } : {}
  }

  /** Per-connection pager key for `collection` under `filters` and upstream page `size`. */
  private pagerKey(
    credentials: Credentials,
    collection: string,
    filters: Record<string, unknown>,
    size: number,
  ): string {
    return cursorPagerKey(connectionScope(`shoplazza:${this.shop}`, credentials), collection, {
      ...filters,
      limit: size,
    })
  }

  /** Report what one page-number response said about the page it served. */
  private reportPage<T>(params: QueryParams, size: number, res: ListPage<T>): void {
    reportUpstreamPage(params, {
      ...(res.hasMore !== undefined ? { hasMore: res.hasMore } : {}),
      ...(res.total !== undefined ? { totalCount: res.total } : {}),
      ...this.clampReport(params, size),
    })
  }

  /**
   * One caller page of a page-number endpoint (collections, locations,
   * inventory_levels, customers, price_rules): "Page number (1-based).
   * Mutually exclusive with cursor", sized by `page_size`. Reports
   * `data.has_more` and, where sent, `data.total`.
   */
  private async listByPage<T>(
    credentials: Credentials,
    path: string,
    resourceKey: string,
    params: QueryParams,
    max: number,
    filters: Record<string, unknown>,
  ): Promise<T[]> {
    const size = this.pageSize(params, max)
    const res = await this.client(credentials).listOnePage<T>(path, resourceKey, {
      ...filters,
      page: params.page ?? 1,
      page_size: size,
    })
    this.reportPage(params, size, res)
    return res.items
  }

  /**
   * Fetches one upstream page of a cursor endpoint (products, orders). The
   * filter is sent on every page, alongside the cursor: the 2025-06 reference
   * lists `cursor` and `updated_at_min` as independent query params and does
   * not say the cursor carries the filter, so resending it is the only form
   * that is right either way.
   */
  private cursorFetcher<T>(
    client: ShoplazzaClient,
    path: string,
    resourceKey: string,
    sizeParam: 'per_page' | 'page_size',
    size: number,
    filters: Record<string, unknown>,
  ): (cursor: string | undefined) => Promise<{ items: T[]; next?: string }> {
    return async (cursor) => {
      const res = await client.listOnePage<T>(path, resourceKey, {
        ...filters,
        ...(cursor ? { cursor } : {}),
        [sizeParam]: size,
      })
      return { items: res.items, next: res.nextCursor }
    }
  }

  /** One caller page of a cursor endpoint, where one upstream page is one caller page. */
  private async listByCursor<T>(
    credentials: Credentials,
    path: string,
    resourceKey: string,
    params: QueryParams,
    sizeParam: 'per_page' | 'page_size',
  ): Promise<T[]> {
    const size = this.pageSize(params, MAX_PAGE_SIZE)
    const filters = this.updatedFilter(params)
    const { items, hasMore } = await pageByCursor<T>(
      this.pagerKey(credentials, path, filters, size),
      params.page,
      this.cursorFetcher<T>(this.client(credentials), path, resourceKey, sizeParam, size, filters),
    )
    reportUpstreamPage(params, { hasMore, ...this.clampReport(params, size) })
    return items
  }

  // ── Products ──────────────────────────────────────────────────────────────

  /**
   * GET products is cursor-only: "Page cursor for cursor-based pagination",
   * `per_page` "Limit per page, maximum 250", `data.has_more` "Whether more
   * records follow this page (cursor pagination)."
   * (https://www.shoplazza.dev/api/202506/products)
   */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const items = await this.listByCursor<RawShoplazzaProduct>(
      credentials,
      'products',
      'products',
      params,
      'per_page',
    )
    return items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<{ product: RawShoplazzaProduct }>(
      `products/${id}`,
    )
    return transformProduct(res.product)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).post<{ product: RawShoplazzaProduct }>(
      'products',
      { product: untransformProduct(data) },
    )
    return transformProduct(res.product)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.client(credentials).put<{ product: RawShoplazzaProduct }>(
      `products/${id}`,
      { product: { id, ...untransformProduct(data) } },
    )
    return transformProduct(res.product)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`products/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    // Shoplazza exposes variants scoped to a product id.
    const productId = params['productId'] ?? params['product_id']
    const client = this.client(credentials)
    if (productId) {
      // GET products/{product_id}/variants documents only its path param
      // (https://www.shoplazza.dev/api/202506/variants) and returns the
      // product's whole variant list, so the caller's page is cut locally.
      const res = await client.listOnePage<RawShoplazzaVariant>(
        `products/${String(productId)}/variants`,
        'variants',
        {},
      )
      return pageLocally(
        res.items.map((v) => transformVariant(v)),
        params,
      )
    }
    // Fallback: flatten variants out of pages of products. A product holds
    // 0..n variants, so a products page is not a caller page: cut the
    // flattened rows by position over the products cursor. Products are
    // fetched at the documented maximum ("Limit per page, maximum 250"): the
    // caller's limit counts variants, not products, so it does not size the
    // upstream page, and walks at different caller limits share one key.
    const size = MAX_PAGE_SIZE
    const filters = this.updatedFilter(params)
    const fetchProducts = this.cursorFetcher<RawShoplazzaProduct>(
      client,
      'products',
      'products',
      'per_page',
      size,
      filters,
    )
    const { items } = await pageByRows<ProductVariant>(
      this.pagerKey(credentials, 'variants', filters, size),
      params,
      async (cursor) => {
        const page = await fetchProducts(cursor)
        return {
          items: page.items.flatMap((p) =>
            (p.variants ?? []).map((v) => transformVariant(v, 'USD', p.options)),
          ),
          next: page.next,
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Shoplazza variant detail requires product_id:variant_id composite format.
    // Accept either "productId:variantId" or plain variantId.
    const parts = id.split(':')
    if (parts.length === 2) {
      const [productId, variantId] = parts
      const res = await this.client(credentials).get<{ variant: RawShoplazzaVariant }>(
        `products/${productId}/variants/${variantId}`,
      )
      return transformVariant(res.variant)
    }
    // Plain variant id — try global variants endpoint.
    const res = await this.client(credentials).get<{ variant: RawShoplazzaVariant }>(
      `variants/${id}`,
    )
    return transformVariant(res.variant)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const productId = data.productId
    if (productId) {
      const res = await this.client(credentials).put<{ variant: RawShoplazzaVariant }>(
        `products/${productId}/variants/${id}`,
        { variant: { id, ...untransformVariant(data) } },
      )
      return transformVariant(res.variant)
    }
    const res = await this.client(credentials).put<{ variant: RawShoplazzaVariant }>(
      `variants/${id}`,
      { variant: { id, ...untransformVariant(data) } },
    )
    return transformVariant(res.variant)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    // page + page_size "Range: 1-100" (https://www.shoplazza.dev/api/202506/collections)
    const items = await this.listByPage<RawShoplazzaCollection>(
      credentials,
      'collections',
      'collections',
      params,
      COLLECTIONS_MAX_PAGE_SIZE,
      this.updatedFilter(params),
    )
    return items.map((c) => transformCollection(c))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.client(credentials).get<{ collection: RawShoplazzaCollection }>(
      `collections/${id}`,
    )
    return transformCollection(res.collection)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).post<{ collection: RawShoplazzaCollection }>(
      'collections',
      { collection: untransformCollection(data) },
    )
    return transformCollection(res.collection)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).put<{ collection: RawShoplazzaCollection }>(
      `collections/${id}`,
      { collection: { id, ...untransformCollection(data) } },
    )
    return transformCollection(res.collection)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`collections/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    // page + page_size, no stated maximum (https://www.shoplazza.dev/api/202506/locations).
    // No filter was ever sent here, and none is added.
    const items = await this.listByPage<RawShoplazzaLocation>(
      credentials,
      'locations',
      'locations',
      params,
      MAX_PAGE_SIZE,
      {},
    )
    return items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<{ location: RawShoplazzaLocation }>(
      `locations/${id}`,
    )
    return transformLocation(res.location)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const extra: Record<string, unknown> = this.updatedFilter(params)
    const locationIds = params['location_ids'] ?? params['locationIds']
    const inventoryItemIds = params['inventory_item_ids'] ?? params['inventoryItemIds']
    if (locationIds) extra.location_ids = locationIds
    if (inventoryItemIds) extra.inventory_item_ids = inventoryItemIds

    // page + page_size, no stated maximum
    // (https://www.shoplazza.dev/api/202506/inventory-levels).
    const items = await this.listByPage<RawShoplazzaInventoryLevel>(
      credentials,
      'inventory_levels',
      'inventory_levels',
      params,
      MAX_PAGE_SIZE,
      extra,
    )
    return items.map(transformInventoryLevel)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const res = await this.client(credentials).post<{
      inventory_level: RawShoplazzaInventoryLevel
    }>('inventory_levels/adjust', {
      inventory_item_id: data.variantId,
      location_id: data.locationId,
      available_adjustment: data.delta,
    })
    return transformInventoryLevel(res.inventory_level)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const res = await this.client(credentials).post<{
      inventory_level: RawShoplazzaInventoryLevel
    }>('inventory_levels/set', {
      inventory_item_id: data.variantId,
      location_id: data.locationId,
      available: data.available,
    })
    return transformInventoryLevel(res.inventory_level)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    // page + page_size, "the maximum is 250"
    // (https://www.shoplazza.dev/api/202506/customers).
    const items = await this.listByPage<RawShoplazzaCustomer>(
      credentials,
      'customers',
      'customers',
      params,
      MAX_PAGE_SIZE,
      this.updatedFilter(params),
    )
    return items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ customer: RawShoplazzaCustomer }>(
      `customers/${id}`,
    )
    return transformCustomer(res.customer)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).post<{ customer: RawShoplazzaCustomer }>(
      'customers',
      { customer: untransformCustomer(data) },
    )
    return transformCustomer(res.customer)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).put<{ customer: RawShoplazzaCustomer }>(
      `customers/${id}`,
      { customer: { id, ...untransformCustomer(data) } },
    )
    return transformCustomer(res.customer)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`customers/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    // Cursor only: "Cursor for pagination", page_size "Range: 1-250"; the
    // 2025-06 orders page documents no `page` (https://www.shoplazza.dev/api/202506/orders).
    const items = await this.listByCursor<RawShoplazzaOrder>(
      credentials,
      'orders',
      'orders',
      params,
      'page_size',
    )
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<{ order: RawShoplazzaOrder }>(
      `orders/${id}`,
    )
    return transformOrder(res.order)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).post<{ order: RawShoplazzaOrder }>(
      'orders',
      { order: untransformOrder(data) },
    )
    return transformOrder(res.order)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const res = await this.client(credentials).put<{ order: RawShoplazzaOrder }>(
      `orders/${id}`,
      { order: { id, ...untransformOrder(data) } },
    )
    return transformOrder(res.order)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const res = await this.client(credentials).post<{ order: RawShoplazzaOrder }>(
      `orders/${id}/cancel`,
      { reason: data?.reason },
    )
    return transformOrder(res.order)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listFulfillments requires `order_id` in query params')
    }
    const res = await this.client(credentials).listWithCursor<RawShoplazzaFulfillment>(
      `orders/${String(orderId)}/fulfillments`,
      'fulfillments',
      this.listParams(params),
    )
    return res.items.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Accept composite id `orderId:fulfillmentId` or plain fulfillmentId.
    const parts = id.split(':')
    if (parts.length === 2) {
      const [orderId, fulfillmentId] = parts
      const res = await this.client(credentials).get<{
        fulfillment: RawShoplazzaFulfillment
      }>(`orders/${orderId}/fulfillments/${fulfillmentId}`)
      return transformFulfillment(res.fulfillment)
    }
    const res = await this.client(credentials).get<{
      fulfillment: RawShoplazzaFulfillment
    }>(`fulfillments/${id}`)
    return transformFulfillment(res.fulfillment)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const res = await this.client(credentials).post<{
      fulfillment: RawShoplazzaFulfillment
    }>(
      `orders/${data.orderId}/fulfillments`,
      { fulfillment: untransformFulfillment(data) },
    )
    return transformFulfillment(res.fulfillment)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const orderId = data.orderId
    const path = orderId
      ? `orders/${orderId}/fulfillments/${id}`
      : `fulfillments/${id}`
    const res = await this.client(credentials).put<{
      fulfillment: RawShoplazzaFulfillment
    }>(path, { fulfillment: untransformFulfillment(data) })
    return transformFulfillment(res.fulfillment)
  }

  async cancelFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Accept composite `orderId:fulfillmentId`.
    const parts = id.split(':')
    const path =
      parts.length === 2
        ? `orders/${parts[0]}/fulfillments/${parts[1]}/cancel`
        : `fulfillments/${id}/cancel`
    const res = await this.client(credentials).post<{
      fulfillment: RawShoplazzaFulfillment
    }>(path)
    return transformFulfillment(res.fulfillment)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listRefunds requires `order_id` in query params')
    }
    const res = await this.client(credentials).listWithCursor<RawShoplazzaRefund>(
      `orders/${String(orderId)}/refunds`,
      'refunds',
      this.listParams(params),
    )
    return res.items.map((r) => transformRefund(r))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // Composite id: `orderId:refundId`
    const [orderId, refundId] = id.split(':')
    if (!orderId || !refundId) {
      throw new Error('Invalid refund id format: expected `orderId:refundId`')
    }
    const res = await this.client(credentials).get<{ refund: RawShoplazzaRefund }>(
      `orders/${orderId}/refunds/${refundId}`,
    )
    return transformRefund(res.refund)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const res = await this.client(credentials).post<{ refund: RawShoplazzaRefund }>(
      `orders/${data.orderId}/refunds`,
      { refund: untransformRefund(data) },
    )
    return transformRefund(res.refund)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listTransactions requires `order_id` in query params')
    }
    const res = await this.client(credentials).listWithCursor<RawShoplazzaTransaction>(
      `orders/${String(orderId)}/transactions`,
      'transactions',
      this.listParams(params),
    )
    return res.items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // Composite id: `orderId:transactionId`
    const [orderId, txId] = id.split(':')
    if (!orderId || !txId) {
      throw new Error('Invalid transaction id format: expected `orderId:transactionId`')
    }
    const res = await this.client(credentials).get<{
      transaction: RawShoplazzaTransaction
    }>(`orders/${orderId}/transactions/${txId}`)
    return transformTransaction(res.transaction)
  }

  async createTransaction(
    credentials: Credentials,
    data: Partial<Transaction>,
  ): Promise<Transaction> {
    if (!data.orderId) throw new Error('createTransaction requires orderId')
    const res = await this.client(credentials).post<{
      transaction: RawShoplazzaTransaction
    }>(`orders/${data.orderId}/transactions`, {
      transaction: untransformTransaction(data),
    })
    return transformTransaction(res.transaction)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.client(credentials)
    // page + page_size, "Ranges from 1 to 250"
    // (https://www.shoplazza.dev/api/202506/price-rules).
    const rules = await this.listByPage<RawShoplazzaPriceRule>(
      credentials,
      'price_rules',
      'price_rules',
      params,
      MAX_PAGE_SIZE,
      this.updatedFilter(params),
    )
    // Fetch the first discount code for each rule in parallel — each
    // price_rule can have multiple codes; we surface the first one.
    const withCodes = await Promise.all(
      rules.map(async (rule) => {
        try {
          const cr = await client.listWithCursor<RawShoplazzaDiscountCode>(
            `price_rules/${rule.id}/discount_codes`,
            'discount_codes',
          )
          return transformDiscount(rule, cr.items[0])
        } catch {
          return transformDiscount(rule)
        }
      }),
    )
    return withCodes
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.client(credentials)
    const rule = await client.get<{ price_rule: RawShoplazzaPriceRule }>(
      `price_rules/${id}`,
    )
    let code: RawShoplazzaDiscountCode | undefined
    try {
      const cr = await client.listWithCursor<RawShoplazzaDiscountCode>(
        `price_rules/${id}/discount_codes`,
        'discount_codes',
      )
      code = cr.items[0]
    } catch {
      /* no code */
    }
    return transformDiscount(rule.price_rule, code)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.client(credentials)
    const rule = await client.post<{ price_rule: RawShoplazzaPriceRule }>('price_rules', {
      price_rule: untransformDiscount(data),
    })
    let code: RawShoplazzaDiscountCode | undefined
    if (data.code) {
      const cr = await client.post<{ discount_code: RawShoplazzaDiscountCode }>(
        `price_rules/${rule.price_rule.id}/discount_codes`,
        { discount_code: { code: data.code } },
      )
      code = cr.discount_code
    }
    return transformDiscount(rule.price_rule, code)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.client(credentials).put<{ price_rule: RawShoplazzaPriceRule }>(
      `price_rules/${id}`,
      { price_rule: { id, ...untransformDiscount(data) } },
    )
    return transformDiscount(res.price_rule)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`price_rules/${id}`)
  }
}
