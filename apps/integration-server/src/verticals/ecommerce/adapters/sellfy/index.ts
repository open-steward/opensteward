/**
 * Sellfy adapter for the ecommerce vertical.
 *
 * Every read method (list* and get*) refuses with 501 NOT_SUPPORTED before
 * anything is sent: see {@link notDocumented}. They were copied from the
 * Shopify adapter and called Shopify's Admin REST API, which is not Sellfy's.
 * Sellfy's only first-party API reference is
 * https://api.sellfy.com/openapi.json (rendered at https://api.sellfy.com/).
 * It declares one server, https://api.sellfy.com, Bearer-token auth, and five
 * operations: GET /ping/, GET /v1/licenses/validate/,
 * POST /v1/licenses/activations/, DELETE /v1/licenses/activations/{activation_id}/
 * and POST /v1/licenses/revoke/. None of them reads a canonical ecommerce
 * resource.
 *
 * The auth, webhook and write methods below are still the Shopify copy and
 * are out of scope for this change; the platform is declared unsupported in
 * platforms/metadata.ts, so no connection reaches them.
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
import { DEFAULT_SCOPES } from './constants'
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
import { transformInventoryLevel, type RawShopifyInventoryLevel } from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawShopifyCustomer,
} from './transform/customer'
import { transformOrder, untransformOrder, type RawShopifyOrder } from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShopifyFulfillment,
} from './transform/fulfillment'
import { transformRefund, untransformRefund, type RawShopifyRefund } from './transform/refund'
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

const DOCUMENTED =
  'its only public API (https://api.sellfy.com/openapi.json) covers /ping/ and license keys: ' +
  '"Validate, activate and revoke license keys sold with Sellfy products."'

/**
 * Refuses a read whose resource Sellfy does not document, before anything is
 * sent. The router turns the 501 into NOT_SUPPORTED for the caller.
 */
function notDocumented(verb: 'list' | 'read', resource: string): never {
  throw Object.assign(new Error(`Sellfy cannot ${verb} ${resource}: ${DOCUMENTED}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

export interface SellfyAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** Store subdomain, e.g. `mystore` (not `mystore.myshopify.com`). */
  shop: string
  scopes?: string[]
}

export class SellfyAdapter implements EcommerceAdapter {
  readonly platform = 'sellfy'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private shop: string
  private scopes: string[]

  constructor(config: SellfyAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.shop = config.shop
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(
      this.shop,
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
    )
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
      (payload['__topic'] as string | undefined) ?? (payload['topic'] as string | undefined)
    return parseShopifyWebhookEvents(payload, topic)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): ShopifyClient {
    return new ShopifyClient(credentials, this.shop)
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(_credentials: Credentials, _params: QueryParams): Promise<Product[]> {
    return notDocumented('list', 'products')
  }

  async getProduct(_credentials: Credentials, _id: string): Promise<Product> {
    return notDocumented('read', 'products')
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

  async listVariants(_credentials: Credentials, _params: QueryParams): Promise<ProductVariant[]> {
    return notDocumented('list', 'variants')
  }

  async getVariant(_credentials: Credentials, _id: string): Promise<ProductVariant> {
    return notDocumented('read', 'variants')
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

  async listCollections(_credentials: Credentials, _params: QueryParams): Promise<Collection[]> {
    return notDocumented('list', 'collections')
  }

  async getCollection(_credentials: Credentials, _id: string): Promise<Collection> {
    return notDocumented('read', 'collections')
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
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

  async listLocations(_credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    return notDocumented('list', 'locations')
  }

  async getLocation(_credentials: Credentials, _id: string): Promise<Location> {
    return notDocumented('read', 'locations')
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<InventoryLevel[]> {
    return notDocumented('list', 'inventory levels')
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

  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    return notDocumented('list', 'customers')
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    return notDocumented('read', 'customers')
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
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

  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    return notDocumented('list', 'orders')
  }

  async getOrder(_credentials: Credentials, _id: string): Promise<Order> {
    return notDocumented('read', 'orders')
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).post<{ order: RawShopifyOrder }>('orders.json', {
      order: untransformOrder(data),
    })
    return transformOrder(res.order)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
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

  async listFulfillments(_credentials: Credentials, _params: QueryParams): Promise<Fulfillment[]> {
    return notDocumented('list', 'fulfillments')
  }

  async getFulfillment(_credentials: Credentials, _id: string): Promise<Fulfillment> {
    return notDocumented('read', 'fulfillments')
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

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    return notDocumented('list', 'refunds')
  }

  async getRefund(_credentials: Credentials, _id: string): Promise<Refund> {
    return notDocumented('read', 'refunds')
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

  async listTransactions(_credentials: Credentials, _params: QueryParams): Promise<Transaction[]> {
    return notDocumented('list', 'transactions')
  }

  async getTransaction(_credentials: Credentials, _id: string): Promise<Transaction> {
    return notDocumented('read', 'transactions')
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

  async listDiscounts(_credentials: Credentials, _params: QueryParams): Promise<Discount[]> {
    return notDocumented('list', 'discounts')
  }

  async getDiscount(_credentials: Credentials, _id: string): Promise<Discount> {
    return notDocumented('read', 'discounts')
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
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
