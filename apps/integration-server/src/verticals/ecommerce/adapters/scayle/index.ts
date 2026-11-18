/**
 * SCAYLE adapter for the ecommerce vertical.
 *
 * Maps the SCAYLE Admin REST API to the canonical ecommerce resources.
 *
 * Authentication: static API key sent as the `X-Access-Token` header.
 * No OAuth flow — keys are created in the SCAYLE Panel.
 *
 * Required credential fields:
 *   credentials.accessToken      → SCAYLE API key
 *   credentials.extra.tenantSpace → e.g. "acme-live"
 *   credentials.extra.shopKey     → e.g. "my-shop"   (used for category / customer / order endpoints)
 *   credentials.extra.countryCode → e.g. "DE"        (used for customer / order endpoints)
 *
 * Base URL: https://{tenantSpace}.admin.api.scayle.cloud/api/admin/v1
 *
 * Docs: https://scayle.dev/en/api-guides/admin-api
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Discount } from '../../schema/discount'

import { buildAuthUrl, exchangeCode as scayleExchangeCode } from './auth'
import { ScayleClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  MAX_LIST_PAGE_SIZE,
  MAX_ORDER_PAGE_SIZE,
  NESTED_PAGE_SIZE,
} from './constants'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  type RawScayleProduct,
  type RawScayleVariant,
  type RawScayleVariantStock,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawScayleShopCategory,
} from './transform/collection'
import { transformLocation, type RawScayleWarehouse } from './transform/location'
import {
  transformInventoryLevel,
  type RawScayleVariantStock as RawScayleStock,
} from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawScayleCustomer,
} from './transform/customer'
import { transformOrder, type RawScayleOrder, type RawScayleOrderPayment } from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawScayleShipment,
} from './transform/fulfillment'
import { transformRefund, untransformRefund, type RawScayleCancellation } from './transform/refund'
import {
  transformTransaction,
  type RawScayleOrderPayment as RawScayleTransaction,
} from './transform/transaction'
import {
  transformDiscount,
  untransformDiscount,
  type RawScaylePromotion,
} from './transform/discount'

export interface ScayleAdapterConfig {
  /**
   * Tenant space identifier, e.g. "acme-live".
   * Injected via `credentials.extra.tenantSpace` at runtime — this field is
   * only used when constructing the adapter programmatically.
   */
  tenantSpace?: string
}

export class ScayleAdapter implements EcommerceAdapter {
  readonly platform = 'scayle'
  readonly version = '0.1.0'

  constructor(_config: ScayleAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Return a generic landing page — SCAYLE uses static API keys, not OAuth.
    return buildAuthUrl('your-tenant-live')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return scayleExchangeCode()
  }

  /** SCAYLE API keys do not expire. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private client(credentials: Credentials): ScayleClient {
    return new ScayleClient(credentials)
  }

  /** Extract per-shop / per-country routing keys from credentials. */
  private shopKey(credentials: Credentials): string {
    return (credentials.extra?.['shopKey'] as string | undefined) ?? 'default'
  }

  private countryCode(credentials: Credentials): string {
    return (credentials.extra?.['countryCode'] as string | undefined) ?? 'DE'
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    // SCAYLE uses an opaque cursor string passed as the `cursor` query param.
    const cursor = params['cursor']
    if (cursor) {
      out['cursor'] = cursor
    }
    return out
  }

  /** The caller's page size, clamped to the endpoint's documented maximum. */
  private pageSize(params: QueryParams, max: number): number {
    const limit = params.limit
    return typeof limit === 'number' && Number.isFinite(limit) && limit >= 1
      ? Math.min(Math.floor(limit), max)
      : DEFAULT_PAGE_SIZE
  }

  /** Pager scope for one connection: the tenant space plus a token fingerprint. */
  private scope(credentials: Credentials): string {
    const tenant = (credentials.extra?.['tenantSpace'] as string | undefined) ?? ''
    return connectionScope(`scayle:${tenant}`, credentials)
  }

  /**
   * A caller page of a cursor endpoint where one upstream page is one caller
   * page. SCAYLE lists take `limit` and `cursor` and answer
   * `{ entities, cursor: { next } }`; `cursor.next` is "The cursor pointing to
   * the next page. If null there is no next page available." Page N is
   * reached through `cursor.next` of page N-1.
   *
   * A caller that already holds an upstream `cursor` is at a position, not a
   * page number, and gets that one page.
   */
  private async pageCursor<T>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    max: number,
  ): Promise<T[]> {
    const client = this.client(credentials)
    const size = this.pageSize(params, max)
    const fetchPage = async (cursor: string | undefined) => {
      const res = await client.listWithCursor<T>(path, {
        limit: size,
        ...(cursor ? { cursor } : {}),
      })
      return { items: res.items, next: res.nextCursor || undefined }
    }

    const explicit = params['cursor']
    let items: T[]
    let hasMore: boolean
    if (explicit) {
      const res = await fetchPage(String(explicit))
      items = res.items
      hasMore = res.next !== undefined
    } else {
      const key = cursorPagerKey(this.scope(credentials), path, { limit: size })
      ;({ items, hasMore } = await pageByCursor<T>(key, params.page, fetchPage))
    }
    const clamped = typeof params.limit === 'number' && size < params.limit
    reportUpstreamPage(params, { hasMore, ...(clamped ? { pageSize: size } : {}) })
    return items
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const items = await this.pageCursor<RawScayleProduct>(
      credentials,
      params,
      '/products',
      MAX_LIST_PAGE_SIZE,
    )
    return items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<RawScayleProduct>(`/products/${id}`)
    return transformProduct(res)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).post<RawScayleProduct>(
      '/products',
      untransformProduct(data),
    )
    return transformProduct(res)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.client(credentials).patch<RawScayleProduct>(
      `/products/${id}`,
      untransformProduct(data),
    )
    return transformProduct(res)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/products/${id}`)
  }

  // ── Variants ───────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['product_id']
    if (productId) {
      const items = await this.pageCursor<RawScayleVariant>(
        credentials,
        params,
        `/products/${String(productId)}/variants`,
        MAX_LIST_PAGE_SIZE,
      )
      return items.map((v) => transformVariant(v, String(productId)))
    }
    // Fallback: fetch products with their variants and flatten. The limit
    // counts products, not variants ("When fetching entities with children,
    // the limit always applies to the amount of parent entities"), so one
    // upstream page is not one caller page: pageByRows cuts the caller's page
    // out of the stream of variants.
    const client = this.client(credentials)
    const flatten = (products: RawScayleProduct[]): ProductVariant[] =>
      products.flatMap((p) => (p.variants ?? []).map((v) => transformVariant(v, String(p.id))))
    const explicit = params['cursor']
    const fetchPage = async (cursor: string | undefined) => {
      const res = await client.listWithCursor<RawScayleProduct>('/products', {
        limit: explicit ? this.pageSize(params, NESTED_PAGE_SIZE) : NESTED_PAGE_SIZE,
        with: 'variants',
        ...(cursor ? { cursor } : {}),
      })
      return { items: flatten(res.items), next: res.nextCursor || undefined }
    }
    if (explicit) {
      const res = await fetchPage(String(explicit))
      reportUpstreamPage(params, { hasMore: res.next !== undefined })
      return res.items
    }
    const key = cursorPagerKey(this.scope(credentials), '/products?with=variants', {
      upstreamLimit: NESTED_PAGE_SIZE,
    })
    const { items } = await pageByRows<ProductVariant>(key, params, fetchPage, {
      defaultLimit: DEFAULT_PAGE_SIZE,
    })
    return items
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // id format: `productId:variantId`
    const [productId, variantId] = id.includes(':') ? id.split(':') : [undefined, id]
    const path = productId
      ? `/products/${productId}/variants/${variantId}`
      : `/variants/${variantId}`
    const res = await this.client(credentials).get<RawScayleVariant>(path)
    return transformVariant(res, productId)
  }

  // ── Collections (ShopCategories) ───────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const shopKey = this.shopKey(credentials)
    const items = await this.pageCursor<RawScayleShopCategory>(
      credentials,
      params,
      `/shops/${shopKey}/categories`,
      MAX_LIST_PAGE_SIZE,
    )
    return items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const shopKey = this.shopKey(credentials)
    const res = await this.client(credentials).get<RawScayleShopCategory>(
      `/shops/${shopKey}/categories/${id}`,
    )
    return transformCollection(res)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const shopKey = this.shopKey(credentials)
    const res = await this.client(credentials).post<RawScayleShopCategory>(
      `/shops/${shopKey}/categories`,
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const shopKey = this.shopKey(credentials)
    const res = await this.client(credentials).patch<RawScayleShopCategory>(
      `/shops/${shopKey}/categories/${id}`,
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    const shopKey = this.shopKey(credentials)
    await this.client(credentials).delete(`/shops/${shopKey}/categories/${id}`)
  }

  // ── Locations (Warehouses) ─────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const items = await this.pageCursor<RawScayleWarehouse>(
      credentials,
      params,
      '/warehouses',
      MAX_LIST_PAGE_SIZE,
    )
    return items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<RawScayleWarehouse>(`/warehouses/${id}`)
    return transformLocation(res)
  }

  // ── Inventory (Variant Stocks) ─────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const variantId = params['variantId'] ?? params['variant_id']
    if (!variantId) {
      throw new Error(
        'listInventoryLevels requires `variantId` in query params (SCAYLE stocks are per-variant)',
      )
    }
    const res = await this.client(credentials).listWithCursor<RawScayleStock>(
      `/variants/${String(variantId)}/stocks`,
      this.listParams(params),
    )
    return res.items.map((s) => transformInventoryLevel(s, String(variantId)))
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    // SCAYLE: POST /variants/{variantId}/stocks
    const raw = await this.client(credentials).post<RawScayleVariantStock>(
      `/variants/${data.variantId}/stocks`,
      {
        warehouseReferenceKey: data.locationId,
        quantity: data.available,
      },
    )
    return transformInventoryLevel(raw as unknown as RawScayleStock, data.variantId)
  }

  // ── Customers ──────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const shopKey = this.shopKey(credentials)
    const countryCode = this.countryCode(credentials)
    const items = await this.pageCursor<RawScayleCustomer>(
      credentials,
      params,
      `/shops/${shopKey}/countries/${countryCode}/customers`,
      MAX_LIST_PAGE_SIZE,
    )
    return items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const shopKey = this.shopKey(credentials)
    const countryCode = this.countryCode(credentials)
    const res = await this.client(credentials).get<RawScayleCustomer>(
      `/shops/${shopKey}/countries/${countryCode}/customers/${id}`,
    )
    return transformCustomer(res)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const shopKey = this.shopKey(credentials)
    const countryCode = this.countryCode(credentials)
    const res = await this.client(credentials).post<RawScayleCustomer>(
      `/shops/${shopKey}/countries/${countryCode}/customers`,
      untransformCustomer(data),
    )
    return transformCustomer(res)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const shopKey = this.shopKey(credentials)
    const countryCode = this.countryCode(credentials)
    const res = await this.client(credentials).patch<RawScayleCustomer>(
      `/shops/${shopKey}/countries/${countryCode}/customers/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(res)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const shopKey = this.shopKey(credentials)
    const countryCode = this.countryCode(credentials)
    const items = await this.pageCursor<RawScayleOrder>(
      credentials,
      params,
      `/shops/${shopKey}/countries/${countryCode}/orders`,
      MAX_ORDER_PAGE_SIZE,
    )
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const shopKey = this.shopKey(credentials)
    const countryCode = this.countryCode(credentials)
    const res = await this.client(credentials).get<RawScayleOrder>(
      `/shops/${shopKey}/countries/${countryCode}/orders/${id}`,
    )
    return transformOrder(res)
  }

  // ── Fulfillments (Shipments) ───────────────────────────────────────────────

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    // SCAYLE: POST /fulfillment/shipments (no response body — shipment id is
    // synthesised from orderId + packageId).
    await this.client(credentials).post<void>(
      '/fulfillment/shipments',
      untransformFulfillment(data),
    )
    // Construct a synthetic fulfillment from the request data since SCAYLE
    // returns no body from this endpoint.
    const syntheticRaw: RawScayleShipment = {
      orderId: parseInt(data.orderId, 10) || data.orderId,
      trackingId: data.trackingNumber,
      trackingUrl: data.trackingUrl,
      items: data.lineItems?.map((li) => ({
        orderItemId: parseInt(li.lineItemId, 10) || li.lineItemId,
        quantity: li.quantity,
      })),
    }
    return transformFulfillment(syntheticRaw)
  }

  // ── Refunds (Cancellations) ─────────────────────────────────────────────────

  /**
   * SCAYLE documents no read operation for cancellations or refunds. The only
   * cancellation operation in the Admin API is `POST /fulfillment/cancellations`
   * (https://scayle.dev/open_api_specs/admin-api-latest/fulfillment_cancellations_post.json:
   * "This endpoint can be used to send a cancellation."), and the Fulfilment
   * resource lists only "Create a new shipment", "Return items" and "Send a
   * cancellation". Refuse before sending anything.
   */
  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw Object.assign(
      new Error(
        'SCAYLE cannot list refunds: the Admin API documents only "Send a cancellation" (POST /fulfillment/cancellations), with no operation to list cancellations or refunds',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async getRefund(_credentials: Credentials, _id: string): Promise<Refund> {
    throw Object.assign(
      new Error(
        'SCAYLE cannot read refunds: the Admin API documents only "Send a cancellation" (POST /fulfillment/cancellations), with no operation to read a cancellation or refund',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const res = await this.client(credentials).post<RawScayleCancellation>(
      '/cancellations',
      untransformRefund(data),
    )
    return transformRefund(res)
  }

  // ── Transactions (Order Payments) ──────────────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<import('../../schema/transaction').Transaction[]> {
    const orderId = params['orderId'] ?? params['order_id']
    if (!orderId) {
      throw new Error('listTransactions requires `orderId` in query params')
    }
    const shopKey = this.shopKey(credentials)
    const countryCode = this.countryCode(credentials)
    // Retrieve the order and extract embedded payment records.
    const order = await this.client(credentials).get<RawScayleOrder>(
      `/shops/${shopKey}/countries/${countryCode}/orders/${String(orderId)}`,
    )
    return (order.payment ?? []).map((p: RawScayleOrderPayment) =>
      transformTransaction({ ...p, orderId: order.id } as RawScayleTransaction),
    )
  }

  // ── Discounts (Promotions) ─────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const items = await this.pageCursor<RawScaylePromotion>(
      credentials,
      params,
      '/promotions',
      MAX_LIST_PAGE_SIZE,
    )
    return items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.client(credentials).get<RawScaylePromotion>(`/promotions/${id}`)
    return transformDiscount(res)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const res = await this.client(credentials).post<RawScaylePromotion>(
      '/promotions',
      untransformDiscount(data),
    )
    return transformDiscount(res)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/promotions/${id}`)
  }
}
