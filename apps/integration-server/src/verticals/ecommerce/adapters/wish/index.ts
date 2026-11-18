/**
 * Wish Merchant adapter for the ecommerce vertical.
 *
 * Reads use the Wish Merchant API v3 (GET /api/v3/products, /api/v3/products/{id},
 * /api/v3/orders, /api/v3/orders/{id}); see the list methods below. Every
 * /api/v2 path now answers 404 "Page not found" (code 4004), and the current
 * first-party spec has no v2 path. The write methods, and getFulfillment /
 * getRefund, still call v2 and are outside the read rebuild.
 *
 * Legacy v2 endpoints still referenced (all answer 404 today):
 *   - product/add, product/update, product/disable
 *   - variant (setInventoryLevel's SKU lookup), variant/add, variant/update,
 *     variant/update-inventory
 *   - order (getFulfillment, getRefund), order/fulfill-one, order/refund
 *
 * Auth: OAuth2 Authorization Code flow. Access tokens expire after 30 days;
 * `refreshCredentials` uses the stored refresh token to obtain a new pair.
 *
 * Docs: https://merchant.wish.com/documentation/api/v3/reference
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: collection   — Wish has no collection/category resource in the merchant API
 * Unavailable: customer     — Wish does not expose a customer API; buyer info is embedded in orders only
 * Unavailable: discount     — Wish promotions are managed via the Merchant Dashboard; no discount API endpoint
 * Unavailable: location     — not implemented. API v3 documents GET /api/v3/merchant/warehouses ("Returns a list of warehouses merchant owns."); a listLocations on it is a follow-up
 * Unavailable: transaction  — Wish does not expose a payment transaction API for merchants
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { connectionScope, cursorPagerKey, pageByRows } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { InventoryLevel } from '../../schema/inventory'

import { buildAuthUrl, exchangeCode as wishExchangeCode, refreshAccessToken } from './auth'
import { WishClient, WishV3Client } from './client'
import {
  V3_DEFAULT_LIMIT,
  ORDERS_MAX_LIMIT,
  PRODUCTS_MAX_LIMIT,
  PRODUCT_STATUSES,
} from './constants'
import { fetchKeysetPage, type KeysetCursor } from './keyset'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  transformV3Product,
  transformV3Variation,
  type RawWishProduct,
  type RawWishVariant,
  type RawWishV3Product,
} from './transform/product'
import { transformOrder, type RawWishOrder } from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawWishFulfillment,
} from './transform/fulfillment'
import { transformRefund, untransformRefund, type RawWishRefund } from './transform/refund'
import {
  transformInventoryLevel,
  transformV3InventoryLevels,
  WISH_LOCATION_ID,
  type RawWishInventoryVariant,
} from './transform/inventory'

export interface WishAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** Whether to use the sandbox environment (default: false = production). */
  sandbox?: boolean
}

/** Wish API `data` wrapper for a single product. */
interface WishProductData {
  Product: RawWishProduct
}

/** Wish API `data` wrapper for a single variant. */
interface WishVariantData {
  Variant: RawWishVariant
}

/**
 * The v2 order fields the legacy fulfillment and refund methods read. Those
 * methods still call v2 paths and are outside the read rebuild.
 */
interface LegacyWishOrder {
  order_id: string
  state?: string
  tracking_provider?: string
  tracking_number?: string
  tracking_url?: string
  created_time?: string | number
  last_updated?: string | number
  [key: string]: unknown
}

/** Wish API v2 `data` wrapper for a single order. */
interface WishOrderData {
  Order: LegacyWishOrder
}

/** A method Wish's API cannot serve: refused before any request is sent. */
function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class WishAdapter implements EcommerceAdapter {
  readonly platform = 'wish'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private sandbox: boolean

  constructor(config: WishAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.sandbox = config.sandbox ?? false
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(this.clientId, this.redirectUri, state, this.sandbox)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return wishExchangeCode(code, this.clientId, this.clientSecret, this.redirectUri)
  }

  /**
   * Wish access tokens expire after 30 days. The shared `isTokenExpired`
   * helper checks `expiresAt`; when expired we obtain a fresh token pair
   * using the stored refresh token.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const refreshToken = credentials.refreshToken
    if (!refreshToken) {
      // No refresh token stored — return as-is and let the caller handle.
      return credentials
    }
    return refreshAccessToken(refreshToken, this.clientId, this.clientSecret)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): WishClient {
    return new WishClient(credentials, this.sandbox)
  }

  private v3(credentials: Credentials): WishV3Client {
    return new WishV3Client(credentials, this.sandbox)
  }

  /** Pager key: this connection, the collection, the upstream page size and every filter sent. */
  private pagerKey(
    credentials: Credentials,
    collection: string,
    filters: Record<string, unknown>,
  ): string {
    return cursorPagerKey(connectionScope('wish', credentials), collection, filters)
  }

  /**
   * One upstream page of GET /api/v3/products, walked by the documented
   * `updated_at_max` keyset (keyset.ts). `updated_at_min`: "Only return
   * products that were updated since the given time." Timestamps are sent as
   * ISO date-time: "It is in the form `YYYY-MM-DDTHH:mm:ss.sssZ`". Every
   * `statuses` value is sent, because its default leaves some out (see
   * PRODUCT_STATUSES). The product `updated_at_max` keeps "precision up to
   * 'millisecond'", so the keyset steps one millisecond.
   */
  private productPage(
    client: WishV3Client,
    limit: number,
    updatedMin: string | undefined,
    cursor: KeysetCursor | undefined,
  ) {
    return fetchKeysetPage<RawWishV3Product>(
      'products',
      limit,
      PRODUCTS_MAX_LIMIT,
      'ms',
      cursor,
      (query) =>
        client.get<RawWishV3Product[]>('/api/v3/products', {
          ...query,
          statuses: [...PRODUCT_STATUSES],
          ...(updatedMin ? { updated_at_min: updatedMin } : {}),
        }),
    )
  }

  /**
   * Rows flattened out of every product's detail (GET /api/v3/products/{id}),
   * over pages of GET /api/v3/products. The v3 spec has no variation or
   * inventory list: `ShallowProduct` rows carry no variations, and
   * `Product.variations` ("The variations of the product.") appears only on
   * the detail. The rows are cut into the caller's page by pageByRows.
   *
   * `updatedAfter` is not sent: a variation carries no timestamp, and no
   * document says an inventory change moves the product's `updated_at`, so
   * filtering on it could hide changed rows. The full stream is served.
   */
  private async fanOut<R>(
    credentials: Credentials,
    params: QueryParams,
    collection: string,
    rowsOf: (product: RawWishV3Product) => R[],
  ): Promise<R[]> {
    const client = this.v3(credentials)
    const key = this.pagerKey(credentials, collection, { upstreamLimit: V3_DEFAULT_LIMIT })
    const { items } = await pageByRows<R, KeysetCursor>(key, params, async (cursor) => {
      const page = await this.productPage(client, V3_DEFAULT_LIMIT, undefined, cursor)
      const rows: R[] = []
      for (const shallow of page.items) {
        const detail = await client.get<RawWishV3Product>(
          `/api/v3/products/${encodeURIComponent(String(shallow.id))}`,
        )
        rows.push(...rowsOf(detail))
      }
      return { items: rows, next: page.next }
    })
    return items
  }

  // ── Products ──────────────────────────────────────────────────────────────

  /**
   * GET /api/v3/products ("List products synchronously"). `limit` is the
   * caller's, clamped to the documented maximum of 1000; pageByRows cuts the
   * caller's exact page out of the keyset walk.
   */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.v3(credentials)
    const upstreamLimit = Math.min(
      Math.max(Math.floor(params.limit ?? V3_DEFAULT_LIMIT), 1),
      PRODUCTS_MAX_LIMIT,
    )
    const updatedMin = params.updatedAfter?.toISOString()
    const key = this.pagerKey(credentials, 'products', { upstreamLimit, updatedMin })
    const { items } = await pageByRows<Product, KeysetCursor>(key, params, async (cursor) => {
      const page = await this.productPage(client, upstreamLimit, updatedMin, cursor)
      return { items: page.items.map(transformV3Product), next: page.next }
    })
    return items
  }

  /** GET /api/v3/products/{id} ("Get a product synchronously"). */
  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const data = await this.v3(credentials).get<RawWishV3Product>(
      `/api/v3/products/${encodeURIComponent(id)}`,
    )
    return transformV3Product(data)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const result = await this.client(credentials).post<WishProductData>(
      'product/add',
      untransformProduct(data),
    )
    return transformProduct(result.Product)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const result = await this.client(credentials).post<WishProductData>('product/update', {
      id,
      ...untransformProduct(data),
    })
    return transformProduct(result.Product)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    // Wish uses enable/disable rather than hard delete.
    await this.client(credentials).post<WishProductData>('product/disable', { id })
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  /** Every product's variations, flattened from the product details (see fanOut). */
  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    return this.fanOut(credentials, params, 'variants', (p) =>
      (p.variations ?? []).map(transformV3Variation),
    )
  }

  /**
   * The v3 spec has no path that reads a variation by its id: its only
   * variation paths are POST /api/v3/products/{id}/variations and GET
   * /api/v3/products/variations/colors ("Get a list of accepted colors.").
   */
  async getVariant(_credentials: Credentials, _id: string): Promise<ProductVariant> {
    throw notSupported(
      'Wish cannot get a variation by id: API v3 returns variations only inside GET /api/v3/products/{id}',
    )
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    if (!data.productId) throw new Error('createVariant requires productId')
    const result = await this.client(credentials).post<WishVariantData>('variant/add', {
      parent_id: data.productId,
      ...untransformVariant(data),
    })
    return transformVariant(result.Variant)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const result = await this.client(credentials).post<WishVariantData>('variant/update', {
      id,
      ...untransformVariant(data),
    })
    return transformVariant(result.Variant)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  /**
   * GET /api/v3/orders ("List orders"). `limit` is the caller's, clamped to
   * the documented maximum of 500. `updated_at_min`: "Specify the beginning
   * of the window to view orders by last order update." Paged by the
   * documented `updated_at_max` keyset (keyset.ts). The orders reference
   * gives no precision for `updated_at_max` (its example is
   * "2020-01-01T07:00:00.000Z"), so the keyset steps to the next whole second.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.v3(credentials)
    const upstreamLimit = Math.min(
      Math.max(Math.floor(params.limit ?? V3_DEFAULT_LIMIT), 1),
      ORDERS_MAX_LIMIT,
    )
    const updatedMin = params.updatedAfter?.toISOString()
    const key = this.pagerKey(credentials, 'orders', { upstreamLimit, updatedMin })
    const { items } = await pageByRows<Order, KeysetCursor>(key, params, async (cursor) => {
      const page = await fetchKeysetPage<RawWishOrder>(
        'orders',
        upstreamLimit,
        ORDERS_MAX_LIMIT,
        's',
        cursor,
        (query) =>
          client.get<RawWishOrder[]>('/api/v3/orders', {
            ...query,
            ...(updatedMin ? { updated_at_min: updatedMin } : {}),
          }),
      )
      return { items: page.items.map(transformOrder), next: page.next }
    })
    return items
  }

  /** GET /api/v3/orders/{id} ("Retrieves the details of an existing order."). */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const data = await this.v3(credentials).get<RawWishOrder>(
      `/api/v3/orders/${encodeURIComponent(id)}`,
    )
    return transformOrder(data)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  /**
   * Wish fulfillment is tied to the order — each order has at most one
   * shipment. We fetch the order and synthesise a Fulfillment when the order
   * is in a shipped state with tracking details.
   */
  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // `id` is the order_id (Wish has no separate fulfillment id).
    const data = await this.client(credentials).get<WishOrderData>('order', { order_id: id })
    const order = data.Order
    const raw: RawWishFulfillment = {
      order_id: order.order_id,
      state: order.state,
      tracking_provider: order.tracking_provider ?? null,
      tracking_number: order.tracking_number ?? null,
      tracking_url: order.tracking_url ?? null,
      last_updated: order.last_updated,
      created_time: order.created_time,
    }
    return transformFulfillment(raw)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    // Wish `order/fulfill-one`: mark an order as shipped with tracking info.
    const body = untransformFulfillment(data)
    const orderData = await this.client(credentials).post<WishOrderData>('order/fulfill-one', body)
    const order = orderData.Order
    const raw: RawWishFulfillment = {
      order_id: order.order_id,
      state: order.state,
      tracking_provider: order.tracking_provider ?? null,
      tracking_number: order.tracking_number ?? null,
      tracking_url: order.tracking_url ?? null,
      last_updated: order.last_updated,
      created_time: order.created_time,
    }
    return transformFulfillment(raw)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // `id` is the order_id — refunds on Wish are order-level.
    const data = await this.client(credentials).get<WishOrderData>('order', { order_id: id })
    const order = data.Order
    const raw: RawWishRefund = {
      order_id: order.order_id,
      refund_to_customer: order['refund_to_customer'] as number | undefined,
      reason_note: order['reason_note'] as string | undefined,
      refunded_time: order['refunded_time'] as string | undefined,
      created_time: order.created_time,
    }
    return transformRefund(raw)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const body = untransformRefund(data)
    const orderData = await this.client(credentials).post<WishOrderData>('order/refund', body)
    const order = orderData.Order
    const raw: RawWishRefund = {
      order_id: order.order_id,
      refund_to_customer: order['refund_to_customer'] as number | undefined,
      reason_note: order['reason_note'] as string | undefined,
      refunded_time: order['refunded_time'] as string | undefined,
      created_time: order.created_time,
    }
    return transformRefund(raw)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  /**
   * One level per variation per warehouse (`variations[].inventories[]`),
   * flattened from the product details (see fanOut).
   */
  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    return this.fanOut(credentials, params, 'inventory_levels', (p) =>
      (p.variations ?? []).flatMap(transformV3InventoryLevels),
    )
  }

  /**
   * A level's id is `${variationId}:${warehouseId}`, and the v3 spec has no
   * path that reads a variation by id (see getVariant), so a level cannot be
   * read back without its product.
   */
  async getInventoryLevel(_credentials: Credentials, _id: string): Promise<InventoryLevel> {
    throw notSupported(
      'Wish cannot get an inventory level by id: API v3 returns variation inventories only inside GET /api/v3/products/{id}',
    )
  }

  /**
   * Overwrite stock for a variant via `variant/update-inventory`.
   * Wish accepts `sku` + `inventory` (absolute quantity).
   * The `locationId` is ignored — Wish has no location concept.
   */
  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    // Fetch the variant first to get its SKU (required by update-inventory).
    const variantData = await this.client(credentials).get<WishVariantData>('variant', {
      id: data.variantId,
    })
    const variant = variantData.Variant
    const sku = variant.sku
    if (!sku) throw new Error(`Wish variant ${data.variantId} has no SKU; cannot update inventory`)

    await this.client(credentials).post<WishVariantData>('variant/update-inventory', {
      sku,
      inventory: data.available,
    })

    // Reflect the updated value locally — Wish update-inventory returns the
    // variant with the new inventory count.
    const updated: RawWishInventoryVariant = {
      ...(variant as unknown as RawWishInventoryVariant),
      inventory: data.available,
    }
    return transformInventoryLevel(updated)
  }

  /**
   * Apply a delta to a variant's inventory. We read the current level first,
   * then write `current + delta` via `variant/update-inventory`.
   */
  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const current = await this.getInventoryLevel(
      credentials,
      `${data.variantId}:${WISH_LOCATION_ID}`,
    )
    const newAvailable = Math.max(0, current.available + data.delta)
    return this.setInventoryLevel(credentials, {
      variantId: data.variantId,
      locationId: WISH_LOCATION_ID,
      available: newAvailable,
    })
  }
}
