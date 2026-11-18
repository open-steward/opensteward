/**
 * Tiendanube / Nuvemshop adapter for the ecommerce vertical.
 *
 * Supports resources actually available on the Tiendanube REST API:
 *   products, variants, categories (→ collections), locations,
 *   inventory levels, customers, orders, transactions, coupons (→ discounts).
 *
 * Resources NOT supported by Tiendanube and therefore omitted (auto-501):
 *   - Fulfillments as a standalone resource (embedded in order webhooks only)
 *   - Refunds as a standalone resource (reflected via order payment_status)
 *
 * Auth: standard OAuth2 authorization_code grant. Tokens are long-lived.
 * The store's numeric ID (user_id) is returned in the token response and
 * must be stored on the credentials object as `storeId`.
 *
 * Docs: https://tiendanube.github.io/api-documentation/intro
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { pageLocally } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as tiendanubeExchangeCode,
  type TiendanubeCredentials,
} from './auth'
import { TiendanubeClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'
import { verifyTiendanubeWebhook, parseTiendanubeWebhookEvents } from './webhook'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawTiendanubeProduct,
  type RawTiendanubeVariant,
} from './transform/product'
import {
  transformCategory,
  untransformCategory,
  type RawTiendanubeCategory,
} from './transform/collection'
import {
  transformLocation,
  type RawTiendanubeLocation,
} from './transform/location'
import {
  transformInventoryLevel,
  type RawTiendanubeInventoryLevel,
} from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawTiendanubeCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawTiendanubeOrder,
} from './transform/order'
import {
  transformTransaction,
  type RawTiendanubeTransaction,
} from './transform/transaction'
import {
  transformCoupon,
  untransformCoupon,
  type RawTiendanubeCoupon,
} from './transform/discount'

export interface TiendanubeAdapterConfig {
  /** Your Tiendanube app ID (client_id). */
  clientId: string
  /** Your Tiendanube app secret (client_secret). */
  clientSecret: string
  /** OAuth2 scopes to request. Defaults to `DEFAULT_SCOPES`. */
  scopes?: string[]
  /** App identifier for the required `User-Agent` header. Defaults to `OpenSteward`. */
  appName?: string
  /**
   * Regional API endpoint to use.
   *  - `'es'` → api.tiendanube.com (Argentina, Mexico, Colombia, …)
   *  - `'br'` → api.nuvemshop.com.br (Brazil)
   * Defaults to `'es'`.
   */
  region?: 'es' | 'br'
}

export class TiendanubeAdapter implements EcommerceAdapter {
  readonly platform = 'tiendanube'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private scopes: string[]
  private appName: string
  private region: 'es' | 'br'

  constructor(config: TiendanubeAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.scopes = config.scopes ?? DEFAULT_SCOPES
    this.appName = config.appName ?? 'OpenSteward'
    this.region = config.region ?? 'es'
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return tiendanubeExchangeCode(code, this.clientId, this.clientSecret)
  }

  /**
   * Tiendanube access tokens are long-lived and do not rotate. The shared
   * `isTokenExpired` helper treats credentials without `expiresAt` as
   * non-expiring, so returning them unchanged is correct.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyTiendanubeWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseTiendanubeWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): TiendanubeClient {
    return new TiendanubeClient(
      credentials as TiendanubeCredentials,
      this.appName,
      this.region,
    )
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
      page: (params['page'] as number) ?? 1,
    }
    if (params.updatedAfter) {
      out['updated_at_min'] = params.updatedAfter.toISOString()
    }
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).listPage<RawTiendanubeProduct>(
      'products',
      this.pageParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawTiendanubeProduct>(`products/${id}`)
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const raw = await this.client(credentials).post<RawTiendanubeProduct>(
      'products',
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const raw = await this.client(credentials).put<RawTiendanubeProduct>(
      `products/${id}`,
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`products/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['product_id']
    if (!productId) {
      throw new Error('listVariants requires `productId` in query params')
    }
    const res = await this.client(credentials).listPage<RawTiendanubeVariant>(
      `products/${String(productId)}/variants`,
      this.pageParams(params),
    )
    return res.items.map((v) => transformVariant(v))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Composite id: `productId:variantId`
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('getVariant: id must be `productId:variantId`')
    }
    const raw = await this.client(credentials).get<RawTiendanubeVariant>(
      `products/${productId}/variants/${variantId}`,
    )
    return transformVariant(raw)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('updateVariant: id must be `productId:variantId`')
    }
    const raw = await this.client(credentials).put<RawTiendanubeVariant>(
      `products/${productId}/variants/${variantId}`,
      untransformVariant(data),
    )
    return transformVariant(raw)
  }

  // ── Collections (Categories) ──────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const res = await this.client(credentials).listPage<RawTiendanubeCategory>(
      'categories',
      this.pageParams(params),
    )
    return res.items.map(transformCategory)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.client(credentials).get<RawTiendanubeCategory>(`categories/${id}`)
    return transformCategory(raw)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const raw = await this.client(credentials).post<RawTiendanubeCategory>(
      'categories',
      untransformCategory(data),
    )
    return transformCategory(raw)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const raw = await this.client(credentials).put<RawTiendanubeCategory>(
      `categories/${id}`,
      untransformCategory(data),
    )
    return transformCategory(raw)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`categories/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  /**
   * GET /locations documents no parameters ("Receive a list of all
   * Locations.") and returns a bare array of every location, so the page is
   * cut locally from the whole list.
   * https://tiendanube.github.io/api-documentation/resources/location
   */
  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const raw = await this.client(credentials).get<RawTiendanubeLocation[]>('locations')
    return pageLocally((Array.isArray(raw) ? raw : []).map(transformLocation), params)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawTiendanubeLocation>(`locations/${id}`)
    return transformLocation(raw)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const locationId = params['location_id'] ?? params['locationId']
    if (!locationId) {
      throw new Error('listInventoryLevels requires `locationId` in query params')
    }
    const res = await this.client(credentials).listPage<RawTiendanubeInventoryLevel>(
      `locations/${String(locationId)}/inventory-levels`,
      this.pageParams(params),
    )
    return res.items.map((item) =>
      transformInventoryLevel(item, String(locationId)),
    )
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).listPage<RawTiendanubeCustomer>(
      'customers',
      this.pageParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawTiendanubeCustomer>(`customers/${id}`)
    return transformCustomer(raw)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const raw = await this.client(credentials).post<RawTiendanubeCustomer>(
      'customers',
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const raw = await this.client(credentials).put<RawTiendanubeCustomer>(
      `customers/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`customers/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.client(credentials).listPage<RawTiendanubeOrder>(
      'orders',
      this.pageParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.client(credentials).get<RawTiendanubeOrder>(`orders/${id}`)
    return transformOrder(raw)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const raw = await this.client(credentials).put<RawTiendanubeOrder>(
      `orders/${id}`,
      untransformOrder(data),
    )
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    // Tiendanube cancels orders via a POST to /orders/{id}/cancel
    const raw = await this.client(credentials).post<RawTiendanubeOrder>(
      `orders/${id}/cancel`,
    )
    return transformOrder(raw)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listTransactions requires `orderId` in query params')
    }
    const raw = await this.client(credentials).get<RawTiendanubeTransaction[]>(
      `orders/${String(orderId)}/transactions`,
    )
    return (Array.isArray(raw) ? raw : []).map((tx) =>
      transformTransaction(tx, String(orderId)),
    )
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // Composite id: `orderId:transactionId`
    const [orderId, txId] = id.split(':')
    if (!orderId || !txId) {
      throw new Error('getTransaction: id must be `orderId:transactionId`')
    }
    const raw = await this.client(credentials).get<RawTiendanubeTransaction>(
      `orders/${orderId}/transactions/${txId}`,
    )
    return transformTransaction(raw, orderId)
  }

  // ── Discounts (Coupons) ───────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const res = await this.client(credentials).listPage<RawTiendanubeCoupon>(
      'coupons',
      this.pageParams(params),
    )
    return res.items.map(transformCoupon)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const raw = await this.client(credentials).get<RawTiendanubeCoupon>(`coupons/${id}`)
    return transformCoupon(raw)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const raw = await this.client(credentials).post<RawTiendanubeCoupon>(
      'coupons',
      untransformCoupon(data),
    )
    return transformCoupon(raw)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const raw = await this.client(credentials).put<RawTiendanubeCoupon>(
      `coupons/${id}`,
      untransformCoupon(data),
    )
    return transformCoupon(raw)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`coupons/${id}`)
  }
}
