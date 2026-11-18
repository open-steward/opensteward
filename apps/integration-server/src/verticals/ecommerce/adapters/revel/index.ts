/**
 * Revel Systems adapter for the ecommerce vertical.
 *
 * Maps the Revel REST API to canonical ecommerce resources. Revel is an
 * iPad-native POS platform (50k+ retailers). Resource URLs are under
 * `https://{subdomain}.revelup.com/resources/`, except categories
 * (`/products/ProductCategory/`) and establishments (`/enterprise/Establishment/`),
 * which the 2025.3.0 suites document at the host root. Auth uses API key
 * (API-AUTHENTICATION header) or OAuth2.
 *
 * Implemented resources (~20/42 methods):
 *   Products, Collections, Locations, Inventory, Customers,
 *   Orders, Transactions, Refunds, Discounts.
 *
 * Omitted resources (→ 501): Variants (no parent-child variant model),
 * Fulfillments (POS — no shipping concept), createTransaction (POS charges).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: fulfillment — Revel is an iPad-native POS platform; orders are
 *   completed in-store and there is no Fulfillment/Shipment resource in the API.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import { exchangeCode as revelExchangeCode, refreshAccessToken } from './auth'
import { RevelClient } from './client'
import {
  CATEGORY_PATH,
  DEFAULT_PAGE_SIZE,
  ESTABLISHMENT_LIMIT,
  ESTABLISHMENT_PATH,
  MAX_PAGE_SIZE,
} from './constants'
import { verifyRevelWebhook, parseRevelWebhookEvents } from './webhook'

import { transformProduct, untransformProduct, type RawRevelProduct } from './transform/product'
import { transformCollection, untransformCollection, type RawRevelCategory } from './transform/collection'
import { transformLocation, type RawRevelEstablishment } from './transform/location'
import { transformInventoryLevel, type RawRevelInventory } from './transform/inventory'
import { transformCustomer, untransformCustomer, type RawRevelCustomer } from './transform/customer'
import { transformOrder, untransformOrder, type RawRevelOrder } from './transform/order'
import { transformRefund, untransformRefund, type RawRevelRefund } from './transform/refund'
import { transformTransaction, type RawRevelPayment } from './transform/transaction'
import { transformDiscount, untransformDiscount, type RawRevelDiscount } from './transform/discount'

export interface RevelAdapterConfig {
  /** Unused; reserved for future configuration. */
  [key: string]: unknown
}

export class RevelAdapter implements EcommerceAdapter {
  readonly platform = 'revel'
  readonly version = '0.1.0'
  /**
   * The adapter's own `limit` clamp (500, the router's largest page), not a
   * Revel-documented maximum: Product/, Customer/, Order/ and Discount/ say
   * only "Limit for results count". Other /resources/ lists (Address/, Till/,
   * …) say "This amount must be lower than 100 to avoid high server load.";
   * 99 is not used here because the router's default limit is 100, and a
   * clamp below it makes every default page short. `RevelClient.list` throws
   * if Revel cuts the limit, so a lower real ceiling fails loudly. Declared so
   * the sync worker's short-page test agrees with the size actually sent.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    throw new Error(
      'Revel adapter v1 does not support interactive OAuth. ' +
        'Use POST /v1/connections with pre-generated API keys and ' +
        'extra: { subdomain, apiKey, apiSecret }.',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return revelExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshAccessToken(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyRevelWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseRevelWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): RevelClient {
    return new RevelClient(credentials)
  }

  /**
   * The caller's page size: a whole number of at least 1, clamped to
   * MAX_PAGE_SIZE; the default when the caller names none (or none that reads).
   */
  private pageSize(params: QueryParams): number {
    const asked = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    return Number.isFinite(asked) && asked >= 1
      ? Math.min(Math.floor(asked), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE
  }

  /**
   * One caller page of a Revel list: rows [(page − 1) × size, page × size) by
   * 0-based row `offset` ("Offset for returned results") + `limit`, the same
   * Tastypie paging on every list. `orderBy` is one of the path's documented
   * `order_by` values, so consecutive offsets walk one stable order; a path
   * that documents none is sent none. `perRequest` is the path's documented
   * per-request ceiling, if it has one: the page is then read in requests of at
   * most that many rows, so it still holds `size` rows.
   *
   * Where the page ends is Revel's word when it gives one: the `{ meta, objects }`
   * envelope's `meta.next` (of the LAST request made) is reported as
   * `hasMore`, and a cut `limit` already threw in `RevelClient.list`. A bare
   * JSON array — how the suites document the /products/ and /enterprise/
   * lists — says nothing, and a silently cut `limit` would look just like the
   * end. So a short bare answer is not trusted: the next row is asked for, and
   * only an empty answer ends the collection (reported as `hasMore: false`).
   * One empty request at the end of a collection, never a lost row.
   */
  private async listRows<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    opts: { orderBy?: string; perRequest?: number; extra?: Record<string, unknown> } = {},
  ): Promise<T[]> {
    const size = this.pageSize(params)
    const start = pageOffset(params, size)
    const step = Math.min(size, opts.perRequest ?? size)
    const query = { ...(opts.orderBy ? { order_by: opts.orderBy } : {}), ...opts.extra }
    const client = this.client(credentials)
    const rows: T[] = []
    let hasMore: boolean | undefined
    while (rows.length < size) {
      const ask = Math.min(step, size - rows.length)
      const res = await client.list<T>(path, start + rows.length, ask, query)
      rows.push(...res.items)
      if (res.hasMore !== undefined) {
        // A short answer that says more is topped up from where it ended; an
        // empty one stops the page whatever it says, so nothing loops.
        hasMore = res.hasMore
        if (!res.hasMore || res.items.length === 0) break
      } else if (res.items.length === 0) {
        hasMore = false
        break
      }
    }
    if (hasMore !== undefined) reportUpstreamPage(params, { hasMore })
    return rows
  }

  /**
   * A list documented in the 2025.3.0 suites with `order_by=id` among its
   * values: an auto-incremented primary key, so offsets walk one stable order,
   * and a row created mid-walk lands after it instead of shifting every later
   * row down one offset (as a descending `-id` would).
   */
  private listDocumented<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    opts: { perRequest?: number } = {},
  ): Promise<T[]> {
    return this.listRows<T>(credentials, path, params, { orderBy: 'id', ...opts })
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const items = await this.listDocumented<RawRevelProduct>(credentials, 'Product/', params)
    return items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.client(credentials)
    const raw = await client.get<RawRevelProduct>(`Product/${id}/`)
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.client(credentials)
    const body = untransformProduct(data)
    const raw = await client.post<RawRevelProduct>('Product/', body)
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.client(credentials)
    const body = untransformProduct(data)
    const raw = await client.patch<RawRevelProduct>(`Product/${id}/`, body)
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`Product/${id}/`)
  }

  // ── Variants — omitted (501) ─────────────────────────────────────────────
  // Revel has no parent-child variant model.

  // ── Collections ───────────────────────────────────────────────────────────

  /**
   * GET /products/ProductCategory/ (products_suite.yaml) — the documented list;
   * /resources/ProductCategory/ is in no 2025.3.0 suite. `order_by` enum:
   * sorting, id, -sorting, -id. The single-record calls use the same resource
   * (GET and PATCH on /products/ProductCategory/{ProductCategoryId}/, POST on
   * the list path), so a listed id resolves. No DELETE is documented there;
   * deleteCollection sends it to that resource all the same.
   */
  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const url = this.client(credentials).rootUrl(CATEGORY_PATH)
    const items = await this.listDocumented<RawRevelCategory>(credentials, url, params)
    return items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.client(credentials)
    const raw = await client.get<RawRevelCategory>(client.rootUrl(`${CATEGORY_PATH}${id}/`))
    return transformCollection(raw)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const client = this.client(credentials)
    const body = untransformCollection(data)
    const raw = await client.post<RawRevelCategory>(client.rootUrl(CATEGORY_PATH), body)
    return transformCollection(raw)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.client(credentials)
    const body = untransformCollection(data)
    const raw = await client.patch<RawRevelCategory>(
      client.rootUrl(`${CATEGORY_PATH}${id}/`),
      body,
    )
    return transformCollection(raw)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    const client = this.client(credentials)
    await client.delete(client.rootUrl(`${CATEGORY_PATH}${id}/`))
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  /**
   * GET /enterprise/Establishment/ (general_suite.yaml) — the documented list;
   * /resources/Establishment/ is in no 2025.3.0 suite. `order_by` enum: id,
   * -id. Its `limit` "must be lower than 100 to avoid high server load", so a
   * larger caller page is read 99 rows per request. getLocation reads the same
   * resource, /enterprise/Establishment/{EstablishmentId}/.
   */
  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const url = this.client(credentials).rootUrl(ESTABLISHMENT_PATH)
    const items = await this.listDocumented<RawRevelEstablishment>(credentials, url, params, {
      perRequest: ESTABLISHMENT_LIMIT,
    })
    return items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const client = this.client(credentials)
    const raw = await client.get<RawRevelEstablishment>(
      client.rootUrl(`${ESTABLISHMENT_PATH}${id}/`),
    )
    return transformLocation(raw)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  /**
   * /resources/InventoryProduct/ is in no 2025.3.0 suite, and none documents a
   * list of product stock by establishment to replace it. It is paged like
   * every other /resources/ list (row `offset` + `limit`) with no `order_by`,
   * whose values it does not document; a dead path still throws.
   */
  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const items = await this.listRows<RawRevelInventory>(credentials, 'InventoryProduct/', params)
    return items.map(transformInventoryLevel)
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    const client = this.client(credentials)
    const raw = await client.get<RawRevelInventory>(`InventoryProduct/${id}/`)
    return transformInventoryLevel(raw)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.client(credentials)
    // Find existing inventory record and update quantity
    const res = await client.list<RawRevelInventory>(
      'InventoryProduct/',
      0,
      1,
      { product: data.variantId, establishment: data.locationId },
    )
    if (res.items.length > 0 && res.items[0]!.id) {
      const raw = await client.patch<RawRevelInventory>(
        `InventoryProduct/${res.items[0]!.id}/`,
        { quantity: data.available },
      )
      return transformInventoryLevel(raw)
    }
    // Create a new inventory record
    const raw = await client.post<RawRevelInventory>('InventoryProduct/', {
      product: `/resources/Product/${data.variantId}/`,
      establishment: `/resources/Establishment/${data.locationId}/`,
      quantity: data.available,
    })
    return transformInventoryLevel(raw)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const client = this.client(credentials)
    const res = await client.list<RawRevelInventory>(
      'InventoryProduct/',
      0,
      1,
      { product: data.variantId, establishment: data.locationId },
    )
    const currentQty = res.items[0]?.quantity ?? 0
    const newQty = Math.max(0, currentQty + data.delta)
    return this.setInventoryLevel(credentials, {
      variantId: data.variantId,
      locationId: data.locationId,
      available: newQty,
    })
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const items = await this.listDocumented<RawRevelCustomer>(credentials, 'Customer/', params)
    return items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const client = this.client(credentials)
    const raw = await client.get<RawRevelCustomer>(`Customer/${id}/`)
    return transformCustomer(raw)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const client = this.client(credentials)
    const body = untransformCustomer(data)
    const raw = await client.post<RawRevelCustomer>('Customer/', body)
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.client(credentials)
    const body = untransformCustomer(data)
    const raw = await client.patch<RawRevelCustomer>(`Customer/${id}/`, body)
    return transformCustomer(raw)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`Customer/${id}/`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const items = await this.listDocumented<RawRevelOrder>(credentials, 'Order/', params)
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.client(credentials)
    const raw = await client.get<RawRevelOrder>(`Order/${id}/`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = this.client(credentials)
    const body = untransformOrder(data)
    const raw = await client.post<RawRevelOrder>('Order/', body)
    return transformOrder(raw)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const client = this.client(credentials)
    const body: Record<string, unknown> = {}
    if (data.note != null) body['notes'] = data.note
    const raw = await client.patch<RawRevelOrder>(`Order/${id}/`, body)
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const client = this.client(credentials)
    const raw = await client.patch<RawRevelOrder>(`Order/${id}/`, {
      voided: true,
    })
    return transformOrder(raw)
  }

  // ── Fulfillments — omitted (501) ─────────────────────────────────────────
  // Revel is POS — no shipping/fulfillment concept.

  // ── Refunds ───────────────────────────────────────────────────────────────

  /**
   * /resources/OrderRefund/ is in no 2025.3.0 suite, and none documents a
   * refund list. Paged like every other /resources/ list, with no `order_by`;
   * a dead path still throws.
   */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const extra: Record<string, unknown> = {}
    const orderId = (params['order_id'] ?? params['orderId']) as string | undefined
    if (orderId) extra['order'] = orderId
    const items = await this.listRows<RawRevelRefund>(credentials, 'OrderRefund/', params, {
      extra,
    })
    return items.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const client = this.client(credentials)
    const raw = await client.get<RawRevelRefund>(`OrderRefund/${id}/`)
    return transformRefund(raw)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const client = this.client(credentials)
    const body = untransformRefund(data)
    body['order'] = `/resources/Order/${data.orderId}/`
    const raw = await client.post<RawRevelRefund>('OrderRefund/', body)
    return transformRefund(raw)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  /**
   * GET /resources/Payment/ (orders_suite.yaml) — the documented payment list;
   * /resources/OrderPayment/ is in no 2025.3.0 suite. `order_by` enum: id,
   * created_date, -id, -created_date. getTransaction reads the same resource,
   * /resources/Payment/{PaymentId}/.
   */
  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const items = await this.listDocumented<RawRevelPayment>(credentials, 'Payment/', params)
    return items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = this.client(credentials)
    const raw = await client.get<RawRevelPayment>(`Payment/${id}/`)
    return transformTransaction(raw)
  }

  // createTransaction omitted — Revel processes payments at the POS (501)

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const items = await this.listDocumented<RawRevelDiscount>(credentials, 'Discount/', params)
    return items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.client(credentials)
    const raw = await client.get<RawRevelDiscount>(`Discount/${id}/`)
    return transformDiscount(raw)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const client = this.client(credentials)
    const body = untransformDiscount(data)
    const raw = await client.post<RawRevelDiscount>('Discount/', body)
    return transformDiscount(raw)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.client(credentials)
    const body = untransformDiscount(data)
    const raw = await client.patch<RawRevelDiscount>(`Discount/${id}/`, body)
    return transformDiscount(raw)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`Discount/${id}/`)
  }
}
