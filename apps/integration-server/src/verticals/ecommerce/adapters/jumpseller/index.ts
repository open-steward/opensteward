/**
 * Jumpseller adapter for the ecommerce vertical.
 *
 * Maps the Jumpseller REST API (https://api.jumpseller.com/v1) to the canonical
 * ecommerce resources.
 *
 * Supported resources:
 *  - Products (CRUD + variants)
 *  - Collections (Jumpseller "categories") (CRUD)
 *  - Customers (CRUD)
 *  - Orders (CRUD + cancel via status update)
 *  - Inventory levels (read from product stock_locations)
 *  - Locations (Jumpseller stock locations)
 *  - Webhooks (HMAC-SHA256 verification, event parsing)
 *
 * Not supported by Jumpseller v1 API (returns 501):
 *  - Fulfillments (tracking embedded on order)
 *  - Refunds (order status only)
 *  - Transactions
 *  - Discounts
 *
 * Auth: OAuth 2 Authorization Code flow. Access tokens expire after 1 hour;
 * refresh tokens are long-lived and used to obtain new access tokens.
 *
 * Docs: https://jumpseller.com/support/api/
 *       https://jumpseller.com/support/oauth-2/
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { isTokenExpired } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as jumpsellerExchangeCode, refreshAccessToken } from './auth'
import { JumpsellerClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'
import { verifyJumpsellerWebhook, parseJumpsellerWebhookEvents } from './webhook'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawJumpsellerProduct,
  type RawJumpsellerVariant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawJumpsellerCategory,
} from './transform/collection'
import {
  transformCustomer,
  untransformCustomer,
  type RawJumpsellerCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawJumpsellerOrder,
} from './transform/order'
import {
  transformInventoryLevel,
  transformFlatStock,
  type RawJumpsellerStockLocation,
} from './transform/inventory'
import {
  transformLocation,
  type RawJumpsellerLocation,
} from './transform/location'

// ── Envelope helpers ──────────────────────────────────────────────────────────
//
// Jumpseller wraps every resource in a named key:
//   GET /products.json     → [{ product: {...} }, ...]
//   GET /products/{id}.json → { product: {...} }
// Same pattern for order, customer, category, location, variant.

type Enveloped<K extends string, T> = Record<K, T>

function unwrapSingle<K extends string, T>(
  envelope: Enveloped<K, T>,
  key: K,
): T {
  return envelope[key]
}

function unwrapList<K extends string, T>(
  envelopes: Enveloped<K, T>[],
  key: K,
): T[] {
  return envelopes.map((e) => e[key])
}

export interface JumpsellerAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class JumpsellerAdapter implements EcommerceAdapter {
  readonly platform = 'jumpseller'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: JumpsellerAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
    )
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return jumpsellerExchangeCode(code, this.clientId, this.clientSecret, this.redirectUri)
  }

  /**
   * Jumpseller access tokens expire after 1 hour. Use the refresh token to
   * obtain a new access token when the current one has expired.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!isTokenExpired(credentials.expiresAt)) return credentials
    if (!credentials.refreshToken) {
      throw new Error(
        'Jumpseller: access token expired and no refresh token is available. ' +
          'Re-authenticate via the OAuth 2 flow.',
      )
    }
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyJumpsellerWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const event =
      (payload['__event'] as string | undefined) ??
      (payload['event'] as string | undefined)
    return parseJumpsellerWebhookEvents(payload, event)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): JumpsellerClient {
    return new JumpsellerClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      page: (params['page'] as number | undefined) ?? 1,
    }
    if (params.updatedAfter) {
      // Jumpseller supports `updated_at_min` filtering on orders.
      out.updated_at_min = params.updatedAfter.toISOString()
    }
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).listWithPage<Enveloped<'product', RawJumpsellerProduct>>(
      '/products.json',
      this.listParams(params),
    )
    return unwrapList(res.items, 'product').map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const envelope = await this.client(credentials).get<Enveloped<'product', RawJumpsellerProduct>>(
      `/products/${id}.json`,
    )
    return transformProduct(unwrapSingle(envelope, 'product'))
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const envelope = await this.client(credentials).post<Enveloped<'product', RawJumpsellerProduct>>(
      '/products.json',
      { product: untransformProduct(data) },
    )
    return transformProduct(unwrapSingle(envelope, 'product'))
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const envelope = await this.client(credentials).put<Enveloped<'product', RawJumpsellerProduct>>(
      `/products/${id}.json`,
      { product: untransformProduct(data) },
    )
    return transformProduct(unwrapSingle(envelope, 'product'))
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/products/${id}.json`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['product_id']
    const client = this.client(credentials)

    if (productId) {
      // Jumpseller exposes variants nested under the product.
      const envelope = await client.get<Enveloped<'product', RawJumpsellerProduct>>(
        `/products/${String(productId)}.json`,
      )
      const product = unwrapSingle(envelope, 'product')
      const currency = product.currency ?? 'USD'
      return (product.variants ?? []).map((v) => ({
        ...transformVariant(v, currency),
        productId: String(productId),
      }))
    }

    // Fallback: paginate products and flatten their variants.
    const res = await client.listWithPage<Enveloped<'product', RawJumpsellerProduct>>(
      '/products.json',
      this.listParams(params),
    )
    return unwrapList(res.items, 'product').flatMap((p) => {
      const currency = p.currency ?? 'USD'
      return (p.variants ?? []).map((v) => ({
        ...transformVariant(v, currency),
        productId: String(p.id),
      }))
    })
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Jumpseller variant id format: `productId:variantId`
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Jumpseller: getVariant requires id in `productId:variantId` format')
    }
    const envelope = await this.client(credentials).get<Enveloped<'product', RawJumpsellerProduct>>(
      `/products/${productId}.json`,
    )
    const product = unwrapSingle(envelope, 'product')
    const raw = (product.variants ?? []).find((v) => String(v.id) === variantId)
    if (!raw) throw new Error(`Jumpseller: variant ${variantId} not found on product ${productId}`)
    return { ...transformVariant(raw, product.currency ?? 'USD'), productId }
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Jumpseller: updateVariant requires id in `productId:variantId` format')
    }
    const envelope = await this.client(credentials).put<Enveloped<'variant', RawJumpsellerVariant>>(
      `/products/${productId}/variants/${variantId}.json`,
      { variant: untransformVariant(data) },
    )
    return { ...transformVariant(unwrapSingle(envelope, 'variant'), data.price?.currency ?? 'USD'), productId }
  }

  // ── Collections (Categories) ───────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const res = await this.client(credentials).listWithPage<Enveloped<'category', RawJumpsellerCategory>>(
      '/categories.json',
      this.listParams(params),
    )
    return unwrapList(res.items, 'category').map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const envelope = await this.client(credentials).get<Enveloped<'category', RawJumpsellerCategory>>(
      `/categories/${id}.json`,
    )
    return transformCollection(unwrapSingle(envelope, 'category'))
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const envelope = await this.client(credentials).post<Enveloped<'category', RawJumpsellerCategory>>(
      '/categories.json',
      { category: untransformCollection(data) },
    )
    return transformCollection(unwrapSingle(envelope, 'category'))
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const envelope = await this.client(credentials).put<Enveloped<'category', RawJumpsellerCategory>>(
      `/categories/${id}.json`,
      { category: untransformCollection(data) },
    )
    return transformCollection(unwrapSingle(envelope, 'category'))
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/categories/${id}.json`)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).listWithPage<Enveloped<'customer', RawJumpsellerCustomer>>(
      '/customers.json',
      this.listParams(params),
    )
    return unwrapList(res.items, 'customer').map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const envelope = await this.client(credentials).get<Enveloped<'customer', RawJumpsellerCustomer>>(
      `/customers/${id}.json`,
    )
    return transformCustomer(unwrapSingle(envelope, 'customer'))
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const envelope = await this.client(credentials).post<Enveloped<'customer', RawJumpsellerCustomer>>(
      '/customers.json',
      { customer: untransformCustomer(data) },
    )
    return transformCustomer(unwrapSingle(envelope, 'customer'))
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const envelope = await this.client(credentials).put<Enveloped<'customer', RawJumpsellerCustomer>>(
      `/customers/${id}.json`,
      { customer: untransformCustomer(data) },
    )
    return transformCustomer(unwrapSingle(envelope, 'customer'))
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/customers/${id}.json`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.client(credentials).listWithPage<Enveloped<'order', RawJumpsellerOrder>>(
      '/orders.json',
      this.listParams(params),
    )
    return unwrapList(res.items, 'order').map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const envelope = await this.client(credentials).get<Enveloped<'order', RawJumpsellerOrder>>(
      `/orders/${id}.json`,
    )
    return transformOrder(unwrapSingle(envelope, 'order'))
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const envelope = await this.client(credentials).post<Enveloped<'order', RawJumpsellerOrder>>(
      '/orders.json',
      { order: untransformOrder(data) },
    )
    return transformOrder(unwrapSingle(envelope, 'order'))
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const envelope = await this.client(credentials).put<Enveloped<'order', RawJumpsellerOrder>>(
      `/orders/${id}.json`,
      { order: untransformOrder(data) },
    )
    return transformOrder(unwrapSingle(envelope, 'order'))
  }

  /** Cancel an order by setting its status to "Canceled". */
  async cancelOrder(credentials: Credentials, id: string): Promise<Order> {
    const envelope = await this.client(credentials).put<Enveloped<'order', RawJumpsellerOrder>>(
      `/orders/${id}.json`,
      { order: { status: 'Canceled' } },
    )
    return transformOrder(unwrapSingle(envelope, 'order'))
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    const envelopes = await this.client(credentials).get<Enveloped<'stock_location', RawJumpsellerLocation>[]>(
      '/stock_locations.json',
    )
    return unwrapList(envelopes ?? [], 'stock_location').map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const envelope = await this.client(credentials).get<Enveloped<'stock_location', RawJumpsellerLocation>>(
      `/stock_locations/${id}.json`,
    )
    return transformLocation(unwrapSingle(envelope, 'stock_location'))
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  /**
   * List inventory levels for a product (or all products). Jumpseller stores
   * stock in `stock_locations` on each product/variant. Requires `productId`
   * in params for an efficient fetch; otherwise paginates all products.
   */
  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const client = this.client(credentials)
    const productId = params['productId'] ?? params['product_id']

    if (productId) {
      const envelope = await client.get<Enveloped<'product', RawJumpsellerProduct>>(
        `/products/${String(productId)}.json`,
      )
      return this.inventoryFromProduct(unwrapSingle(envelope, 'product'))
    }

    // Paginate all products and aggregate.
    const res = await client.listWithPage<Enveloped<'product', RawJumpsellerProduct>>(
      '/products.json',
      this.listParams(params),
    )
    return unwrapList(res.items, 'product').flatMap((p) => this.inventoryFromProduct(p))
  }

  private inventoryFromProduct(product: RawJumpsellerProduct): InventoryLevel[] {
    const productId = String(product.id)
    const stockLocations = product['stock_locations'] as RawJumpsellerStockLocation[] | undefined

    if (stockLocations && stockLocations.length > 0) {
      return stockLocations.map((loc) => transformInventoryLevel(loc, productId))
    }
    // No stock_locations — use flat stock field.
    return [transformFlatStock(productId, product.stock)]
  }
}
