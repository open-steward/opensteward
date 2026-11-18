/**
 * Shopgate adapter for the ecommerce vertical.
 *
 * Maps the Shopgate Omnichannel REST API (Catalog, Order, Customer, Location
 * services) to the canonical ecommerce resources.
 *
 * Authentication:
 *   Shopgate uses an OAuth2 password grant (custom "ShopgateCredentials" grant
 *   type). Credentials require clientId, clientSecret, merchantCode, username,
 *   and password. Access tokens expire (~1 h) and are refreshed automatically
 *   via `refreshCredentials`.
 *
 * Supported resources:
 *   Products, Variants, Collections (categories), Locations, InventoryLevels,
 *   Customers, Orders, Fulfillments (fulfillmentOrders), Refunds (returnOrders).
 *
 * Unsupported resources (no Shopgate Omnichannel API equivalents):
 *   Transactions, Discounts — these return 501 automatically.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: discount — Shopgate Omnichannel API has no discount/coupon/promo-code resource; discounts appear only as a scalar `discountAmount` field on orders
 * Unavailable: transaction — Shopgate Omnichannel API has no payment-transaction resource; payment processing is handled outside the API
 *
 * API base URL:
 *   https://{service}.shopgate{envSuffix}.io/v1/merchants/{merchantCode}/{path}
 *
 * Docs: https://docs.shopgate.com/docs/retail-red
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'

import { fetchToken, refreshToken } from './auth'
import { ShopgateClient } from './client'
import { SERVICES, ENVS, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import type { ServiceName } from './constants'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawShopgateProduct,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawShopgateCategory,
} from './transform/collection'
import { transformLocation, type RawShopgateLocation } from './transform/location'
import {
  transformInventoryLevel,
  type RawShopgateInventory,
} from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawShopgateCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawShopgateOrder,
} from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShopgateFulfillmentOrder,
} from './transform/fulfillment'
import {
  transformRefund,
  untransformRefund,
  type RawShopgateReturnOrder,
} from './transform/refund'

export interface ShopgateAdapterConfig {
  /** OAuth2 application client id (from Shopgate Admin). */
  clientId: string
  /** OAuth2 application client secret. */
  clientSecret: string
  /** Shopgate merchant code (e.g. "TM2"). */
  merchantCode: string
  /** API-Credentials user email in Shopgate Admin. */
  username: string
  /** API-Credentials user password. */
  password: string
  /**
   * Deployment environment.
   *  - `""` (default) → production: *.shopgate.io
   *  - `"pg"`         → staging:    *.shopgatepg.io
   *  - `"dev"`        → dev:        *.shopgatedev.io
   */
  env?: string
}

export class ShopgateAdapter implements EcommerceAdapter {
  readonly platform = 'shopgate'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private merchantCode: string
  private username: string
  private password: string
  private envSuffix: string

  constructor(config: ShopgateAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.merchantCode = config.merchantCode
    this.username = config.username
    this.password = config.password
    this.envSuffix = config.env ?? ENVS.production
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * Shopgate uses a password grant — there is no browser redirect. This
   * returns an informational URL pointing to the Shopgate Admin credentials
   * page; the real token is obtained via `exchangeCode`.
   */
  getAuthUrl(_state: string): string {
    return `https://next.shopgate.com/settings/api-credentials`
  }

  /**
   * Obtain an access token using the configured credentials (password grant).
   * The `code` parameter is ignored — credentials come from the constructor.
   */
  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return fetchToken(
      this.clientId,
      this.clientSecret,
      this.merchantCode,
      this.username,
      this.password,
      this.envSuffix,
    )
  }

  /** Re-fetch a fresh token when the current one expires. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshToken(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): ShopgateClient {
    return new ShopgateClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      offset: (params['offset'] as number | undefined) ?? 0,
    }
    if (params.updatedAfter) {
      out['updatedSince'] = params.updatedAfter.toISOString()
    }
    return out
  }

  /**
   * One caller page of an offset-paged Shopgate list route.
   *
   * Every documented list route takes `limit` + `offset` ("The offset where
   * to start the page") and answers `meta: { limit, offset, totalItemCount }`.
   * The size sent is clamped at MAX_PAGE_SIZE (100, the order and location
   * services' maximum; catalog and customer allow 1000), and the offset
   * strides by that size, so a clamped page reports it as `pageSize`.
   */
  private async listOffsetPage<T>(
    credentials: Credentials,
    service: ServiceName,
    path: string,
    params: QueryParams,
    filters: Record<string, unknown> = {},
  ): Promise<T[]> {
    const asked = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const size = Number.isFinite(asked)
      ? Math.min(Math.max(1, Math.floor(asked)), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE
    const offset = pageOffset(params, size)
    const query: Record<string, unknown> = { limit: size, offset }
    if (params.updatedAfter) {
      query['updatedSince'] = params.updatedAfter.toISOString()
    }
    Object.assign(query, filters)

    const res = await this.client(credentials).listWithOffset<T>(service, path, path, query)
    const total = res.total
    const hasMore =
      total != null
        ? offset + res.items.length < total
        : res.items.length < size
          ? false
          : undefined
    reportUpstreamPage(params, {
      ...(hasMore !== undefined ? { hasMore } : {}),
      ...(total != null ? { totalCount: total } : {}),
      pageSize: size,
    })
    return res.items
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const rows = await this.listOffsetPage<RawShopgateProduct>(
      credentials,
      SERVICES.catalog,
      'products',
      params,
    )
    return rows.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<{ product: RawShopgateProduct }>(
      SERVICES.catalog,
      `products/${id}`,
    )
    return transformProduct(res.product)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).post<{ product: RawShopgateProduct }>(
      SERVICES.catalog,
      'products',
      { products: [untransformProduct(data)] },
    )
    // Batch create returns the first product.
    const raw = Array.isArray((res as unknown as Record<string, unknown>)['products'])
      ? ((res as unknown as Record<string, unknown>)['products'] as RawShopgateProduct[])[0]!
      : (res as unknown as { product: RawShopgateProduct }).product
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    await this.client(credentials).post<unknown>(
      SERVICES.catalog,
      `products/${id}`,
      untransformProduct(data),
    )
    return this.getProduct(credentials, id)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(SERVICES.catalog, `products/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['product_id']
    if (productId) {
      const res = await this.client(credentials).get<{ product: RawShopgateProduct }>(
        SERVICES.catalog,
        `products/${String(productId)}`,
      )
      return (res.product.variants ?? []).map((v) =>
        transformVariant({ ...v, productCode: String(productId) }),
      )
    }
    // Fallback: list all products and flatten variants.
    const res = await this.client(credentials).listWithOffset<RawShopgateProduct>(
      SERVICES.catalog,
      'products',
      'products',
      this.listParams(params),
    )
    return res.items.flatMap((p) =>
      (p.variants ?? []).map((v) => transformVariant({ ...v, productCode: p.code })),
    )
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Composite id: `productCode:variantCode`
    const sep = id.indexOf(':')
    const productCode = sep >= 0 ? id.slice(0, sep) : id
    const variantCode = sep >= 0 ? id.slice(sep + 1) : id
    const res = await this.client(credentials).get<{ product: RawShopgateProduct }>(
      SERVICES.catalog,
      `products/${productCode}`,
    )
    const variant = (res.product.variants ?? []).find((v) => v.code === variantCode)
    if (!variant) throw new Error(`Shopgate: variant ${variantCode} not found on product ${productCode}`)
    return transformVariant({ ...variant, productCode })
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const sep = id.indexOf(':')
    const productCode = sep >= 0 ? id.slice(0, sep) : (data.productId ?? id)
    const variantCode = sep >= 0 ? id.slice(sep + 1) : id
    await this.client(credentials).post<unknown>(
      SERVICES.catalog,
      `products/${productCode}/variants/${variantCode}`,
      untransformVariant(data),
    )
    return this.getVariant(credentials, `${productCode}:${variantCode}`)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const rows = await this.listOffsetPage<RawShopgateCategory>(
      credentials,
      SERVICES.catalog,
      'categories',
      params,
    )
    return rows.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.client(credentials).get<{ category: RawShopgateCategory }>(
      SERVICES.catalog,
      `categories/${id}`,
    )
    return transformCollection(res.category)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).post<{ categories: RawShopgateCategory[] }>(
      SERVICES.catalog,
      'categories',
      { categories: [untransformCollection(data)] },
    )
    const raw = res.categories?.[0]
    if (!raw) throw new Error('Shopgate createCollection: no category returned')
    return transformCollection(raw)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    await this.client(credentials).post<unknown>(
      SERVICES.catalog,
      `categories/${id}`,
      untransformCollection(data),
    )
    return this.getCollection(credentials, id)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(SERVICES.catalog, `categories/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const rows = await this.listOffsetPage<RawShopgateLocation>(
      credentials,
      SERVICES.location,
      'locations',
      params,
    )
    return rows.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<{ location: RawShopgateLocation }>(
      SERVICES.location,
      `locations/${id}`,
    )
    return transformLocation(res.location)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const extra: Record<string, unknown> = {}
    const locationCode = params['locationCode'] ?? params['location_id'] ?? params['locationId']
    const productCode = params['productCode'] ?? params['product_id'] ?? params['productId']
    if (locationCode) extra['locationCode'] = locationCode
    if (productCode) extra['productCode'] = productCode

    const rows = await this.listOffsetPage<RawShopgateInventory>(
      credentials,
      SERVICES.catalog,
      'inventories',
      params,
      extra,
    )
    return rows.map(transformInventoryLevel)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const sep = data.variantId.indexOf(':')
    const productCode = sep >= 0 ? data.variantId.slice(0, sep) : data.variantId
    const variantCode = sep >= 0 ? data.variantId.slice(sep + 1) : undefined

    const patch: Record<string, unknown> = {
      productCode,
      locationCode: data.locationId,
      available: { increment: data.delta },
    }
    if (variantCode) patch['variantCode'] = variantCode

    const res = await this.client(credentials).patch<{ inventories: RawShopgateInventory[] }>(
      SERVICES.catalog,
      'inventories',
      { inventories: [patch] },
    )
    const raw = res.inventories?.[0]
    if (!raw) throw new Error('Shopgate adjustInventoryLevel: no inventory returned')
    return transformInventoryLevel(raw)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const sep = data.variantId.indexOf(':')
    const productCode = sep >= 0 ? data.variantId.slice(0, sep) : data.variantId
    const variantCode = sep >= 0 ? data.variantId.slice(sep + 1) : undefined

    const inv: Record<string, unknown> = {
      productCode,
      locationCode: data.locationId,
      available: data.available,
    }
    if (variantCode) inv['variantCode'] = variantCode

    const res = await this.client(credentials).post<{ inventories: RawShopgateInventory[] }>(
      SERVICES.catalog,
      'inventories',
      { inventories: [inv] },
    )
    const raw = res.inventories?.[0]
    if (!raw) throw new Error('Shopgate setInventoryLevel: no inventory returned')
    return transformInventoryLevel(raw)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await this.listOffsetPage<RawShopgateCustomer>(
      credentials,
      SERVICES.customer,
      'customers',
      params,
    )
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ customer: RawShopgateCustomer }>(
      SERVICES.customer,
      `customers/${id}`,
    )
    return transformCustomer(res.customer)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).post<{ customers: RawShopgateCustomer[] }>(
      SERVICES.customer,
      'customers',
      { customers: [untransformCustomer(data)] },
    )
    const raw = res.customers?.[0]
    if (!raw) throw new Error('Shopgate createCustomer: no customer returned')
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    await this.client(credentials).post<unknown>(
      SERVICES.customer,
      `customers/${id}`,
      untransformCustomer(data),
    )
    return this.getCustomer(credentials, id)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(SERVICES.customer, `customers/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const rows = await this.listOffsetPage<RawShopgateOrder>(
      credentials,
      SERVICES.order,
      'orders',
      params,
    )
    return rows.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<{ order: RawShopgateOrder }>(
      SERVICES.order,
      `orders/${id}`,
    )
    return transformOrder(res.order)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).post<{ orders: RawShopgateOrder[] }>(
      SERVICES.order,
      'orders',
      { orders: [untransformOrder(data)] },
    )
    const raw = res.orders?.[0]
    if (!raw) throw new Error('Shopgate createOrder: no order returned')
    return transformOrder(raw)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    await this.client(credentials).post<unknown>(
      SERVICES.order,
      `orders/${id}`,
      untransformOrder(data),
    )
    return this.getOrder(credentials, id)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    await this.client(credentials).post<unknown>(
      SERVICES.order,
      `orders/${id}`,
      { status: 'cancelled', cancelReason: data?.reason },
    )
    return this.getOrder(credentials, id)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const rows = await this.listOffsetPage<RawShopgateFulfillmentOrder>(
      credentials,
      SERVICES.order,
      'fulfillmentOrders',
      params,
    )
    return rows.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const res = await this.client(credentials).get<{
      fulfillmentOrder: RawShopgateFulfillmentOrder
    }>(SERVICES.order, `fulfillmentOrders/${id}`)
    return transformFulfillment(res.fulfillmentOrder)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const res = await this.client(credentials).post<{
      fulfillmentOrders: RawShopgateFulfillmentOrder[]
    }>(SERVICES.order, 'fulfillmentOrders', {
      fulfillmentOrders: [untransformFulfillment(data)],
    })
    const raw = res.fulfillmentOrders?.[0]
    if (!raw) throw new Error('Shopgate createFulfillment: no fulfillment order returned')
    return transformFulfillment(raw)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    await this.client(credentials).post<unknown>(
      SERVICES.order,
      `fulfillmentOrders/${id}`,
      untransformFulfillment(data),
    )
    return this.getFulfillment(credentials, id)
  }

  async cancelFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    await this.client(credentials).post<unknown>(
      SERVICES.order,
      `fulfillmentOrders/${id}`,
      { status: 'cancelled' },
    )
    return this.getFulfillment(credentials, id)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = params['order_id'] ?? params['orderId']
    const extra: Record<string, unknown> = {}
    if (orderId) extra['salesOrderNumber'] = String(orderId)

    const rows = await this.listOffsetPage<RawShopgateReturnOrder>(
      credentials,
      SERVICES.order,
      'returnOrders',
      params,
      extra,
    )
    return rows.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<{
      returnOrder: RawShopgateReturnOrder
    }>(SERVICES.order, `returnOrders/${id}`)
    return transformRefund(res.returnOrder)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{
      returnOrders: RawShopgateReturnOrder[]
    }>(SERVICES.order, 'returnOrders', {
      returnOrders: [untransformRefund(data)],
    })
    const raw = res.returnOrders?.[0]
    if (!raw) throw new Error('Shopgate createRefund: no return order returned')
    return transformRefund(raw)
  }
}
