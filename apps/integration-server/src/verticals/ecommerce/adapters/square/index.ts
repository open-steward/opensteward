/**
 * Square adapter for the ecommerce vertical.
 *
 * Maps the Square Connect API to canonical ecommerce resources. Square's
 * Catalog API is polymorphic (ITEM, ITEM_VARIATION, CATEGORY, DISCOUNT),
 * inventory is event-sourced, and refunds are payment-scoped.
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { CursorPage, Credentials, QueryParams } from '@opensteward/shared'
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

import { exchangeCode as squareExchangeCode, refreshAccessToken } from './auth'
import { SquareClient } from './client'
import { DEFAULT_PAGE_SIZE, PAGE_MAX } from './constants'
import { verifySquareWebhook, parseSquareWebhookEvents } from './webhook'

import {
  transformProduct,
  untransformProduct,
  type RawSquareCatalogItem,
} from './transform/product'
import { transformVariant, untransformVariant, type RawSquareItemVariation } from './transform/variant'
import { transformCollection, untransformCollection, type RawSquareCategory } from './transform/collection'
import { transformLocation, untransformLocation, type RawSquareLocation } from './transform/location'
import { transformInventoryLevel, type RawSquareInventoryCount } from './transform/inventory'
import { transformCustomer, untransformCustomer, type RawSquareCustomer } from './transform/customer'
import { transformOrder, untransformOrder, type RawSquareOrder } from './transform/order'
import { transformFulfillment, untransformFulfillment, type RawSquareFulfillmentEntry } from './transform/fulfillment'
import { transformRefund, untransformRefund, type RawSquarePaymentRefund } from './transform/refund'
import { transformTransaction, type RawSquarePayment } from './transform/transaction'
import { transformDiscount, untransformDiscount, type RawSquareCatalogDiscount } from './transform/discount'

export interface SquareAdapterConfig {
  /** Webhook notification URL — required for webhook verification. */
  webhookUrl?: string
}

export class SquareAdapter implements EcommerceAdapter {
  readonly platform = 'square'
  readonly version = '0.1.0'

  private webhookUrl?: string

  constructor(config: SquareAdapterConfig = {}) {
    this.webhookUrl = config.webhookUrl
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    throw new Error(
      'Square adapter v1 does not support interactive OAuth. ' +
        'Use POST /v1/connections with pre-generated tokens.',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return squareExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshAccessToken(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    const notificationUrl =
      this.webhookUrl ?? headers['x-square-notification-url'] ?? ''
    if (!notificationUrl) {
      throw new Error(
        'Square webhook verification requires a notification URL. ' +
          'Set webhookUrl in adapter config or credentials.extra.webhookUrl.',
      )
    }
    return verifySquareWebhook(payload, headers, secret, notificationUrl)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSquareWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): SquareClient {
    return new SquareClient(credentials)
  }

  /**
   * The pager scope for this connection. Square has no account id in the
   * credentials we can rely on, so the environment (sandbox and production
   * are separate sellers) plus a merchant id when present, and
   * `connectionScope` adds the token fingerprint that makes it per connection.
   */
  private scope(credentials: Credentials): string {
    const env = String(credentials.extra?.['environment'] ?? 'production')
    const merchant = String(credentials.extra?.['merchantId'] ?? '')
    return connectionScope(`square:${env}:${merchant}`, credentials)
  }

  /** The caller's page size, or the default when none was named. */
  private limitOf(params: QueryParams): number {
    const n = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_PAGE_SIZE
  }

  /**
   * An explicit upstream `cursor` from the caller: a position, not a row
   * offset, so it bypasses the pagers and fetches that one upstream page.
   */
  private explicitCursor(params: QueryParams): string | undefined {
    const c = params['cursor']
    return typeof c === 'string' && c !== '' ? c : undefined
  }

  private async passThrough<T>(
    params: QueryParams,
    cursor: string,
    fetchPage: (cursor: string | undefined) => Promise<CursorPage<T, string>>,
  ): Promise<T[]> {
    const res = await fetchPage(cursor)
    reportUpstreamPage(params, { hasMore: res.next != null })
    return res.items
  }

  /**
   * A list whose upstream page is not the caller's page: SearchCatalogObjects
   * and ListCustomers document their limit as advisory ("may return more or
   * fewer results"), a variant list is flattened out of pages of items, and
   * an order's refunds are filtered out of pages of all refunds. The row
   * pager walks the cursor chain and cuts exactly the caller's rows.
   */
  private async rows<T>(
    credentials: Credentials,
    params: QueryParams,
    collection: string,
    keyParams: Record<string, unknown>,
    fetchPage: (cursor: string | undefined) => Promise<CursorPage<T, string>>,
    /** How to fetch a caller-held cursor, when that differs from the walk's page size. */
    passFetch: (cursor: string | undefined) => Promise<CursorPage<T, string>> = fetchPage,
  ): Promise<T[]> {
    const cursor = this.explicitCursor(params)
    if (cursor) return this.passThrough(params, cursor, passFetch)
    const key = cursorPagerKey(this.scope(credentials), collection, keyParams)
    const res = await pageByRows(key, params, fetchPage, { defaultLimit: DEFAULT_PAGE_SIZE })
    return res.items
  }

  /**
   * A list where one upstream page is one caller page: the endpoint takes
   * the caller's limit up to `max`, and page N is reached by walking the
   * cursor chain. When the ceiling is below the caller's limit the page is
   * `max` rows and says so (`pageSize`), so shortness is judged at that size.
   */
  private async cursorPages<T>(
    credentials: Credentials,
    params: QueryParams,
    collection: string,
    keyParams: Record<string, unknown>,
    size: number,
    fetchPage: (cursor: string | undefined) => Promise<CursorPage<T, string>>,
  ): Promise<T[]> {
    const cursor = this.explicitCursor(params)
    if (cursor) return this.passThrough(params, cursor, fetchPage)
    const key = cursorPagerKey(this.scope(credentials), collection, { ...keyParams, limit: size })
    const res = await pageByCursor(key, params.page, fetchPage)
    const asked = params.limit
    reportUpstreamPage(params, {
      hasMore: res.hasMore,
      ...(typeof asked === 'number' && size < asked ? { pageSize: size } : {}),
    })
    return res.items
  }

  /** SearchCatalogObjects for one object type, sized from the caller's limit. */
  private searchCatalog<R, T>(
    credentials: Credentials,
    params: QueryParams,
    collection: string,
    objectType: string,
    map: (raw: R[]) => T[],
  ): Promise<T[]> {
    const client = this.client(credentials)
    const size = Math.min(this.limitOf(params), PAGE_MAX.catalogSearch)
    const body = { object_types: [objectType] }
    return this.rows(credentials, params, collection, { ...body, limit: size }, async (cursor) => {
      const res = await client.searchWithCursor<R>('catalog/search', 'objects', body, size, cursor)
      return { items: map(res.items), next: res.nextCursor }
    })
  }

  private getLocationId(credentials: Credentials, params?: QueryParams): string | undefined {
    return (params?.['location_id'] ?? params?.['locationId'] ??
      credentials.extra?.['locationId'] ??
      credentials.extra?.['merchantId']) as string | undefined
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    return this.searchCatalog<RawSquareCatalogItem, Product>(
      credentials,
      params,
      'products',
      'ITEM',
      (items) => items.map((item) => transformProduct(item)),
    )
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.client(credentials)
    const res = await client.get<{ object: RawSquareCatalogItem }>(`catalog/object/${id}`)
    return transformProduct(res.object)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.client(credentials)
    const body = untransformProduct(data)
    const res = await client.post<{ catalog_object: RawSquareCatalogItem }>('catalog/object', {
      idempotency_key: `create-${Date.now()}`,
      object: body,
    })
    return transformProduct(res.catalog_object)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.client(credentials)
    // Read current version for upsert-with-versioning
    const current = await client.get<{ object: RawSquareCatalogItem }>(`catalog/object/${id}`)
    const body = untransformProduct(data, current.object.version)
    body['id'] = id
    const res = await client.post<{ catalog_object: RawSquareCatalogItem }>('catalog/object', {
      idempotency_key: `update-${id}-${Date.now()}`,
      object: body,
    })
    return transformProduct(res.catalog_object)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`catalog/object/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const client = this.client(credentials)
    const productId = params['productId'] ?? params['product_id']
    if (productId) {
      const res = await client.get<{ object: RawSquareCatalogItem }>(
        `catalog/object/${String(productId)}`,
      )
      // One item carries every one of its variations: page them locally.
      const all = (res.object.item_data?.variations ?? []).map((v) =>
        transformVariant(v, String(productId)),
      )
      return pageLocally(all, params)
    }
    // Fallback: search for all ITEMs and flatten variations. A page of items
    // is not a page of variations, so the row pager counts variations.
    return this.searchCatalog<RawSquareCatalogItem, ProductVariant>(
      credentials,
      params,
      'variants',
      'ITEM',
      (items) =>
        items.flatMap((item) =>
          (item.item_data?.variations ?? []).map((v) => transformVariant(v, item.id)),
        ),
    )
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const client = this.client(credentials)
    const res = await client.get<{ object: RawSquareItemVariation }>(`catalog/object/${id}`)
    return transformVariant(res.object)
  }

  async createVariant(credentials: Credentials, data: Partial<ProductVariant>): Promise<ProductVariant> {
    const client = this.client(credentials)
    const body = untransformVariant(data)
    const res = await client.post<{ catalog_object: RawSquareItemVariation }>('catalog/object', {
      idempotency_key: `create-var-${Date.now()}`,
      object: body,
    })
    return transformVariant(res.catalog_object)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const client = this.client(credentials)
    const current = await client.get<{ object: RawSquareItemVariation }>(`catalog/object/${id}`)
    const body = untransformVariant(data, current.object.version)
    body['id'] = id
    const res = await client.post<{ catalog_object: RawSquareItemVariation }>('catalog/object', {
      idempotency_key: `update-var-${id}-${Date.now()}`,
      object: body,
    })
    return transformVariant(res.catalog_object)
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`catalog/object/${id}`)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    return this.searchCatalog<RawSquareCategory, Collection>(
      credentials,
      params,
      'collections',
      'CATEGORY',
      (items) => items.map(transformCollection),
    )
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.client(credentials)
    const res = await client.get<{ object: RawSquareCategory }>(`catalog/object/${id}`)
    return transformCollection(res.object)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const client = this.client(credentials)
    const body = untransformCollection(data)
    const res = await client.post<{ catalog_object: RawSquareCategory }>('catalog/object', {
      idempotency_key: `create-cat-${Date.now()}`,
      object: body,
    })
    return transformCollection(res.catalog_object)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.client(credentials)
    const current = await client.get<{ object: RawSquareCategory }>(`catalog/object/${id}`)
    const body = untransformCollection(data, current.object.version)
    body['id'] = id
    const res = await client.post<{ catalog_object: RawSquareCategory }>('catalog/object', {
      idempotency_key: `update-cat-${id}-${Date.now()}`,
      object: body,
    })
    return transformCollection(res.catalog_object)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`catalog/object/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    // ListLocations takes no paging parameters and returns every location
    // ("Provides details about all of the seller's locations"): slice locally.
    const client = this.client(credentials)
    const res = await client.get<{ locations: RawSquareLocation[] }>('locations')
    return pageLocally((res.locations ?? []).map(transformLocation), params)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const client = this.client(credentials)
    const res = await client.get<{ location: RawSquareLocation }>(`locations/${id}`)
    return transformLocation(res.location)
  }

  // createLocation and updateLocation — Square supports these
  async createLocation(credentials: Credentials, data: Partial<Location>): Promise<Location> {
    const client = this.client(credentials)
    const res = await client.post<{ location: RawSquareLocation }>('locations', {
      location: untransformLocation(data),
    })
    return transformLocation(res.location)
  }

  async updateLocation(credentials: Credentials, id: string, data: Partial<Location>): Promise<Location> {
    const client = this.client(credentials)
    const res = await client.put<{ location: RawSquareLocation }>(`locations/${id}`, {
      location: untransformLocation(data),
    })
    return transformLocation(res.location)
  }

  // deleteLocation omitted — Square locations can be deactivated but not deleted (501)

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const client = this.client(credentials)
    const locationIds = params['location_ids'] ?? params['locationIds'] ?? this.getLocationId(credentials, params)
    const catalogObjectIds = params['catalog_object_ids'] ?? params['variantIds']

    const body: Record<string, unknown> = {}
    if (locationIds) body['location_ids'] = Array.isArray(locationIds) ? locationIds : [locationIds]
    if (catalogObjectIds) body['catalog_object_ids'] = Array.isArray(catalogObjectIds) ? catalogObjectIds : [catalogObjectIds]

    const size = Math.min(this.limitOf(params), PAGE_MAX.inventoryCounts)
    return this.cursorPages(credentials, params, 'inventory-levels', body, size, async (cursor) => {
      const res = await client.searchWithCursor<RawSquareInventoryCount>(
        'inventory/counts/batch-retrieve',
        'counts',
        body,
        size,
        cursor,
      )
      return { items: res.items.map(transformInventoryLevel), next: res.nextCursor }
    })
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // Composite id: {catalogObjectId}:{locationId}
    const [catalogObjectId, locationId] = id.split(':')
    if (!catalogObjectId || !locationId) {
      throw new Error('Invalid inventory level id format: expected `catalogObjectId:locationId`')
    }
    const client = this.client(credentials)
    const res = await client.post<{ counts: RawSquareInventoryCount[] }>(
      'inventory/counts/batch-retrieve',
      {
        catalog_object_ids: [catalogObjectId],
        location_ids: [locationId],
      },
    )
    const count = res.counts?.[0]
    if (!count) throw new Error(`Inventory level not found: ${id}`)
    return transformInventoryLevel(count)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const client = this.client(credentials)
    await client.post('inventory/changes/batch-create', {
      idempotency_key: `adj-${data.variantId}-${data.locationId}-${Date.now()}`,
      changes: [
        {
          type: 'ADJUSTMENT',
          adjustment: {
            catalog_object_id: data.variantId,
            location_id: data.locationId,
            quantity: String(data.delta),
            from_state: data.delta < 0 ? 'IN_STOCK' : 'NONE',
            to_state: data.delta < 0 ? 'NONE' : 'IN_STOCK',
            occurred_at: new Date().toISOString(),
          },
        },
      ],
    })
    // Read back the current count
    return this.getInventoryLevel(credentials, `${data.variantId}:${data.locationId}`)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.client(credentials)
    await client.post('inventory/changes/batch-create', {
      idempotency_key: `set-${data.variantId}-${data.locationId}-${Date.now()}`,
      changes: [
        {
          type: 'PHYSICAL_COUNT',
          physical_count: {
            catalog_object_id: data.variantId,
            location_id: data.locationId,
            quantity: String(data.available),
            state: 'IN_STOCK',
            occurred_at: new Date().toISOString(),
          },
        },
      ],
    })
    return this.getInventoryLevel(credentials, `${data.variantId}:${data.locationId}`)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    // ListCustomers' limit is advisory and 400s above 100: walk upstream pages
    // of 100 (its ceiling, so any caller page size shares one walk) and cut
    // the caller's rows out of them.
    const client = this.client(credentials)
    const at = (size: number) => async (cursor: string | undefined) => {
      const res = await client.listWithCursor<RawSquareCustomer>('customers', 'customers', {
        limit: size,
        cursor,
      })
      return { items: res.items.map(transformCustomer), next: res.nextCursor }
    }
    const max = PAGE_MAX.customers
    return this.rows(
      credentials,
      params,
      'customers',
      { limit: max },
      at(max),
      at(Math.min(this.limitOf(params), max)),
    )
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const client = this.client(credentials)
    const res = await client.get<{ customer: RawSquareCustomer }>(`customers/${id}`)
    return transformCustomer(res.customer)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const client = this.client(credentials)
    const res = await client.post<{ customer: RawSquareCustomer }>('customers', {
      ...untransformCustomer(data),
      idempotency_key: `create-cust-${Date.now()}`,
    })
    return transformCustomer(res.customer)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.client(credentials)
    const res = await client.put<{ customer: RawSquareCustomer }>(
      `customers/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(res.customer)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`customers/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.client(credentials)
    const locationId = this.getLocationId(credentials, params)
    // Every page repeats this query: "when retrieving additional pages using
    // a cursor, you must use the original query".
    const body: Record<string, unknown> = {}
    if (locationId) body['location_ids'] = [locationId]
    const size = Math.min(this.limitOf(params), PAGE_MAX.ordersSearch)
    return this.cursorPages(credentials, params, 'orders', body, size, async (cursor) => {
      const res = await client.searchWithCursor<RawSquareOrder>(
        'orders/search',
        'orders',
        body,
        size,
        cursor,
      )
      return { items: res.items.map(transformOrder), next: res.nextCursor }
    })
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.client(credentials)
    const res = await client.get<{ order: RawSquareOrder }>(`orders/${id}`)
    return transformOrder(res.order)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = this.client(credentials)
    const locationId = (data.metadata?.['location_id'] as string) ??
      this.getLocationId(credentials)
    if (!locationId) throw new Error('createOrder requires a location_id')
    const body = untransformOrder(data, locationId)
    const res = await client.post<{ order: RawSquareOrder }>('orders', {
      order: body,
      idempotency_key: `create-order-${Date.now()}`,
    })
    return transformOrder(res.order)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const client = this.client(credentials)
    // Read current version
    const current = await client.get<{ order: RawSquareOrder }>(`orders/${id}`)
    const res = await client.put<{ order: RawSquareOrder }>(`orders/${id}`, {
      order: {
        location_id: current.order.location_id,
        version: (current.order as Record<string, unknown>)['version'],
        reference_id: data.orderNumber,
        customer_id: data.customerId,
      },
    })
    return transformOrder(res.order)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const client = this.client(credentials)
    const current = await client.get<{ order: RawSquareOrder }>(`orders/${id}`)
    const res = await client.put<{ order: RawSquareOrder }>(`orders/${id}`, {
      order: {
        location_id: current.order.location_id,
        version: (current.order as Record<string, unknown>)['version'],
        state: 'CANCELED',
      },
    })
    return transformOrder(res.order)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) throw new Error('listFulfillments requires `order_id` in query params')
    const client = this.client(credentials)
    const res = await client.get<{ order: RawSquareOrder }>(`orders/${String(orderId)}`)
    return (res.order.fulfillments ?? []).map((f) =>
      transformFulfillment(f as unknown as RawSquareFulfillmentEntry, String(orderId)),
    )
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Composite id: {orderId}:{fulfillmentUid}
    const [orderId, uid] = id.split(':')
    if (!orderId || !uid) {
      throw new Error('Invalid fulfillment id format: expected `orderId:fulfillmentUid`')
    }
    const client = this.client(credentials)
    const res = await client.get<{ order: RawSquareOrder }>(`orders/${orderId}`)
    const entry = (res.order.fulfillments ?? []).find(
      (f) => f.uid === uid,
    ) as unknown as RawSquareFulfillmentEntry | undefined
    if (!entry) throw new Error(`Fulfillment not found: ${id}`)
    return transformFulfillment(entry, orderId)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const client = this.client(credentials)
    const current = await client.get<{ order: RawSquareOrder }>(`orders/${data.orderId}`)
    const newEntry = untransformFulfillment(data)
    const existingFulfillments = current.order.fulfillments ?? []
    const res = await client.put<{ order: RawSquareOrder }>(`orders/${data.orderId}`, {
      order: {
        location_id: current.order.location_id,
        version: (current.order as Record<string, unknown>)['version'],
        fulfillments: [...existingFulfillments, newEntry],
      },
    })
    const created = (res.order.fulfillments ?? []).slice(-1)[0]
    if (!created) throw new Error('Failed to create fulfillment')
    return transformFulfillment(
      created as unknown as RawSquareFulfillmentEntry,
      data.orderId,
    )
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const [orderId, uid] = id.split(':')
    if (!orderId || !uid) {
      throw new Error('Invalid fulfillment id format: expected `orderId:fulfillmentUid`')
    }
    const client = this.client(credentials)
    const current = await client.get<{ order: RawSquareOrder }>(`orders/${orderId}`)
    const fulfillments = (current.order.fulfillments ?? []).map((f) => {
      if (f.uid === uid) {
        return { ...f, ...untransformFulfillment(data), uid }
      }
      return f
    })
    const res = await client.put<{ order: RawSquareOrder }>(`orders/${orderId}`, {
      order: {
        location_id: current.order.location_id,
        version: (current.order as Record<string, unknown>)['version'],
        fulfillments,
      },
    })
    const updated = (res.order.fulfillments ?? []).find(
      (f) => f.uid === uid,
    ) as unknown as RawSquareFulfillmentEntry | undefined
    if (!updated) throw new Error(`Fulfillment not found after update: ${id}`)
    return transformFulfillment(updated, orderId)
  }

  async cancelFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const [orderId, uid] = id.split(':')
    if (!orderId || !uid) {
      throw new Error('Invalid fulfillment id format: expected `orderId:fulfillmentUid`')
    }
    const client = this.client(credentials)
    const current = await client.get<{ order: RawSquareOrder }>(`orders/${orderId}`)
    const fulfillments = (current.order.fulfillments ?? []).map((f) => {
      if (f.uid === uid) return { ...f, state: 'CANCELED' }
      return f
    })
    const res = await client.put<{ order: RawSquareOrder }>(`orders/${orderId}`, {
      order: {
        location_id: current.order.location_id,
        version: (current.order as Record<string, unknown>)['version'],
        fulfillments,
      },
    })
    const canceled = (res.order.fulfillments ?? []).find(
      (f) => f.uid === uid,
    ) as unknown as RawSquareFulfillmentEntry | undefined
    if (!canceled) throw new Error(`Fulfillment not found after cancel: ${id}`)
    return transformFulfillment(canceled, orderId)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const client = this.client(credentials)
    const orderId = params['order_id'] ?? params['orderId']
    if (orderId) {
      // Load order → extract payment ids from tenders → search refunds
      const orderRes = await client.get<{ order: RawSquareOrder }>(`orders/${String(orderId)}`)
      const paymentIds = (orderRes.order.tenders ?? [])
        .filter((t) => t.payment_id)
        .map((t) => t.payment_id!)
      if (paymentIds.length === 0) return pageLocally([], params)
      // ListPaymentRefunds has no payment or order filter: walk every page of
      // refunds at the ceiling, keep this order's, and let the row pager
      // count the survivors.
      const size = PAGE_MAX.refunds
      const wanted = new Set(paymentIds)
      return this.rows(
        credentials,
        params,
        'refunds',
        { order_id: String(orderId), payment_ids: [...wanted].sort().join(','), limit: size },
        async (cursor) => {
          const res = await client.listWithCursor<RawSquarePaymentRefund>('refunds', 'refunds', {
            limit: size,
            cursor,
          })
          return {
            items: res.items
              .filter((r) => r.payment_id && wanted.has(r.payment_id))
              .map(transformRefund),
            next: res.nextCursor,
          }
        },
      )
    }
    // ListPaymentRefunds may return "fewer results than the specified limit
    // on a given page" and caps at 100: walk upstream pages of 100 and cut
    // the caller's rows out of them.
    const at = (size: number) => async (cursor: string | undefined) => {
      const res = await client.listWithCursor<RawSquarePaymentRefund>('refunds', 'refunds', {
        limit: size,
        cursor,
      })
      return { items: res.items.map(transformRefund), next: res.nextCursor }
    }
    const max = PAGE_MAX.refunds
    return this.rows(
      credentials,
      params,
      'refunds',
      { limit: max },
      at(max),
      at(Math.min(this.limitOf(params), max)),
    )
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const client = this.client(credentials)
    const res = await client.get<{ refund: RawSquarePaymentRefund }>(`refunds/${id}`)
    return transformRefund(res.refund)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const client = this.client(credentials)
    const body = untransformRefund(data)
    const res = await client.post<{ refund: RawSquarePaymentRefund }>('refunds', {
      ...body,
      idempotency_key: `refund-${Date.now()}`,
    })
    return transformRefund(res.refund)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    // ListPayments: "The default value of 100 is also the maximum allowed
    // value." Above it the page is 100 rows, reported as `pageSize`.
    const client = this.client(credentials)
    const size = Math.min(this.limitOf(params), PAGE_MAX.payments)
    return this.cursorPages(credentials, params, 'payments', {}, size, async (cursor) => {
      const res = await client.listWithCursor<RawSquarePayment>('payments', 'payments', {
        limit: size,
        cursor,
      })
      return { items: res.items.map(transformTransaction), next: res.nextCursor }
    })
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = this.client(credentials)
    const res = await client.get<{ payment: RawSquarePayment }>(`payments/${id}`)
    return transformTransaction(res.payment)
  }

  // createTransaction omitted — Square Payments API creates payments by charging
  // a card; this is a POS operation, not a unified ecommerce operation. (501)

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    return this.searchCatalog<RawSquareCatalogDiscount, Discount>(
      credentials,
      params,
      'discounts',
      'DISCOUNT',
      (items) => items.map(transformDiscount),
    )
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.client(credentials)
    const res = await client.get<{ object: RawSquareCatalogDiscount }>(`catalog/object/${id}`)
    return transformDiscount(res.object)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const client = this.client(credentials)
    const body = untransformDiscount(data)
    const res = await client.post<{ catalog_object: RawSquareCatalogDiscount }>('catalog/object', {
      idempotency_key: `create-disc-${Date.now()}`,
      object: body,
    })
    return transformDiscount(res.catalog_object)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.client(credentials)
    const current = await client.get<{ object: RawSquareCatalogDiscount }>(`catalog/object/${id}`)
    const body = untransformDiscount(data, current.object.version)
    body['id'] = id
    const res = await client.post<{ catalog_object: RawSquareCatalogDiscount }>('catalog/object', {
      idempotency_key: `update-disc-${id}-${Date.now()}`,
      object: body,
    })
    return transformDiscount(res.catalog_object)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`catalog/object/${id}`)
  }
}
