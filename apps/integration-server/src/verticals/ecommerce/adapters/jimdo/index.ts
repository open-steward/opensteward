/**
 * Shopify adapter for the ecommerce vertical.
 *
 * Maps the Shopify Admin REST API to the canonical ecommerce resources.
 * Tokens issued by Shopify's OAuth install flow are long-lived offline
 * tokens — `refreshCredentials` is a no-op.
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

import { buildAuthUrl, exchangeCode as shopifyExchangeCode } from './auth'
import { ShopifyClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'
import { verifyShopifyWebhook, parseShopifyWebhookEvents } from './webhook'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawShopifyProduct,
  type RawShopifyVariant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawShopifyCollection,
} from './transform/collection'
import { transformLocation, type RawShopifyLocation } from './transform/location'
import {
  transformInventoryLevel,
  type RawShopifyInventoryLevel,
} from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawShopifyCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawShopifyOrder,
} from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShopifyFulfillment,
} from './transform/fulfillment'
import {
  transformRefund,
  untransformRefund,
  type RawShopifyRefund,
} from './transform/refund'
import {
  transformTransaction,
  untransformTransaction,
  type RawShopifyTransaction,
} from './transform/transaction'
import {
  transformDiscount,
  untransformDiscount,
  type RawShopifyPriceRule,
  type RawShopifyDiscountCode,
} from './transform/discount'

export interface JimdoAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** Store subdomain, e.g. `mystore` (not `mystore.myshopify.com`). */
  shop: string
  scopes?: string[]
}

export class JimdoAdapter implements EcommerceAdapter {
  readonly platform = 'jimdo'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private shop: string
  private scopes: string[]

  constructor(config: JimdoAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.shop = config.shop
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.shop, this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return shopifyExchangeCode(this.shop, code, this.clientId, this.clientSecret)
  }

  /**
   * Shopify offline access tokens are long-lived and do not rotate. The
   * shared `isTokenExpired` helper treats credentials without `expiresAt`
   * as non-expiring, so returning them unchanged here is correct.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyShopifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const topic =
      (payload['__topic'] as string | undefined) ??
      (payload['topic'] as string | undefined)
    return parseShopifyWebhookEvents(payload, topic)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): ShopifyClient {
    return new ShopifyClient(credentials, this.shop)
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
    const res = await this.client(credentials).listWithCursor<RawShopifyProduct>(
      'products.json',
      'products',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<{ product: RawShopifyProduct }>(
      `products/${id}.json`,
    )
    return transformProduct(res.product)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).post<{ product: RawShopifyProduct }>(
      'products.json',
      { product: untransformProduct(data) },
    )
    return transformProduct(res.product)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.client(credentials).put<{ product: RawShopifyProduct }>(
      `products/${id}.json`,
      { product: { id, ...untransformProduct(data) } },
    )
    return transformProduct(res.product)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`products/${id}.json`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    // If a product id is supplied, scope the list to that product (Shopify
    // does not expose an unscoped `/variants.json` list endpoint).
    const productId = params['productId'] ?? params['product_id']
    const client = this.client(credentials)
    if (productId) {
      const res = await client.get<{ variants: RawShopifyVariant[] }>(
        `products/${String(productId)}/variants.json`,
        this.listParams(params),
      )
      return (res.variants ?? []).map((v) => transformVariant(v))
    }
    // Fallback: fetch products then flatten variants.
    const productsRes = await client.listWithCursor<RawShopifyProduct>(
      'products.json',
      'products',
      this.listParams(params),
    )
    return productsRes.items.flatMap((p) =>
      (p.variants ?? []).map((v) => transformVariant(v, 'USD', p.options)),
    )
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const res = await this.client(credentials).get<{ variant: RawShopifyVariant }>(
      `variants/${id}.json`,
    )
    return transformVariant(res.variant)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const res = await this.client(credentials).put<{ variant: RawShopifyVariant }>(
      `variants/${id}.json`,
      { variant: { id, ...untransformVariant(data) } },
    )
    return transformVariant(res.variant)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const client = this.client(credentials)
    const [custom, smart] = await Promise.all([
      client.listWithCursor<RawShopifyCollection>(
        'custom_collections.json',
        'custom_collections',
        this.listParams(params),
      ),
      client.listWithCursor<RawShopifyCollection>(
        'smart_collections.json',
        'smart_collections',
        this.listParams(params),
      ),
    ])
    return [
      ...custom.items.map((c) => transformCollection(c, 'MANUAL')),
      ...smart.items.map((c) => transformCollection(c, 'SMART')),
    ]
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    // Try custom first; fall back to smart.
    const client = this.client(credentials)
    try {
      const res = await client.get<{ custom_collection: RawShopifyCollection }>(
        `custom_collections/${id}.json`,
      )
      return transformCollection(res.custom_collection, 'MANUAL')
    } catch {
      const res = await client.get<{ smart_collection: RawShopifyCollection }>(
        `smart_collections/${id}.json`,
      )
      return transformCollection(res.smart_collection, 'SMART')
    }
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    // Only manual (custom) collections are creatable via the REST API.
    const res = await this.client(credentials).post<{
      custom_collection: RawShopifyCollection
    }>('custom_collections.json', { custom_collection: untransformCollection(data) })
    return transformCollection(res.custom_collection, 'MANUAL')
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).put<{
      custom_collection: RawShopifyCollection
    }>(`custom_collections/${id}.json`, {
      custom_collection: { id, ...untransformCollection(data) },
    })
    return transformCollection(res.custom_collection, 'MANUAL')
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`custom_collections/${id}.json`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<{ locations: RawShopifyLocation[] }>(
      'locations.json',
    )
    return (res.locations ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<{ location: RawShopifyLocation }>(
      `locations/${id}.json`,
    )
    return transformLocation(res.location)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const locationIds = params['location_ids'] ?? params['locationIds']
    const inventoryItemIds = params['inventory_item_ids'] ?? params['inventoryItemIds']
    // Shopify requires at least one of location_ids or inventory_item_ids.
    if (!locationIds && !inventoryItemIds) {
      throw new Error(
        'listInventoryLevels requires `location_ids` or `inventory_item_ids` in query params',
      )
    }
    const extra: Record<string, unknown> = this.listParams(params)
    if (locationIds) extra.location_ids = locationIds
    if (inventoryItemIds) extra.inventory_item_ids = inventoryItemIds
    const res = await this.client(credentials).get<{
      inventory_levels: RawShopifyInventoryLevel[]
    }>('inventory_levels.json', extra)
    return (res.inventory_levels ?? []).map(transformInventoryLevel)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    // `variantId` here is really the inventory_item_id — this matches the
    // transform layer which uses the item id in place of the variant id.
    const res = await this.client(credentials).post<{
      inventory_level: RawShopifyInventoryLevel
    }>('inventory_levels/adjust.json', {
      inventory_item_id: data.variantId,
      location_id: data.locationId,
      available_adjustment: data.delta,
    })
    return transformInventoryLevel(res.inventory_level)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const res = await this.client(credentials).post<{
      inventory_level: RawShopifyInventoryLevel
    }>('inventory_levels/set.json', {
      inventory_item_id: data.variantId,
      location_id: data.locationId,
      available: data.available,
    })
    return transformInventoryLevel(res.inventory_level)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).listWithCursor<RawShopifyCustomer>(
      'customers.json',
      'customers',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ customer: RawShopifyCustomer }>(
      `customers/${id}.json`,
    )
    return transformCustomer(res.customer)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).post<{ customer: RawShopifyCustomer }>(
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
    const res = await this.client(credentials).put<{ customer: RawShopifyCustomer }>(
      `customers/${id}.json`,
      { customer: { id, ...untransformCustomer(data) } },
    )
    return transformCustomer(res.customer)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`customers/${id}.json`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const extra: Record<string, unknown> = { ...this.listParams(params), status: 'any' }
    const res = await this.client(credentials).listWithCursor<RawShopifyOrder>(
      'orders.json',
      'orders',
      extra,
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<{ order: RawShopifyOrder }>(
      `orders/${id}.json`,
    )
    return transformOrder(res.order)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).post<{ order: RawShopifyOrder }>(
      'orders.json',
      { order: untransformOrder(data) },
    )
    return transformOrder(res.order)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const res = await this.client(credentials).put<{ order: RawShopifyOrder }>(
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
    const res = await this.client(credentials).post<{ order: RawShopifyOrder }>(
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
      fulfillments: RawShopifyFulfillment[]
    }>(`orders/${String(orderId)}/fulfillments.json`, this.listParams(params))
    return (res.fulfillments ?? []).map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const res = await this.client(credentials).get<{ fulfillment: RawShopifyFulfillment }>(
      `fulfillments/${id}.json`,
    )
    return transformFulfillment(res.fulfillment)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const res = await this.client(credentials).post<{ fulfillment: RawShopifyFulfillment }>(
      'fulfillments.json',
      {
        fulfillment: {
          ...untransformFulfillment(data),
          line_items_by_fulfillment_order: [
            // The caller should provide platform-specific details in metadata
            // for nontrivial cases; this is a minimal default.
          ],
        },
      },
    )
    return transformFulfillment(res.fulfillment)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const res = await this.client(credentials).post<{ fulfillment: RawShopifyFulfillment }>(
      `fulfillments/${id}/update_tracking.json`,
      {
        fulfillment: {
          notify_customer: data.notifyCustomer,
          tracking_info: {
            number: data.trackingNumber,
            url: data.trackingUrl,
            company: data.carrier,
          },
        },
      },
    )
    return transformFulfillment(res.fulfillment)
  }

  async cancelFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const res = await this.client(credentials).post<{ fulfillment: RawShopifyFulfillment }>(
      `fulfillments/${id}/cancel.json`,
    )
    return transformFulfillment(res.fulfillment)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listRefunds requires `order_id` in query params')
    }
    const res = await this.client(credentials).get<{ refunds: RawShopifyRefund[] }>(
      `orders/${String(orderId)}/refunds.json`,
      this.listParams(params),
    )
    return (res.refunds ?? []).map((r) => transformRefund(r))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // Composite id format: `orderId:refundId`
    const [orderId, refundId] = id.split(':')
    if (!orderId || !refundId) {
      throw new Error('Invalid refund id format: expected `orderId:refundId`')
    }
    const res = await this.client(credentials).get<{ refund: RawShopifyRefund }>(
      `orders/${orderId}/refunds/${refundId}.json`,
    )
    return transformRefund(res.refund)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const res = await this.client(credentials).post<{ refund: RawShopifyRefund }>(
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
      transactions: RawShopifyTransaction[]
    }>(`orders/${String(orderId)}/transactions.json`, this.listParams(params))
    return (res.transactions ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const [orderId, txId] = id.split(':')
    if (!orderId || !txId) {
      throw new Error('Invalid transaction id format: expected `orderId:transactionId`')
    }
    const res = await this.client(credentials).get<{
      transaction: RawShopifyTransaction
    }>(`orders/${orderId}/transactions/${txId}.json`)
    return transformTransaction(res.transaction)
  }

  async createTransaction(
    credentials: Credentials,
    data: Partial<Transaction>,
  ): Promise<Transaction> {
    if (!data.orderId) throw new Error('createTransaction requires orderId')
    const res = await this.client(credentials).post<{
      transaction: RawShopifyTransaction
    }>(`orders/${data.orderId}/transactions.json`, {
      transaction: untransformTransaction(data),
    })
    return transformTransaction(res.transaction)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.client(credentials)
    const res = await client.listWithCursor<RawShopifyPriceRule>(
      'price_rules.json',
      'price_rules',
      this.listParams(params),
    )
    // Fetch the first discount code for each rule in parallel — each
    // price_rule can have multiple codes but we surface the first one.
    const withCodes = await Promise.all(
      res.items.map(async (rule) => {
        try {
          const cr = await client.get<{ discount_codes: RawShopifyDiscountCode[] }>(
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
    const rule = await client.get<{ price_rule: RawShopifyPriceRule }>(
      `price_rules/${id}.json`,
    )
    let code: RawShopifyDiscountCode | undefined
    try {
      const cr = await client.get<{ discount_codes: RawShopifyDiscountCode[] }>(
        `price_rules/${id}/discount_codes.json`,
      )
      code = cr.discount_codes?.[0]
    } catch {
      /* no code */
    }
    return transformDiscount(rule.price_rule, code)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.client(credentials)
    const rule = await client.post<{ price_rule: RawShopifyPriceRule }>('price_rules.json', {
      price_rule: untransformDiscount(data),
    })
    let code: RawShopifyDiscountCode | undefined
    if (data.code) {
      const cr = await client.post<{ discount_code: RawShopifyDiscountCode }>(
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
    const res = await this.client(credentials).put<{ price_rule: RawShopifyPriceRule }>(
      `price_rules/${id}.json`,
      { price_rule: { id, ...untransformDiscount(data) } },
    )
    return transformDiscount(res.price_rule)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`price_rules/${id}.json`)
  }
}
