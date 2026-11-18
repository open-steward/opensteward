/**
 * Wix adapter for the ecommerce vertical.
 *
 * Maps the Wix eCommerce REST API to the canonical ecommerce resources.
 * Wix uses POST for most query operations and has ~5-minute access tokens
 * that must be refreshed aggressively.
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
  type Credentials,
  type QueryParams,
  type UpstreamPageMeta,
} from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Discount } from '../../schema/discount'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as wixExchangeCode, refreshAccessToken } from './auth'
import { WixClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, ORDERS_SEARCH_MAX } from './constants'
import { verifyWixWebhook, parseWixWebhookEvents } from './webhook'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  type RawWixProduct,
  type RawWixVariant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawWixCollection,
} from './transform/collection'
import { transformLocation, type RawWixLocation } from './transform/location'
import { transformInventoryItem, type RawWixInventoryItem } from './transform/inventory'
import { transformCustomer, untransformCustomer, type RawWixContact } from './transform/customer'
import { transformOrder, untransformOrder, type RawWixOrder } from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawWixFulfillment,
} from './transform/fulfillment'
import { transformDiscount, untransformDiscount, type RawWixCoupon } from './transform/discount'
import { transformRefund, untransformRefund, type RawWixRefund } from './transform/refund'
import { transformTransaction, type RawWixPayment } from './transform/transaction'

export interface WixAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export class WixAdapter implements EcommerceAdapter {
  readonly platform = 'wix'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string

  constructor(config: WixAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(this.clientId, this.redirectUri, state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return wixExchangeCode(code, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) {
      return credentials
    }
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWixWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const eventType =
      (payload['__eventType'] as string | undefined) ?? (payload['eventType'] as string | undefined)
    return parseWixWebhookEvents(payload, eventType)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): WixClient {
    return new WixClient(credentials)
  }

  /** The caller's page size: `params.limit` when it is a number ≥ 1, else the default. */
  private requestedLimit(params: QueryParams): number {
    const limit = params.limit
    return typeof limit === 'number' && Number.isFinite(limit) && limit >= 1
      ? Math.floor(limit)
      : DEFAULT_PAGE_SIZE
  }

  /**
   * One caller page of an offset-paged Wix query: `query.paging.limit` is the
   * caller's limit clamped to MAX_PAGE_SIZE, and `query.paging.offset` skips the
   * pages before it at that size. The end comes from the reported total
   * (`totalResults` on Stores V1, `pagingMetadata.total` on Contacts v4); when
   * Contacts says `tooManyToCount`, a full page is taken to mean there may be more.
   */
  private async offsetPage<T>(
    credentials: Credentials,
    path: string,
    resourceKey: string,
    params: QueryParams,
  ): Promise<T[]> {
    const requested = this.requestedLimit(params)
    const size = Math.min(requested, MAX_PAGE_SIZE)
    const offset = pageOffset(params, size)
    const res = await this.client(credentials).queryPost<T>(path, resourceKey, {
      limit: size,
      offset,
    })
    const meta: UpstreamPageMeta = {}
    if (res.tooManyToCount) {
      meta.hasMore = res.items.length >= size
    } else if (res.total !== undefined) {
      meta.totalCount = res.total
      meta.hasMore = offset + res.items.length < res.total
    }
    if (size < requested) meta.pageSize = size
    reportUpstreamPage(params, meta)
    return res.items
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const items = await this.offsetPage<RawWixProduct>(
      credentials,
      '/stores/v1/products/query',
      'products',
      params,
    )
    return items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<{ product: RawWixProduct }>(
      `/stores/v1/products/${id}`,
    )
    return transformProduct(res.product)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).post<{ product: RawWixProduct }>(
      '/stores/v1/products',
      { product: untransformProduct(data) },
    )
    return transformProduct(res.product)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.client(credentials).patch<{ product: RawWixProduct }>(
      `/stores/v1/products/${id}`,
      { product: { id, ...untransformProduct(data) } },
    )
    return transformProduct(res.product)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/stores/v1/products/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (!productId) {
      throw new Error('listVariants requires `productId` in query params')
    }
    const res = await this.client(credentials).post<{ variants: RawWixVariant[] }>(
      `/stores/v1/products/${productId}/variants/query`,
      { query: {} },
    )
    return (res.variants ?? []).map((v) => transformVariant(v, 'USD', productId))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Composite id format: `productId:variantId`
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    const res = await this.client(credentials).post<{ variants: RawWixVariant[] }>(
      `/stores/v1/products/${productId}/variants/query`,
      { query: {} },
    )
    const variant = (res.variants ?? []).find((v) => v.id === variantId)
    if (!variant) throw new Error(`Variant ${variantId} not found`)
    return transformVariant(variant, 'USD', productId)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const items = await this.offsetPage<RawWixCollection>(
      credentials,
      '/stores/v1/collections/query',
      'collections',
      params,
    )
    return items.map((c) => transformCollection(c))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.client(credentials).get<{ collection: RawWixCollection }>(
      `/stores/v1/collections/${id}`,
    )
    return transformCollection(res.collection)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const res = await this.client(credentials).post<{ collection: RawWixCollection }>(
      '/stores/v1/collections',
      { collection: untransformCollection(data) },
    )
    return transformCollection(res.collection)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).patch<{ collection: RawWixCollection }>(
      `/stores/v1/collections/${id}`,
      { collection: { id, ...untransformCollection(data) } },
    )
    return transformCollection(res.collection)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/stores/v1/collections/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  /**
   * Query Locations (business-management/locations/query-locations.md):
   * "URL: https://www.wixapis.com/locations/v1/locations/query", body
   * `query.paging` { "limit": "Number of items to load.", "offset": "Number of
   * items to skip in the current sort order." }, response `locations` and
   * `pagingMetadata.hasNext`: "Indicates if there are more results after the
   * current page." No maximum limit is documented; the adapter-wide
   * MAX_PAGE_SIZE applies.
   */
  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const requested = this.requestedLimit(params)
    const size = Math.min(requested, MAX_PAGE_SIZE)
    const offset = pageOffset(params, size)
    const res = await this.client(credentials).post<{
      locations?: RawWixLocation[]
      pagingMetadata?: { count?: number; offset?: number; hasNext?: boolean }
    }>('/locations/v1/locations/query', { query: { paging: { limit: size, offset } } })
    const items = res.locations ?? []
    const meta: UpstreamPageMeta = {}
    if (typeof res.pagingMetadata?.hasNext === 'boolean') {
      meta.hasMore = items.length > 0 && res.pagingMetadata.hasNext
    }
    if (size < requested) meta.pageSize = size
    reportUpstreamPage(params, meta)
    return items.map(transformLocation)
  }

  /** Get Location: "URL: https://www.wixapis.com/locations/v1/locations/{id}", response `location`. */
  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<{ location: RawWixLocation }>(
      `/locations/v1/locations/${encodeURIComponent(id)}`,
    )
    return transformLocation(res.location)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    // One inventory item flattens into one level per variant, so one upstream
    // page is not one caller page: walk upstream pages of MAX_PAGE_SIZE items
    // by offset and cut the caller's rows out of them.
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope(this.platform, credentials), 'inventoryItems', {
      limit: MAX_PAGE_SIZE,
    })
    const page = await pageByRows<InventoryLevel, number>(
      key,
      params,
      async (cursor) => {
        const offset = cursor ?? 0
        const res = await client.queryPost<RawWixInventoryItem>(
          '/stores/v2/inventoryItems/query',
          'inventoryItems',
          { limit: MAX_PAGE_SIZE, offset },
        )
        const end = offset + res.items.length
        const more =
          res.items.length > 0 &&
          (res.total !== undefined ? end < res.total : res.items.length >= MAX_PAGE_SIZE)
        return {
          items: res.items.flatMap((item) => transformInventoryItem(item)),
          next: more ? end : undefined,
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return page.items
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    const res = await this.client(credentials).get<{
      inventoryItem: RawWixInventoryItem
    }>(`/stores/v2/inventoryItems/${id}`)
    const levels = transformInventoryItem(res.inventoryItem)
    if (levels.length === 0) throw new Error(`Inventory item ${id} not found`)
    return levels[0]!
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    if (data.delta > 0) {
      await this.client(credentials).post(
        `/stores/v2/inventoryItems/${data.variantId}/incrementInventory`,
        { incrementData: { productId: data.variantId, quantity: data.delta } },
      )
    } else if (data.delta < 0) {
      await this.client(credentials).post(
        `/stores/v2/inventoryItems/${data.variantId}/decrementInventory`,
        { decrementData: { productId: data.variantId, quantity: Math.abs(data.delta) } },
      )
    }
    // Return the updated level
    return this.getInventoryLevel(credentials, data.variantId)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const items = await this.offsetPage<RawWixContact>(
      credentials,
      '/contacts/v4/contacts/query',
      'contacts',
      params,
    )
    return items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ contact: RawWixContact }>(
      `/contacts/v4/contacts/${id}`,
    )
    return transformCustomer(res.contact)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const res = await this.client(credentials).post<{ contact: RawWixContact }>(
      '/contacts/v4/contacts',
      untransformCustomer(data),
    )
    return transformCustomer(res.contact)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).patch<{ contact: RawWixContact }>(
      `/contacts/v4/contacts/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(res.contact)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/v4/contacts/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  /**
   * Search Orders (e-commerce/orders/orders/search-orders.md):
   * "URL: https://www.wixapis.com/ecom/v1/orders/search", body
   * `search.cursorPaging` { limit: "minimum 0, maximum 100", cursor: "Pointer
   * to the next or previous page in the list of results." }, response `orders`
   * and `metadata` { cursors.next: "Cursor string pointing to the next page",
   * hasNext: "Whether there are more pages to retrieve following the current
   * page." }. There is no Query Orders: `/ecom/v1/orders/query` is not a
   * documented path.
   *
   * Search Orders "doesn't return orders with `status: "PENDING"` or
   * `status: "REJECTED"`" unless filtered for, and never INITIALIZED ones; the
   * adapter sends no filter, so it lists what the dashboard lists.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const requested = this.requestedLimit(params)
    const size = Math.min(requested, ORDERS_SEARCH_MAX)
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope(this.platform, credentials), 'orders', {
      limit: size,
    })
    const page = await pageByCursor<Order>(key, params.page, async (cursor) => {
      const { orders, next } = await this.searchOrders(client, size, cursor)
      return { items: orders.map(transformOrder), next }
    })
    reportUpstreamPage(params, {
      hasMore: page.hasMore,
      ...(size < requested ? { pageSize: size } : {}),
    })
    return page.items
  }

  /** One Search Orders page of `size` orders from `cursor`, and the next page's cursor. */
  private async searchOrders(
    client: WixClient,
    size: number,
    cursor: string | undefined,
  ): Promise<{ orders: RawWixOrder[]; next?: string }> {
    const cursorPaging: Record<string, unknown> = { limit: size }
    if (cursor) cursorPaging.cursor = cursor
    const res = await client.post<{
      orders?: RawWixOrder[]
      metadata?: { count?: number; cursors?: { next?: string; prev?: string }; hasNext?: boolean }
    }>('/ecom/v1/orders/search', { search: { cursorPaging } })
    const orders = res.orders ?? []
    let next: string | undefined
    if (res.metadata?.hasNext === true && orders.length > 0) {
      next = res.metadata.cursors?.next
      if (!next) {
        throw new Error('Wix Search Orders reported hasNext without a metadata.cursors.next cursor')
      }
    }
    return { orders, next }
  }

  /** Get Order: "URL: https://www.wixapis.com/ecom/v1/orders/{id}", response `order`. */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<{ order: RawWixOrder }>(
      `/ecom/v1/orders/${encodeURIComponent(id)}`,
    )
    return transformOrder(res.order)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).patch<{ order: RawWixOrder }>(
      `/ecom/v1/orders/${id}`,
      { order: { id, ...untransformOrder(data) } },
    )
    return transformOrder(res.order)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const res = await this.client(credentials).post<{ order: RawWixOrder }>(
      `/ecom/v1/orders/${id}/cancel`,
      { reason: data?.reason },
    )
    return transformOrder(res.order)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = (params['order_id'] ?? params['orderId']) as string | undefined
    if (!orderId) {
      throw new Error('listFulfillments requires `order_id` in query params')
    }
    // Wix fulfillments are nested on orders — fetch the order and extract them
    const res = await this.client(credentials).get<{ order: RawWixOrder }>(
      `/ecom/v1/orders/${orderId}`,
    )
    const fulfillments = (res.order.fulfillments ?? []) as unknown as RawWixFulfillment[]
    return fulfillments.map((f) => transformFulfillment(f, orderId))
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Composite id format: `orderId:fulfillmentId`
    const [orderId, fulfillmentId] = id.split(':')
    if (!orderId || !fulfillmentId) {
      throw new Error('Invalid fulfillment id format: expected `orderId:fulfillmentId`')
    }
    const res = await this.client(credentials).get<{ order: RawWixOrder }>(
      `/ecom/v1/orders/${orderId}`,
    )
    const fulfillments = (res.order.fulfillments ?? []) as unknown as RawWixFulfillment[]
    const fulfillment = fulfillments.find((f) => f.id === fulfillmentId)
    if (!fulfillment) throw new Error(`Fulfillment ${fulfillmentId} not found`)
    return transformFulfillment(fulfillment, orderId)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const res = await this.client(credentials).post<{ fulfillment: RawWixFulfillment }>(
      '/ecom/v1/fulfillments/create',
      { fulfillment: untransformFulfillment(data) },
    )
    return transformFulfillment(res.fulfillment, data.orderId)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  /**
   * Query Coupons (coupons/coupons/query-coupons.md): "URL:
   * https://www.wixapis.com/stores/v2/coupons/query", "A maximum of 100 coupons
   * will be returned per request.", body `query.paging` { limit: "maximum
   * 100", offset: "Offset since the beginning of the collection." }, response
   * `coupons` and `totalResults`. `/stores/v1/coupons` is not a documented path.
   */
  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const items = await this.offsetPage<RawWixCoupon>(
      credentials,
      '/stores/v2/coupons/query',
      'coupons',
      params,
    )
    return items.map(transformDiscount)
  }

  /** Get A Coupon: "URL: https://www.wixapis.com/stores/v2/coupons/{id}", response `coupon`. */
  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.client(credentials).get<{ coupon: RawWixCoupon }>(
      `/stores/v2/coupons/${encodeURIComponent(id)}`,
    )
    return transformDiscount(res.coupon)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const res = await this.client(credentials).post<{ coupon: RawWixCoupon }>(
      '/stores/v1/coupons',
      { coupon: untransformDiscount(data) },
    )
    return transformDiscount(res.coupon)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.client(credentials).patch<{ coupon: RawWixCoupon }>(
      `/stores/v1/coupons/${id}`,
      { coupon: { id, ...untransformDiscount(data) } },
    )
    return transformDiscount(res.coupon)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/stores/v1/coupons/${id}`)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  /**
   * One order's payments and refunds with the order's currency.
   *
   * List Transactions For Single Order
   * (e-commerce/orders/order-transactions/list-transactions-for-single-order.md):
   * "URL: https://www.wixapis.com/ecom/v1/payments/orders/{orderId}", response
   * `orderTransactions` { payments: "maxItems 100", refunds: "maxItems 300" }:
   * the whole record in one response. Its `Price` amounts carry no currency,
   * so the order's `currency` is read with Get Order
   * ("URL: https://www.wixapis.com/ecom/v1/orders/{id}").
   */
  private async orderTransactions(
    credentials: Credentials,
    orderId: string,
  ): Promise<{ payments: RawWixPayment[]; refunds: RawWixRefund[]; currency?: string }> {
    const client = this.client(credentials)
    const id = encodeURIComponent(orderId)
    const [tx, order] = await Promise.all([
      client.get<{
        orderTransactions?: {
          orderId?: string
          payments?: RawWixPayment[]
          refunds?: RawWixRefund[]
        }
      }>(`/ecom/v1/payments/orders/${id}`),
      client.get<{ order?: { currency?: string } }>(`/ecom/v1/orders/${id}`),
    ])
    return {
      payments: tx.orderTransactions?.payments ?? [],
      refunds: tx.orderTransactions?.refunds ?? [],
      currency: order.order?.currency || undefined,
    }
  }

  /** The order a list of payments or refunds is scoped to, when the caller names one. */
  private orderIdParam(params: QueryParams): string | undefined {
    const orderId = (params['order_id'] ?? params['orderId']) as string | undefined
    return orderId || undefined
  }

  /**
   * Every order's payments or refunds, flattened out of Search Orders pages.
   *
   * Each Search Orders page of ORDERS_SEARCH_MAX orders is followed by one
   * List Transactions For Multiple Orders
   * (e-commerce/orders/order-transactions/list-transactions-for-multiple-orders.md):
   * "URL: https://www.wixapis.com/ecom/v1/payments/list-by-ids", "Method:
   * POST", `orderIds` "validation: minItems 1, maxItems 100", response
   * `orderTransactions[]` { orderId, payments, refunds }. The order's own
   * `currency` prices each row. Rows keep the Search Orders order, so the
   * caller's page N is stable, and pageByRows cuts it out of the stream.
   */
  private async allOrdersTransactions<R>(
    credentials: Credentials,
    params: QueryParams,
    collection: 'payments' | 'refunds',
    rows: (
      tx: { payments?: RawWixPayment[]; refunds?: RawWixRefund[] },
      orderId: string,
      currency: string | undefined,
    ) => R[],
  ): Promise<R[]> {
    const client = this.client(credentials)
    const key = cursorPagerKey(
      connectionScope(this.platform, credentials),
      `orderTransactions.${collection}`,
      { limit: ORDERS_SEARCH_MAX },
    )
    const page = await pageByRows<R, string>(
      key,
      params,
      async (cursor) => {
        const { orders, next } = await this.searchOrders(client, ORDERS_SEARCH_MAX, cursor)
        if (orders.length === 0) return { items: [], next }
        const orderIds = orders.map((o) => {
          if (!o.id) throw new Error('Wix Search Orders returned an order with no id')
          return o.id
        })
        const res = await client.post<{
          orderTransactions?: Array<{
            orderId?: string
            payments?: RawWixPayment[]
            refunds?: RawWixRefund[]
          }>
        }>('/ecom/v1/payments/list-by-ids', { orderIds })
        const byOrder = new Map((res.orderTransactions ?? []).map((t) => [t.orderId, t] as const))
        const items = orders.flatMap((o) => {
          const tx = byOrder.get(o.id)
          return tx ? rows(tx, o.id!, o.currency || undefined) : []
        })
        return { items, next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return page.items
  }

  /** Split an `orderId:childId` id, the only form a payment or refund can be read back by. */
  private splitChildId(id: string, kind: string): [string, string] {
    const i = id.indexOf(':')
    if (i <= 0 || i === id.length - 1) {
      throw Object.assign(new Error(`Invalid Wix ${kind} id: expected \`orderId:${kind}Id\``), {
        statusCode: 400,
      })
    }
    return [id.slice(0, i), id.slice(i + 1)]
  }

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = this.orderIdParam(params)
    if (!orderId) {
      return this.allOrdersTransactions(credentials, params, 'refunds', (tx, id, currency) =>
        (tx.refunds ?? []).map((r) => transformRefund(r, id, currency)),
      )
    }
    const { refunds, currency } = await this.orderTransactions(credentials, orderId)
    return pageLocally(
      refunds.map((r) => transformRefund(r, orderId, currency)),
      params,
    )
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const [orderId, refundId] = this.splitChildId(id, 'refund')
    const { refunds, currency } = await this.orderTransactions(credentials, orderId)
    const refund = refunds.find((r) => r.id === refundId)
    if (!refund) throw new Error(`Wix refund ${refundId} not found on order ${orderId}`)
    return transformRefund(refund, orderId, currency)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('Wix createRefund requires orderId')
    const res = await this.client(credentials).post<{ refund: RawWixRefund }>(
      `/ecom/v1/orders/${data.orderId}/refunds`,
      { refund: untransformRefund(data) },
    )
    return transformRefund(res.refund, data.orderId, undefined)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const orderId = this.orderIdParam(params)
    if (!orderId) {
      return this.allOrdersTransactions(credentials, params, 'payments', (tx, id, currency) =>
        (tx.payments ?? []).map((p) => transformTransaction(p, id, currency)),
      )
    }
    const { payments, currency } = await this.orderTransactions(credentials, orderId)
    return pageLocally(
      payments.map((p) => transformTransaction(p, orderId, currency)),
      params,
    )
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const [orderId, paymentId] = this.splitChildId(id, 'payment')
    const { payments, currency } = await this.orderTransactions(credentials, orderId)
    const payment = payments.find((p) => p.id === paymentId)
    if (!payment) throw new Error(`Wix payment ${paymentId} not found on order ${orderId}`)
    return transformTransaction(payment, orderId, currency)
  }
}
