/**
 * Spryker Glue API adapter for the ecommerce vertical.
 *
 * Maps the Spryker Storefront Glue REST API (JSON:API) to the canonical
 * ecommerce resources. Spryker uses OAuth2 resource-owner password credentials
 * for customer authentication; tokens expire in ~8 hours and are refreshed
 * via the refresh-tokens endpoint.
 *
 * Base URL: https://glue.{storeDomain}  (configurable per instance)
 *
 * Resources supported:
 *   - Products     (abstract-products + concrete-products)
 *   - Collections  (category-nodes)
 *   - Customers    (customers)
 *   - Orders       (orders, customers/{id}/orders)
 *   - Inventory    (concrete-product-availabilities, read-only)
 *   - Refunds      (returns)
 *
 * Resources NOT supported by the Spryker Storefront Glue API:
 *   - Locations    (no warehouse endpoint; returns a synthetic default)
 *   - Fulfillments (embedded in orders, not a top-level resource)
 *   - Transactions (embedded in orders as payments)
 *   - Discounts    (vouchers are cart-scoped; no admin list endpoint)
 *
 * Webhook ingestion: Spryker does not document a storefront webhook system;
 *   the adapter does not implement webhook verification.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Refund } from '../../schema/refund'

import { authenticateCustomer, doRefreshCredentials } from './auth'
import { SprykerClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'



import {
  transformAbstractProduct,
  transformConcreteProduct,
  untransformProduct,
  type RawSprykerAbstractProduct,
  type RawSprykerConcreteProduct,
  type RawSprykerPriceResource,
  type RawSprykerImageSetResource,
} from './transform/product'
import {
  transformCategoryNode,
  untransformCollection,
  type RawSprykerCategoryNode,
} from './transform/collection'
import { buildDefaultLocation } from './transform/location'
import { transformAvailability, type RawSprykerAvailability } from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawSprykerCustomer,
  type RawSprykerAddress,
} from './transform/customer'
import { transformOrder, type RawSprykerOrder } from './transform/order'
import { transformReturn, type RawSprykerReturn } from './transform/refund'

// ── Adapter config ────────────────────────────────────────────────────────────

export interface SprykerAdapterConfig {
  /**
   * Base URL of the Spryker Glue storefront API.
   * e.g. "https://glue.mysprykershop.com"
   */
  glueBaseUrl: string
  /**
   * Default currency ISO code used when the API does not specify one.
   * Defaults to "EUR" (Spryker's default demo currency).
   */
  currency?: string
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class SprykerAdapter implements EcommerceAdapter {
  readonly platform = 'spryker'
  readonly version = '0.1.0'

  private glueBaseUrl: string
  private currency: string

  constructor(config: SprykerAdapterConfig) {
    this.glueBaseUrl = config.glueBaseUrl.replace(/\/$/, '')
    this.currency = config.currency ?? 'EUR'
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * Spryker Glue uses ROPC OAuth2, not an authorization-code flow.
   * `getAuthUrl` is not applicable; implementations should call
   * `authenticateWithPassword` directly to obtain credentials.
   */
  getAuthUrl(_state: string): string {
    throw new Error(
      'SprykerAdapter: authorization-code flow is not supported. ' +
        'Use authenticateWithPassword(username, password) instead.',
    )
  }

  /**
   * Exchange an OAuth2 authorization code — NOT supported on Spryker Storefront
   * Glue. Throws an informative error.
   */
  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'SprykerAdapter: authorization-code flow is not supported. ' +
        'Use authenticateWithPassword(username, password) instead.',
    )
  }

  /**
   * Authenticate a customer with username + password (ROPC OAuth2 flow).
   * Returns canonical Credentials including the refresh token.
   */
  async authenticateWithPassword(username: string, password: string): Promise<Credentials> {
    return authenticateCustomer(this.glueBaseUrl, username, password)
  }

  /**
   * Refresh an expired access token using the stored refresh token.
   * If credentials are still valid they are returned unchanged.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const expiresAt = credentials.expiresAt instanceof Date ? credentials.expiresAt : undefined
    const isExpired =
      expiresAt != null && expiresAt.getTime() - Date.now() < 60_000
    if (!isExpired) return credentials
    if (!credentials.refreshToken) return credentials
    return doRefreshCredentials(this.glueBaseUrl, credentials.refreshToken)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): SprykerClient {
    return new SprykerClient(credentials, this.glueBaseUrl)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const out: Record<string, unknown> = { 'page[limit]': limit }
    const offset = params['offset'] ?? params['page[offset]']
    if (offset != null) out['page[offset]'] = offset
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).listWithOffset<RawSprykerAbstractProduct['attributes']>(
      'abstract-products',
      {
        ...this.pageParams(params),
        include: 'abstract-product-image-sets,abstract-product-prices',
      },
    )
    return res.items.map((item) =>
      transformAbstractProduct(
        item as unknown as RawSprykerAbstractProduct,
        [],
        undefined,
        undefined,
        this.currency,
      ),
    )
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    type ResponseShape = {
      data: RawSprykerAbstractProduct
      included?: Array<RawSprykerPriceResource | RawSprykerImageSetResource | RawSprykerConcreteProduct>
    }
    const res = await this.client(credentials).get<ResponseShape>(
      `abstract-products/${id}`,
      { include: 'concrete-products,abstract-product-image-sets,abstract-product-prices' },
    )
    const included = res.included ?? []
    const concretes = included.filter(
      (r): r is RawSprykerConcreteProduct => r.type === 'concrete-products',
    )
    const priceRes = included.find(
      (r): r is RawSprykerPriceResource => r.type === 'abstract-product-prices',
    )
    const imageRes = included.find(
      (r): r is RawSprykerImageSetResource => r.type === 'abstract-product-image-sets',
    )
    return transformAbstractProduct(res.data, concretes, priceRes, imageRes, this.currency)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    type ResponseShape = { data: RawSprykerAbstractProduct }
    const res = await this.client(credentials).post<ResponseShape>(
      'abstract-products',
      untransformProduct(data),
    )
    return transformAbstractProduct(res.data, [], undefined, undefined, this.currency)
  }

  async updateProduct(credentials: Credentials, id: string, data: Partial<Product>): Promise<Product> {
    type ResponseShape = { data: RawSprykerAbstractProduct }
    const body = untransformProduct(data) as { data: Record<string, unknown> }
    body.data['id'] = id
    const res = await this.client(credentials).patch<ResponseShape>(
      `abstract-products/${id}`,
      body,
    )
    return transformAbstractProduct(res.data, [], undefined, undefined, this.currency)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`abstract-products/${id}`)
  }

  // ── Variants (concrete-products) ──────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['abstractSku']
    if (!productId) {
      throw new Error('listVariants requires `productId` (abstract SKU) in query params')
    }
    type ResponseShape = { data: RawSprykerConcreteProduct[] }
    const res = await this.client(credentials).get<ResponseShape>(
      `abstract-products/${String(productId)}/concrete-products`,
    )
    return (res.data ?? []).map((c) =>
      transformConcreteProduct(c, String(productId), this.currency),
    )
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    type ResponseShape = { data: RawSprykerConcreteProduct }
    const res = await this.client(credentials).get<ResponseShape>(`concrete-products/${id}`)
    return transformConcreteProduct(res.data, undefined, this.currency)
  }

  // ── Collections (category-nodes) ──────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const res = await this.client(credentials).listWithOffset<RawSprykerCategoryNode['attributes']>(
      'category-nodes',
      this.pageParams(params),
    )
    return res.items.map((item) =>
      transformCategoryNode(item as unknown as RawSprykerCategoryNode),
    )
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    type ResponseShape = { data: RawSprykerCategoryNode }
    const res = await this.client(credentials).get<ResponseShape>(`category-nodes/${id}`)
    return transformCategoryNode(res.data)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    type ResponseShape = { data: RawSprykerCategoryNode }
    const res = await this.client(credentials).post<ResponseShape>(
      'category-nodes',
      untransformCollection(data),
    )
    return transformCategoryNode(res.data)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    type ResponseShape = { data: RawSprykerCategoryNode }
    const body = untransformCollection(data) as { data: Record<string, unknown> }
    body.data['id'] = id
    const res = await this.client(credentials).patch<ResponseShape>(
      `category-nodes/${id}`,
      body,
    )
    return transformCategoryNode(res.data)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`category-nodes/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────
  // Spryker Storefront Glue API does not expose warehouse/location data.
  // Return a synthetic default location so callers can still enumerate.

  async listLocations(_credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    return [buildDefaultLocation()]
  }

  async getLocation(_credentials: Credentials, id: string): Promise<Location> {
    if (id === 'default') return buildDefaultLocation()
    throw new Error(`SprykerAdapter: location "${id}" not found — only "default" is available`)
  }

  // ── Inventory (availability) ──────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const sku = params['sku'] ?? params['variantId']
    if (!sku) {
      throw new Error('listInventoryLevels requires `sku` or `variantId` in query params')
    }
    type ResponseShape = { data: RawSprykerAvailability[] }
    const res = await this.client(credentials).get<ResponseShape>(
      `concrete-products/${String(sku)}/concrete-product-availabilities`,
    )
    return (res.data ?? []).map((a) => transformAvailability(a, String(sku)))
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // id is expected to be the concrete product SKU.
    // GET /concrete-products/{sku}/concrete-product-availabilities always returns
    // a JSON:API list response ({ data: RawSprykerAvailability[] }); take data[0].
    type ResponseShape = { data: RawSprykerAvailability[] }
    const res = await this.client(credentials).get<ResponseShape>(
      `concrete-products/${id}/concrete-product-availabilities`,
    )
    const record = (res.data ?? [])[0]
    if (!record) {
      throw new Error(`SprykerAdapter: no availability record found for SKU "${id}"`)
    }
    return transformAvailability(record, id)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    // Spryker Storefront Glue API does not expose a customer list endpoint
    // (customers can only retrieve their own record). Return empty list.
    return []
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    type CustomerResponse = { data: RawSprykerCustomer }
    type AddressResponse = { data: RawSprykerAddress[] }
    const client = this.client(credentials)
    const [customerRes, addressRes] = await Promise.all([
      client.get<CustomerResponse>(`customers/${id}`),
      client.get<AddressResponse>(`customers/${id}/addresses`).catch(() => ({ data: [] as RawSprykerAddress[] })),
    ])
    return transformCustomer(customerRes.data, addressRes.data ?? [])
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    type ResponseShape = { data: RawSprykerCustomer }
    const res = await this.client(credentials).post<ResponseShape>(
      'customers',
      untransformCustomer(data),
    )
    return transformCustomer(res.data, [])
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    type ResponseShape = { data: RawSprykerCustomer }
    const body = untransformCustomer(data) as { data: Record<string, unknown> }
    body.data['id'] = id
    const res = await this.client(credentials).patch<ResponseShape>(`customers/${id}`, body)
    return transformCustomer(res.data, [])
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`customers/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    // If customerId provided, fetch customer-scoped orders
    const customerId = params['customerId'] ?? params['customer_id']
    const path = customerId ? `customers/${String(customerId)}/orders` : 'orders'
    const res = await this.client(credentials).listWithOffset<RawSprykerOrder['attributes']>(
      path,
      this.pageParams(params),
    )
    return res.items.map((item) => transformOrder(item as unknown as RawSprykerOrder))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    type ResponseShape = { data: RawSprykerOrder }
    const res = await this.client(credentials).get<ResponseShape>(`orders/${id}`)
    return transformOrder(res.data)
  }

  // ── Refunds (returns) ─────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const res = await this.client(credentials).listWithOffset<RawSprykerReturn['attributes']>(
      'returns',
      this.pageParams(params),
    )
    return res.items.map((item) =>
      transformReturn(item as unknown as RawSprykerReturn, this.currency),
    )
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    type ResponseShape = { data: RawSprykerReturn }
    const res = await this.client(credentials).get<ResponseShape>(`returns/${id}`)
    return transformReturn(res.data, this.currency)
  }
}
