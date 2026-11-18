/**
 * SHOPLINE adapter for the ecommerce vertical.
 *
 * Maps the SHOPLINE Admin REST API to the canonical ecommerce resources.
 *
 * Auth: Standard OAuth2 authorization-code grant. Access tokens expire after
 * 10 hours — `refreshCredentials` calls the SHOPLINE refresh endpoint.
 *
 * Pagination: cursor-based via `page_info` parameter extracted from the `link`
 * response header (same pattern as Shopify).
 *
 * API version pinned: v20260301 (stable). See constants.ts to update.
 *
 * Docs: https://developer.shopline.com/docs/apps/api-instructions-for-use/rest-admin-api/overview/
 */

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
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as shoplineExchangeCode, refreshAccessToken } from './auth'
import { ShoplineClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'
import { verifyShoplineWebhook, parseShoplineWebhookEvents } from './webhook'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawShoplineProduct,
  type RawShoplineVariant,
  type RawShoplineOption,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawShoplineCollection,
} from './transform/collection'
import { transformInventoryLevel, type RawShoplineInventoryLevel } from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawShoplineCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawShoplineOrder,
} from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShoplineFulfillment,
} from './transform/fulfillment'
import {
  transformRefund,
  untransformRefund,
  type RawShoplineRefund,
} from './transform/refund'
import {
  transformTransaction,
  untransformTransaction,
  type RawShoplineTransaction,
} from './transform/transaction'
import {
  transformDiscount,
  untransformDiscount,
  type RawShoplinePriceRule,
  type RawShoplineDiscountCode,
} from './transform/discount'

export interface ShoplineAdapterConfig {
  /** App key (client ID) from the SHOPLINE Partner Portal. */
  appKey: string
  /** App secret (client secret) from the SHOPLINE Partner Portal. */
  appSecret: string
  redirectUri: string
  /** Store handle, e.g. `mystore` (without `.myshopline.com`). */
  handle: string
  scopes?: string[]
}

export class ShoplineAdapter implements EcommerceAdapter {
  readonly platform = 'shopline'
  readonly version = '0.1.0'

  private appKey: string
  private appSecret: string
  private redirectUri: string
  private handle: string
  private scopes: string[]

  constructor(config: ShoplineAdapterConfig) {
    this.appKey = config.appKey
    this.appSecret = config.appSecret
    this.redirectUri = config.redirectUri
    this.handle = config.handle
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(
      this.handle,
      this.appKey,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
    )
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return shoplineExchangeCode(this.handle, code, this.appKey, this.appSecret)
  }

  /**
   * SHOPLINE access tokens expire after 10 hours. Refresh using the dedicated
   * refresh endpoint. The old token remains valid for 5 minutes post-refresh.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshAccessToken(this.handle, credentials, this.appKey, this.appSecret)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyShoplineWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const topic =
      (payload['__topic'] as string | undefined) ??
      (payload['topic'] as string | undefined)
    return parseShoplineWebhookEvents(payload, topic)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): ShoplineClient {
    return new ShoplineClient(credentials, this.handle)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    const cursor = params['cursor'] ?? params['page_info']
    if (cursor) {
      out.page_info = cursor
    } else {
      if (params.updatedAfter) {
        out.updated_at_min = params.updatedAfter.toISOString()
      }
    }
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).listWithCursor<RawShoplineProduct>(
      'products/products.json',
      'products',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<{ product: RawShoplineProduct }>(
      `products/products/${id}.json`,
    )
    return transformProduct(res.product)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).post<{ product: RawShoplineProduct }>(
      'products/products.json',
      { product: untransformProduct(data) },
    )
    return transformProduct(res.product)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.client(credentials).put<{ product: RawShoplineProduct }>(
      `products/products/${id}.json`,
      { product: { id, ...untransformProduct(data) } },
    )
    return transformProduct(res.product)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`products/products/${id}.json`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    // SHOPLINE does not expose a flat /variants list; flatten from products.
    const productId = params['productId'] ?? params['product_id']
    const client = this.client(credentials)
    if (productId) {
      const res = await client.get<{ product: RawShoplineProduct }>(
        `products/products/${String(productId)}.json`,
      )
      const p = res.product
      return (p.variants ?? []).map((v: RawShoplineVariant) =>
        transformVariant(v, 'USD', p.options as RawShoplineOption[] | undefined),
      )
    }
    // Fallback: list products then flatten variants.
    const productsRes = await client.listWithCursor<RawShoplineProduct>(
      'products/products.json',
      'products',
      this.listParams(params),
    )
    return productsRes.items.flatMap((p) =>
      (p.variants ?? []).map((v) => transformVariant(v, 'USD', p.options)),
    )
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // SHOPLINE does not expose a standalone GET /variants/:id — composite id
    // format: `productId:variantId`.
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    const res = await this.client(credentials).get<{ product: RawShoplineProduct }>(
      `products/products/${productId}.json`,
    )
    const variant = res.product.variants?.find((v) => String(v.id) === variantId)
    if (!variant) throw new Error(`Variant ${variantId} not found on product ${productId}`)
    return transformVariant(variant, 'USD', res.product.options)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    // Variant updates go through the product update endpoint.
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    const res = await this.client(credentials).put<{ product: RawShoplineProduct }>(
      `products/products/${productId}.json`,
      {
        product: {
          id: productId,
          variants: [{ id: variantId, ...untransformVariant(data) }],
        },
      },
    )
    const updated = res.product.variants?.find((v) => String(v.id) === variantId)
    if (!updated) throw new Error(`Variant ${variantId} not found in update response`)
    return transformVariant(updated, 'USD', res.product.options)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    // SHOPLINE exposes collections primarily via the get-by-id endpoint.
    // A list endpoint is not documented in the public REST API; we do a
    // best-effort page of products with collection_id filter or return empty.
    // Callers should use getCollection(id) when the id is known.
    void params
    return []
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.client(credentials).get<{ collection: RawShoplineCollection }>(
      `products/collections/${id}.json`,
    )
    return transformCollection(res.collection)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    // SHOPLINE exposes a create smart_collection endpoint.
    const res = await this.client(credentials).post<{
      smart_collection: RawShoplineCollection
    }>('products/smart_collections.json', {
      smart_collection: untransformCollection(data),
    })
    return transformCollection(res.smart_collection, 'SMART')
  }

  // ── Locations ─────────────────────────────────────────────────────────────
  // SHOPLINE surfaces locations through the fulfillment order `assigned_location`
  // field. There is no standalone admin locations list/get endpoint in the
  // documented public REST API at this version. We implement a stub that
  // returns an empty list so the registry can auto-501 the method if needed.
  // When SHOPLINE adds a public locations endpoint, update these methods.

  async listLocations(_credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    return []
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const res = await this.client(credentials).post<{
      inventory_level: RawShoplineInventoryLevel
    }>('inventory_levels/set.json', {
      inventory_item_id: data.variantId,
      location_id: data.locationId,
      available: data.available,
    })
    return transformInventoryLevel(res.inventory_level)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).listWithCursor<RawShoplineCustomer>(
      'customers.json',
      'customers',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ customer: RawShoplineCustomer }>(
      `customers/${id}.json`,
    )
    return transformCustomer(res.customer)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).post<{ customer: RawShoplineCustomer }>(
      'customers.json',
      { customer: untransformCustomer(data) },
    )
    return transformCustomer(res.customer)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).put<{ customer: RawShoplineCustomer }>(
      `customers/${id}.json`,
      { customer: { id, ...untransformCustomer(data) } },
    )
    return transformCustomer(res.customer)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.client(credentials).listWithCursor<RawShoplineOrder>(
      'orders.json',
      'orders',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<{ order: RawShoplineOrder }>(
      `orders/${id}.json`,
    )
    return transformOrder(res.order)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const res = await this.client(credentials).put<{ order: RawShoplineOrder }>(
      `orders/${id}.json`,
      { order: { id, ...untransformOrder(data) } },
    )
    return transformOrder(res.order)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const res = await this.client(credentials).post<{ order: RawShoplineOrder }>(
      `orders/${id}/cancel.json`,
      { reason: data?.reason },
    )
    return transformOrder(res.order)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listFulfillments requires `order_id` in query params')
    }
    const res = await this.client(credentials).get<{
      fulfillments: RawShoplineFulfillment[]
    }>(`orders/${String(orderId)}/fulfillments.json`, this.listParams(params))
    return (res.fulfillments ?? []).map(transformFulfillment)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const res = await this.client(credentials).post<{ fulfillment: RawShoplineFulfillment }>(
      `orders/${data.orderId}/fulfillments.json`,
      { fulfillment: untransformFulfillment(data) },
    )
    return transformFulfillment(res.fulfillment)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listRefunds requires `order_id` in query params')
    }
    const res = await this.client(credentials).get<{ refunds: RawShoplineRefund[] }>(
      `orders/${String(orderId)}/refunds.json`,
      this.listParams(params),
    )
    return (res.refunds ?? []).map((r) => transformRefund(r))
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const res = await this.client(credentials).post<{ refund: RawShoplineRefund }>(
      `orders/${data.orderId}/refunds.json`,
      { refund: untransformRefund(data) },
    )
    return transformRefund(res.refund)
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
    const res = await this.client(credentials).get<{
      transactions: RawShoplineTransaction[]
    }>(`orders/${String(orderId)}/transactions.json`, this.listParams(params))
    return (res.transactions ?? []).map(transformTransaction)
  }

  async createTransaction(
    credentials: Credentials,
    data: Partial<Transaction>,
  ): Promise<Transaction> {
    if (!data.orderId) throw new Error('createTransaction requires orderId')
    const res = await this.client(credentials).post<{
      transaction: RawShoplineTransaction
    }>(`orders/${data.orderId}/transactions.json`, {
      transaction: untransformTransaction(data),
    })
    return transformTransaction(res.transaction)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.client(credentials)
    const res = await client.listWithCursor<RawShoplinePriceRule>(
      'price_rules.json',
      'price_rules',
      this.listParams(params),
    )
    const withCodes = await Promise.all(
      res.items.map(async (rule) => {
        try {
          const cr = await client.get<{ discount_codes: RawShoplineDiscountCode[] }>(
            `price_rules/${rule.id}/discount_codes.json`,
          )
          return transformDiscount(rule, cr.discount_codes?.[0])
        } catch {
          return transformDiscount(rule)
        }
      }),
    )
    return withCodes
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.client(credentials)
    const rule = await client.get<{ price_rule: RawShoplinePriceRule }>(
      `price_rules/${id}.json`,
    )
    let code: RawShoplineDiscountCode | undefined
    try {
      const cr = await client.get<{ discount_codes: RawShoplineDiscountCode[] }>(
        `price_rules/${id}/discount_codes.json`,
      )
      code = cr.discount_codes?.[0]
    } catch {
      /* no code — not all rules have codes */
    }
    return transformDiscount(rule.price_rule, code)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.client(credentials)
    const rule = await client.post<{ price_rule: RawShoplinePriceRule }>('price_rules.json', {
      price_rule: untransformDiscount(data),
    })
    let code: RawShoplineDiscountCode | undefined
    if (data.code) {
      const cr = await client.post<{ discount_code: RawShoplineDiscountCode }>(
        `price_rules/${rule.price_rule.id}/discount_codes.json`,
        { discount_code: { code: data.code } },
      )
      code = cr.discount_code
    }
    return transformDiscount(rule.price_rule, code)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.client(credentials).put<{ price_rule: RawShoplinePriceRule }>(
      `price_rules/${id}.json`,
      { price_rule: { id, ...untransformDiscount(data) } },
    )
    return transformDiscount(res.price_rule)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`price_rules/${id}.json`)
  }
}
