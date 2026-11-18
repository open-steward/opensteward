/**
 * Salla adapter for the ecommerce vertical.
 *
 * Maps the Salla Merchant REST API (v2) to the canonical ecommerce resources.
 *
 * Auth: OAuth2 authorization-code flow via accounts.salla.sa. Access tokens
 * expire after 14 days; refresh tokens are single-use and expire after 1
 * month. This adapter handles token refresh automatically.
 *
 * Base URL: https://api.salla.dev/admin/v2
 *
 * Docs: https://docs.salla.dev/
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { isTokenExpired, reportUpstreamPage } from '@opensteward/shared'
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

import { buildAuthUrl, exchangeCode as sallaExchangeCode, refreshAccessToken } from './auth'
import { SallaClient, type ListResult, type SallaResponse } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, SALLA_MAX_PER_PAGE } from './constants'
import { verifySallaWebhook, parseSallaWebhookEvents } from './webhook'

import {
  transformProduct,
  transformVariantFromSku,
  untransformProduct,
  untransformVariant,
  type RawSallaProduct,
  type RawSallaSku,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawSallaCategory,
} from './transform/collection'
import {
  transformLocation,
  syntheticDefaultLocation,
  type RawSallaBranch,
} from './transform/location'
import {
  transformInventoryLevel,
  syntheticInventoryLevel,
  type RawSallaProductQuantity,
} from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawSallaCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawSallaOrder,
} from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawSallaShipment,
} from './transform/fulfillment'
import {
  transformRefund,
  untransformRefund,
  type RawSallaRefund,
} from './transform/refund'
import {
  transformTransaction,
  type RawSallaTransaction,
} from './transform/transaction'
import {
  transformDiscount,
  untransformDiscount,
  type RawSallaCoupon,
} from './transform/discount'

export interface SallaAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class SallaAdapter implements EcommerceAdapter {
  readonly platform = 'salla'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: SallaAdapterConfig) {
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
    return sallaExchangeCode(code, this.clientId, this.clientSecret, this.redirectUri)
  }

  /**
   * Salla access tokens expire after 14 days. Refresh if expired or about to
   * expire. Refresh tokens are single-use; we always use the new refresh token
   * returned with the new access token.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!isTokenExpired(credentials.expiresAt)) return credentials
    if (!credentials.refreshToken) return credentials
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySallaWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSallaWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): SallaClient {
    return new SallaClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    const page = params['page'] ?? params['cursor']
    if (page) out.page = Number(page)
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).list<RawSallaProduct>(
      '/products',
      this.pageParams(params),
    )
    return res.items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<SallaResponse<RawSallaProduct>>(
      `/products/${id}`,
    )
    return transformProduct(res.data)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const body = untransformProduct(data)
    if (!body.price) body.price = 0
    if (!body.product_type) body.product_type = 'product'
    const res = await this.client(credentials).post<SallaResponse<RawSallaProduct>>(
      '/products',
      body,
    )
    return transformProduct(res.data)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.client(credentials).put<SallaResponse<RawSallaProduct>>(
      `/products/${id}`,
      untransformProduct(data),
    )
    return transformProduct(res.data)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/products/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────
  // Salla variants (SKUs) are nested inside the product. We expose them by
  // fetching the parent product and returning the embedded skus.

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['product_id']
    if (!productId) {
      // No productId: list all products and flatten variants
      const res = await this.client(credentials).list<RawSallaProduct>(
        '/products',
        this.pageParams(params),
      )
      return res.items.flatMap((p) =>
        (p.skus ?? []).map((sku) => transformVariantFromSku(sku, p)),
      )
    }
    const res = await this.client(credentials).get<SallaResponse<RawSallaProduct>>(
      `/products/${String(productId)}`,
    )
    return (res.data.skus ?? []).map((sku) => transformVariantFromSku(sku, res.data))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Salla SKU id format: `productId:skuId` or just the sku id if unique
    const [productId, skuId] = id.includes(':') ? id.split(':') : [undefined, id]
    if (!productId) {
      throw new Error('getVariant requires composite id format: `productId:skuId`')
    }
    const res = await this.client(credentials).get<SallaResponse<RawSallaProduct>>(
      `/products/${productId}`,
    )
    const sku = (res.data.skus ?? []).find((s) => String(s.id) === skuId)
    if (!sku) throw new Error(`SKU ${skuId} not found on product ${productId}`)
    return transformVariantFromSku(sku, res.data)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const [productId, skuId] = id.includes(':') ? id.split(':') : [data.productId, id]
    if (!productId) {
      throw new Error('updateVariant requires composite id format: `productId:skuId`')
    }
    const res = await this.client(credentials).put<SallaResponse<RawSallaSku>>(
      `/products/skus/${skuId}`,
      untransformVariant(data),
    )
    // Re-fetch the parent product to build a complete ProductVariant
    const parent = await this.client(credentials).get<SallaResponse<RawSallaProduct>>(
      `/products/${productId}`,
    )
    return transformVariantFromSku(res.data, parent.data)
  }

  // ── Collections (Categories) ──────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const res = await this.client(credentials).list<RawSallaCategory>(
      '/categories',
      this.pageParams(params),
    )
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.client(credentials).get<SallaResponse<RawSallaCategory>>(
      `/categories/${id}`,
    )
    return transformCollection(res.data)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).post<SallaResponse<RawSallaCategory>>(
      '/categories',
      untransformCollection(data),
    )
    return transformCollection(res.data)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).put<SallaResponse<RawSallaCategory>>(
      `/categories/${id}`,
      untransformCollection(data),
    )
    return transformCollection(res.data)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/categories/${id}`)
  }

  // ── Locations (Branches) ──────────────────────────────────────────────────

  /**
   * GET /branches, one Salla page per caller page. Salla pages by `page` and
   * `per_page`, and "the maximum value for the `per_page` query parameter is
   * `60`" (https://docs.salla.dev/pagination.md); a larger caller limit is
   * clamped and reported as `pageSize`. The end comes from the envelope's
   * `currentPage`/`totalPages` (or `next` link), via `client.list`.
   *
   * The synthetic default location stands in only for page 1: a failure on a
   * later page must surface, not re-serve the synthetic row on every page.
   */
  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const asked = params.limit
    const size =
      typeof asked === 'number' && Number.isFinite(asked) && asked >= 1
        ? Math.min(Math.floor(asked), SALLA_MAX_PER_PAGE)
        : DEFAULT_PAGE_SIZE
    const page = params.page ?? 1
    let res: ListResult<RawSallaBranch>
    try {
      res = await this.client(credentials).list<RawSallaBranch>('/branches', {
        per_page: size,
        page,
      })
    } catch (err) {
      if (page > 1) throw err
      reportUpstreamPage(params, { hasMore: false })
      return [syntheticDefaultLocation()]
    }
    reportUpstreamPage(params, {
      hasMore: res.nextPage !== undefined,
      ...(typeof asked === 'number' && size < asked ? { pageSize: size } : {}),
    })
    return res.items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    if (id === 'default') return syntheticDefaultLocation()
    const res = await this.client(credentials).get<SallaResponse<RawSallaBranch>>(
      `/branches/${id}`,
    )
    return transformLocation(res.data)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────
  // Salla exposes product quantities via a dedicated quantities endpoint.

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const productId = params['product_id'] ?? params['productId']
    if (productId) {
      // Fetch a single product and derive inventory from its quantity
      const res = await this.client(credentials).get<SallaResponse<RawSallaProduct>>(
        `/products/${String(productId)}`,
      )
      return [syntheticInventoryLevel(res.data.id, res.data.quantity ?? 0)]
    }
    // List product quantities endpoint
    const res = await this.client(credentials).list<RawSallaProductQuantity>(
      '/products/quantities',
      this.pageParams(params),
    )
    return res.items.map(transformInventoryLevel)
  }

  // adjustInventoryLevel and setInventoryLevel → 501
  // Salla quantity management is done via product PUT (quantity field)

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).list<RawSallaCustomer>(
      '/customers',
      this.pageParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<SallaResponse<RawSallaCustomer>>(
      `/customers/${id}`,
    )
    return transformCustomer(res.data)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).post<SallaResponse<RawSallaCustomer>>(
      '/customers',
      untransformCustomer(data),
    )
    return transformCustomer(res.data)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).put<SallaResponse<RawSallaCustomer>>(
      `/customers/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(res.data)
  }

  // deleteCustomer → 501 (Salla does not expose a customer delete endpoint)

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const extra: Record<string, unknown> = { ...this.pageParams(params) }
    if (params.updatedAfter) {
      extra.from_date = params.updatedAfter.toISOString().slice(0, 10)
    }
    const res = await this.client(credentials).list<RawSallaOrder>('/orders', extra)
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<SallaResponse<RawSallaOrder>>(
      `/orders/${id}`,
    )
    return transformOrder(res.data)
  }

  // createOrder → 501 (Salla orders are created via storefront checkout, not API)

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const res = await this.client(credentials).put<SallaResponse<RawSallaOrder>>(
      `/orders/${id}`,
      untransformOrder(data),
    )
    return transformOrder(res.data)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    // Salla cancels an order by updating its status
    const res = await this.client(credentials).post<SallaResponse<RawSallaOrder>>(
      `/orders/${id}/cancel`,
      {},
    )
    return transformOrder(res.data)
  }

  // ── Fulfillments (Shipments) ──────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const extra: Record<string, unknown> = { ...this.pageParams(params) }
    const orderId = params['order_id'] ?? params['orderId']
    if (orderId) extra.order_id = String(orderId)
    const res = await this.client(credentials).list<RawSallaShipment>('/shipments', extra)
    return res.items.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const res = await this.client(credentials).get<SallaResponse<RawSallaShipment>>(
      `/shipments/${id}`,
    )
    return transformFulfillment(res.data)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const body = {
      order_id: data.orderId,
      ...untransformFulfillment(data),
    }
    const res = await this.client(credentials).post<SallaResponse<RawSallaShipment>>(
      '/shipments',
      body,
    )
    return transformFulfillment(res.data)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const res = await this.client(credentials).put<SallaResponse<RawSallaShipment>>(
      `/shipments/${id}`,
      untransformFulfillment(data),
    )
    return transformFulfillment(res.data)
  }

  // cancelFulfillment → 501 (Salla does not expose a shipment cancel endpoint)

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = params['order_id'] ?? params['orderId']
    const path = orderId ? `/orders/${String(orderId)}/refunds` : '/refunds'
    const res = await this.client(credentials).list<RawSallaRefund>(
      path,
      this.pageParams(params),
    )
    return res.items.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // Composite id: `orderId:refundId`
    const [orderId, refundId] = id.includes(':') ? id.split(':') : [undefined, id]
    const path = orderId ? `/orders/${orderId}/refunds/${refundId}` : `/refunds/${id}`
    const res = await this.client(credentials).get<SallaResponse<RawSallaRefund>>(path)
    return transformRefund(res.data)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const res = await this.client(credentials).post<SallaResponse<RawSallaRefund>>(
      `/orders/${data.orderId}/refunds`,
      untransformRefund(data),
    )
    return transformRefund(res.data)
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
    const res = await this.client(credentials).list<RawSallaTransaction>(
      `/orders/${String(orderId)}/transactions`,
      this.pageParams(params),
    )
    return res.items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const [orderId, txId] = id.includes(':') ? id.split(':') : [undefined, id]
    const path = orderId
      ? `/orders/${orderId}/transactions/${txId}`
      : `/transactions/${id}`
    const res = await this.client(credentials).get<SallaResponse<RawSallaTransaction>>(path)
    return transformTransaction(res.data)
  }

  // createTransaction → 501 (Salla transactions are read-only)

  // ── Discounts (Coupons) ───────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const res = await this.client(credentials).list<RawSallaCoupon>(
      '/coupons',
      this.pageParams(params),
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.client(credentials).get<SallaResponse<RawSallaCoupon>>(
      `/coupons/${id}`,
    )
    return transformDiscount(res.data)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.client(credentials).post<SallaResponse<RawSallaCoupon>>(
      '/coupons',
      untransformDiscount(data),
    )
    return transformDiscount(res.data)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.client(credentials).put<SallaResponse<RawSallaCoupon>>(
      `/coupons/${id}`,
      untransformDiscount(data),
    )
    return transformDiscount(res.data)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/coupons/${id}`)
  }
}
