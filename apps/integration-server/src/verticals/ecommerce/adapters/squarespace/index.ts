import { connectionScope, cursorPagerKey, pageByRows, simpleApiKey } from '@opensteward/shared'
/**
 * Squarespace adapter for the ecommerce vertical.
 *
 * Maps the Squarespace Commerce API to the canonical ecommerce resources.
 * Auth: API key (Bearer token). No OAuth flow — the user generates an API
 * key from their site settings.
 *
 * Supported surface: products and variants (GET /v2/commerce/products),
 * orders, inventory, transactions (under /1.0/commerce), profiles as
 * customers (GET /1.0/profiles), and fulfillments (derived from
 * order.fulfillments shipment entries).
 *
 * Docs: https://developers.squarespace.com/commerce-apis/overview
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: collection — Squarespace Commerce API has no collections/categories endpoint
 * Unavailable: discount   — discount data is embedded in orders only; no dedicated endpoint
 * Unavailable: location   — Squarespace Commerce API has no locations endpoint
 * Unavailable: refund     — refund data is embedded in transaction documents; no dedicated refund endpoint
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Transaction } from '../../schema/transaction'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, credentialsFromApiKey } from './auth'
import { SquarespaceClient } from './client'
import { COMMERCE_V1, PRODUCTS_V2, PROFILES } from './constants'
import { verifySquarespaceWebhook, parseSquarespaceWebhookEvents } from './webhook'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawSquarespaceProduct,
  type RawSquarespaceVariant,
} from './transform/product'
import { transformOrder, untransformOrder, type RawSquarespaceOrder } from './transform/order'
import {
  transformCustomer,
  untransformCustomer,
  type RawSquarespaceProfile,
} from './transform/customer'
import { transformInventoryLevel, type RawSquarespaceInventoryItem } from './transform/inventory'
import { transformFulfillment, type RawSquarespaceShipment } from './transform/fulfillment'
import { transformTransaction, type RawSquarespaceTransaction } from './transform/transaction'

export interface SquarespaceAdapterConfig {
  /** Squarespace API key (generated in Site Settings > Advanced > Developer API Keys). */
  apiKey: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()

export class SquarespaceAdapter implements EcommerceAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'squarespace'
  readonly version = '0.1.0'

  private apiKey: string

  constructor(config: SquarespaceAdapterConfig) {
    this.apiKey = config.apiKey
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // No OAuth — API key is supplied directly. We treat the "code" as the API key.
    return credentialsFromApiKey(this.apiKey)
  }

  /**
   * Squarespace API keys are long-lived and do not rotate. Return unchanged.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySquarespaceWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const topic =
      (payload['__topic'] as string | undefined) ?? (payload['topic'] as string | undefined)
    return parseSquarespaceWebhookEvents(payload, topic)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): SquarespaceClient {
    return new SquarespaceClient(credentials)
  }

  /**
   * The caller's page of a Squarespace cursor list whose rows are `map`ped
   * out of each upstream page.
   *
   * Orders, inventory, transactions, products and profiles document one
   * position parameter, `cursor` ("Identifies where the next page of results should begin.
   * Should be the value of pagination.nextPageCursor from a previous
   * response."), no page-size parameter, and a fixed page of "up to 50".
   * One upstream page is not one caller page, so pageByRows cuts the caller's
   * rows out of the stream. The first request carries `firstQuery` (the
   * filters); every later one carries ONLY the cursor, because on orders and
   * profiles a cursor "Cannot be used with other parameters", the products
   * list's documented `nextPageUrl` carries only `cursor`, and the cursor
   * already encodes the filters. The caller's limit does not size the upstream page,
   * so it stays out of the key; `filters` go in it.
   */
  private async cursorRows<R, T>(
    credentials: Credentials,
    params: QueryParams,
    collection: string,
    path: string,
    resourceKey: string,
    filters: Record<string, unknown>,
    firstQuery: () => Record<string, unknown>,
    map: (items: R[]) => T[],
  ): Promise<T[]> {
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope('squarespace', credentials), collection, filters)
    const { items } = await pageByRows<T>(key, params, async (cursor) => {
      const page = await client.cursorPage<R>(
        path,
        resourceKey,
        cursor === undefined ? firstQuery() : { cursor },
      )
      return { items: map(page.items), next: page.next }
    })
    return items
  }

  /**
   * First-page filters for GET /orders. modifiedAfter and modifiedBefore are
   * each "Required when [the other] is passed", so an updatedAfter window is
   * closed at now.
   */
  private orderFilters(params: QueryParams): Record<string, unknown> {
    if (!params.updatedAfter) return {}
    return {
      modifiedAfter: params.updatedAfter.toISOString(),
      modifiedBefore: new Date().toISOString(),
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────
  //
  // Products API v2 (https://developers.squarespace.com/commerce-apis/products):
  // "List products ... GET /v2/commerce/products ... The response contains
  // product information in a Product, up to 50 Products ordered by their
  // modification date (modifiedOn), and supports dynamic cursors for
  // pagination." Query parameters: modifiedAfter, modifiedBefore, cursor,
  // query, type. The response is PaginatedProductListResponseV2
  // `{ pagination, products }`.

  /**
   * First-page filters for GET /v2/commerce/products: an updatedAfter window
   * as modifiedAfter, closed at now with modifiedBefore (both documented
   * parameters; the orders list documents each as "Required when [the other]
   * is passed", and sending both is valid either way).
   */
  private productFilters(params: QueryParams): Record<string, unknown> {
    return this.orderFilters(params)
  }

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    return this.cursorRows<RawSquarespaceProduct, Product>(
      credentials,
      params,
      'products',
      PRODUCTS_V2,
      'products',
      { updatedAfter: params.updatedAfter },
      () => this.productFilters(params),
      (items) => items.map(transformProduct),
    )
  }

  /**
   * GET /v2/commerce/products/{productIdCsvs}: "Retrieves information for
   * specific products, including information for any variants or images."
   * The response is ProductListResponseV2 `{ products: [...] }`.
   */
  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    return transformProduct(await this.fetchProduct(credentials, id))
  }

  private async fetchProduct(credentials: Credentials, id: string): Promise<RawSquarespaceProduct> {
    const res = await this.client(credentials).get<{ products?: RawSquarespaceProduct[] }>(
      `${PRODUCTS_V2}/${encodeURIComponent(id)}`,
    )
    const product = (res.products ?? []).find((p) => p.id === id)
    if (!product) {
      throw Object.assign(new Error(`Squarespace product ${id} not found`), { statusCode: 404 })
    }
    return product
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).post<RawSquarespaceProduct>(
      `${COMMERCE_V1}/products`,
      untransformProduct(data),
    )
    return transformProduct(res)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.client(credentials).post<RawSquarespaceProduct>(
      `${COMMERCE_V1}/products/${id}`,
      untransformProduct(data),
    )
    return transformProduct(res)
  }

  // ── Variants ──────────────────────────────────────────────────────────────
  //
  // Squarespace documents no variant list or variant read: the v2 Products
  // API has only POST /v2/commerce/products/{productId}/variants and
  // POST/DELETE .../variants/{variantId}. Variants are the `variants` array of
  // each product on GET /v2/commerce/products, flattened here.

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    // Variants flattened out of pages of products, a variable number per
    // product: pageByRows over the products chain, under its own key.
    return this.cursorRows<RawSquarespaceProduct, ProductVariant>(
      credentials,
      params,
      'variants',
      PRODUCTS_V2,
      'products',
      { updatedAfter: params.updatedAfter },
      () => this.productFilters(params),
      (products) =>
        products.flatMap((p) => (p.variants ?? []).map((v) => transformVariant(v, p.id))),
    )
  }

  /**
   * A variant by id. A compound `productId:variantId` reads that product
   * (GET /v2/commerce/products/{productId}); a bare variant id, as
   * listVariants returns, walks the products list until a product holds it.
   */
  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const parts = id.split(':')
    if (parts.length === 2) {
      const [productId, variantId] = parts as [string, string]
      const product = await this.fetchProduct(credentials, productId)
      const variant = (product.variants ?? []).find((v) => v.id === variantId)
      if (variant) return transformVariant(variant, product.id)
    } else {
      const client = this.client(credentials)
      let cursor: string | undefined
      for (;;) {
        const page = await client.cursorPage<RawSquarespaceProduct>(
          PRODUCTS_V2,
          'products',
          cursor === undefined ? {} : { cursor },
        )
        for (const product of page.items) {
          const variant = (product.variants ?? []).find((v) => v.id === id)
          if (variant) return transformVariant(variant, product.id)
        }
        if (page.next === undefined || page.next === cursor) break
        cursor = page.next
      }
    }
    throw Object.assign(new Error(`Squarespace variant ${id} not found`), { statusCode: 404 })
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    // Squarespace variants are updated through the inventory or product endpoint.
    // Use variant-specific fields via the product variant sub-resource.
    const parts = id.split(':')
    const variantId = parts.length === 2 ? parts[1]! : id
    const productId = parts.length === 2 ? parts[0]! : data.productId

    if (!productId) {
      throw new Error('updateVariant requires productId (use compound id `productId:variantId`)')
    }

    const res = await this.client(credentials).post<RawSquarespaceVariant>(
      `${COMMERCE_V1}/products/${productId}/variants/${variantId}`,
      untransformVariant(data),
    )
    return transformVariant(res)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    // GET /inventory documents no filter: only `cursor`.
    return this.cursorRows<RawSquarespaceInventoryItem, InventoryLevel>(
      credentials,
      params,
      'inventory',
      `${COMMERCE_V1}/inventory`,
      'inventory',
      {},
      () => ({}),
      (items) => items.map(transformInventoryLevel),
    )
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // id format: `variantId:default`
    const variantId = id.split(':')[0]!
    const res = await this.client(credentials).get<RawSquarespaceInventoryItem>(
      `${COMMERCE_V1}/inventory/${variantId}`,
    )
    return transformInventoryLevel(res)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const res = await this.client(credentials).post<RawSquarespaceInventoryItem>(
      `${COMMERCE_V1}/inventory/${data.variantId}/adjustments`,
      { quantityDelta: data.delta },
    )
    return transformInventoryLevel(res)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const res = await this.client(credentials).put<RawSquarespaceInventoryItem>(
      `${COMMERCE_V1}/inventory/${data.variantId}`,
      { quantity: data.available },
    )
    return transformInventoryLevel(res)
  }

  // ── Customers (Profiles) ──────────────────────────────────────────────────
  //
  // Profiles API (https://developers.squarespace.com/commerce-apis/profiles):
  // "List profiles ... GET /1.0/profiles ... Retrieves all profiles; profiles
  // can be filtered and sorted. The response contains up to 50 Profiles and
  // supports dynamic cursors for pagination." Query parameters: sortDirection,
  // sortField, filter, email, cursor ("Cannot be used with other
  // parameters"). There is no modification-date filter, so an updatedAfter
  // is not sent and the walk returns every profile (a superset of the delta).

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    return this.cursorRows<RawSquarespaceProfile, Customer>(
      credentials,
      params,
      'customers',
      PROFILES,
      'profiles',
      {},
      () => ({}),
      (items) => items.map(transformCustomer),
    )
  }

  /**
   * GET /1.0/profiles/{profileIdCsvs}: "Retrieves information for specific
   * profiles. The response contains a list of up to 50 Profiles."
   */
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ profiles?: RawSquarespaceProfile[] }>(
      `${PROFILES}/${encodeURIComponent(id)}`,
    )
    const profile = (res.profiles ?? []).find((p) => p.id === id)
    if (!profile) {
      throw Object.assign(new Error(`Squarespace profile ${id} not found`), { statusCode: 404 })
    }
    return transformCustomer(profile)
  }

  // createCustomer / updateCustomer are write methods, out of scope for the
  // read rebuild. They still target /1.0/commerce/profiles, which the
  // published reference does not document (it lists only GET /1.0/profiles
  // and GET /1.0/profiles/{profileIdCsvs}).

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const res = await this.client(credentials).post<RawSquarespaceProfile>(
      `${COMMERCE_V1}/profiles`,
      untransformCustomer(data),
    )
    return transformCustomer(res)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).post<RawSquarespaceProfile>(
      `${COMMERCE_V1}/profiles/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(res)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    return this.cursorRows<RawSquarespaceOrder, Order>(
      credentials,
      params,
      'orders',
      `${COMMERCE_V1}/orders`,
      'result',
      { updatedAfter: params.updatedAfter },
      () => this.orderFilters(params),
      (items) => items.map(transformOrder),
    )
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<RawSquarespaceOrder>(
      `${COMMERCE_V1}/orders/${id}`,
    )
    return transformOrder(res)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).post<RawSquarespaceOrder>(
      `${COMMERCE_V1}/orders/${id}/fulfillments`,
      untransformOrder(data),
    )
    return transformOrder(res)
  }

  // ── Fulfillments (derived from orders) ───────────────────────────────────
  // Squarespace has no standalone GET /fulfillments endpoint. Fulfillment data
  // is embedded in the order's `fulfillments` array as shipment objects.
  // We list all orders and flatten their shipments to produce Fulfillment records.

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    // Shipments flattened out of pages of orders: its own key, since the rows
    // differ from listOrders' even though the cursors are the same.
    return this.cursorRows<RawSquarespaceOrder, Fulfillment>(
      credentials,
      params,
      'fulfillments',
      `${COMMERCE_V1}/orders`,
      'result',
      { updatedAfter: params.updatedAfter },
      () => this.orderFilters(params),
      (orders) => {
        const fulfillments: Fulfillment[] = []
        for (const order of orders) {
          const shipments = (order.fulfillments ?? []) as RawSquarespaceShipment[]
          shipments.forEach((s, i) => fulfillments.push(transformFulfillment(s, order.id, i)))
        }
        return fulfillments
      },
    )
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Composite id format: `orderId:fulfillment:index`
    const parts = id.split(':fulfillment:')
    const orderId = parts[0]!
    const index = parts.length === 2 ? parseInt(parts[1]!, 10) : 0
    const order = await this.client(credentials).get<RawSquarespaceOrder>(
      `${COMMERCE_V1}/orders/${orderId}`,
    )
    const shipments = (order.fulfillments ?? []) as RawSquarespaceShipment[]
    const shipment = shipments[index]
    if (!shipment) throw new Error(`Fulfillment ${id} not found`)
    return transformFulfillment(shipment, orderId, index)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    return this.cursorRows<RawSquarespaceTransaction, Transaction>(
      credentials,
      params,
      'transactions',
      `${COMMERCE_V1}/transactions`,
      'documents',
      { updatedAfter: params.updatedAfter },
      () => (params.updatedAfter ? { modifiedAfter: params.updatedAfter.toISOString() } : {}),
      (items) => items.map(transformTransaction),
    )
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // The Squarespace endpoint accepts a comma-separated list of ids.
    // Requesting a single id returns the same `{ documents: [...] }` shape.
    const data = await this.client(credentials).get<{ documents: RawSquarespaceTransaction[] }>(
      `${COMMERCE_V1}/transactions/${id}`,
    )
    const doc = data.documents?.[0]
    if (!doc) throw new Error(`Transaction ${id} not found`)
    return transformTransaction(doc)
  }

  // ── Not supported (501) ───────────────────────────────────────────────────
  // The following are intentionally NOT implemented:
  //   deleteProduct, createVariant, deleteVariant,
  //   listCollections, getCollection, createCollection, updateCollection, deleteCollection
  //     → Squarespace Commerce API has no collections/categories endpoint
  //   listLocations, getLocation
  //     → Squarespace Commerce API has no locations endpoint
  //   deleteCustomer,
  //   createOrder, cancelOrder,
  //   createFulfillment, updateFulfillment, cancelFulfillment,
  //   listRefunds, getRefund, createRefund
  //     → refund data is embedded in transaction documents; no dedicated endpoint
  //   createTransaction,
  //   listDiscounts, getDiscount, createDiscount, updateDiscount, deleteDiscount
  //     → discount data is embedded in orders only; no dedicated endpoint
}
