import { simpleApiKey } from '@opensteward/shared'
/**
 * WooCommerce adapter for the ecommerce vertical.
 *
 * Maps the WooCommerce REST API (`/wp-json/wc/v3`) to the canonical
 * ecommerce resources. WooCommerce uses consumer key + secret via HTTP
 * Basic auth — there is no OAuth code-exchange flow — and stock is a
 * field on each product/variation rather than a separate ledger.
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
import type { Discount } from '../../schema/discount'
import type { Transaction } from '../../schema/transaction'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as wooExchangeCode } from './auth'
import { WooCommerceClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import {
  verifyWooCommerceWebhook,
  parseWooCommerceWebhookEvents,
} from './webhook'

import {
  transformProduct,
  untransformProduct,
  transformProductVariant,
  untransformProductVariant,
  type RawWooCommerceProduct,
  type RawWooCommerceVariation,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawWooCommerceCategory,
} from './transform/collection'
import {
  transformCustomer,
  untransformCustomer,
  type RawWooCommerceCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawWooCommerceOrder,
} from './transform/order'
import {
  transformRefund,
  untransformRefund,
  type RawWooCommerceRefund,
} from './transform/refund'
import {
  transformDiscount,
  untransformDiscount,
  type RawWooCommerceCoupon,
} from './transform/discount'
import { syntheticDefaultLocation } from './transform/location'
import {
  transformInventoryLevel,
  type RawWooCommerceVariationStock,
} from './transform/inventory'
import { transformFulfillment } from './transform/fulfillment'
import { transformTransaction } from './transform/transaction'

export interface WildberriesAdapterConfig {
  /** Consumer key (optional — may come from per-connection credentials instead). */
  consumerKey?: string
  /** Consumer secret (optional — may come from per-connection credentials instead). */
  consumerSecret?: string
  /** WooCommerce site URL, e.g. `https://shop.example.com`. */
  site?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class WildberriesAdapter implements EcommerceAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'wildberries'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  private configKey: string | undefined
  private configSecret: string | undefined
  private configSite: string | undefined

  constructor(config: WildberriesAdapterConfig = {}) {
    this.configKey = config.consumerKey
    this.configSecret = config.consumerSecret
    this.configSite = config.site
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // WooCommerce has no real OAuth authorize URL — point the user at the
    // admin keys page. The `state` param is intentionally ignored.
    return buildAuthUrl(this.configSite ?? 'https://your-wordpress-site.example')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // Throws a descriptive error — see `./auth.ts`.
    return wooExchangeCode()
  }

  /**
   * WooCommerce consumer keys do not expire and are not rotated, so
   * `refreshCredentials` is a no-op. This mirrors Shopify's long-lived
   * offline token handling.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(
    payload: Buffer,
    headers: Record<string, string>,
    secret: string,
  ): boolean {
    return verifyWooCommerceWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    // WC may carry the topic in the body under `topic` / `__topic` — the
    // webhook parser checks both paths when the header is not passed.
    const topic =
      (payload['__topic'] as string | undefined) ??
      (payload['topic'] as string | undefined)
    return parseWooCommerceWebhookEvents(payload, topic)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): WooCommerceClient {
    // Credentials may carry the consumer key in `accessToken` and the
    // secret + site under `extra`. Fall back to constructor config for
    // the server-level credentials case.
    const fromExtraKey = credentials.extra?.['consumerKey'] as string | undefined
    const consumerKey =
      fromExtraKey ??
      (credentials.accessToken && credentials.accessToken !== 'api-key'
        ? credentials.accessToken
        : this.configKey)
    const consumerSecret =
      (credentials.extra?.['consumerSecret'] as string | undefined) ?? this.configSecret
    const site = (credentials.extra?.['site'] as string | undefined) ?? this.configSite

    if (!consumerKey || !consumerSecret || !site) {
      throw new Error(
        'WooCommerce adapter is missing consumerKey/consumerSecret/site — ' +
          'either configure them in apps/integration-server/config/config.yml under adapters.woocommerce, ' +
          'or POST them to /v1/connections with credentials: {consumerKey, consumerSecret, site}.',
      )
    }

    const mergedCreds: Credentials = {
      ...credentials,
      accessToken: consumerKey,
      extra: { ...credentials.extra, consumerSecret, site },
    }
    return new WooCommerceClient(mergedCreds)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page != null) out['page'] = params.page
    if (params.updatedAfter) out['modified_after'] = params.updatedAfter.toISOString()
    if (params.search) out['search'] = params.search
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.clientFor(credentials).listWithPage<RawWooCommerceProduct>(
      'products',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.clientFor(credentials).get<RawWooCommerceProduct>(
      `products/${id}`,
    )
    return transformProduct(res)
  }

  async createProduct(
    credentials: Credentials,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.clientFor(credentials).post<RawWooCommerceProduct>(
      'products',
      untransformProduct(data),
    )
    return transformProduct(res)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.clientFor(credentials).put<RawWooCommerceProduct>(
      `products/${id}`,
      untransformProduct(data),
    )
    return transformProduct(res)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`products/${id}`, { force: true })
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as
      | string
      | number
      | undefined
    if (productId == null) {
      throw new Error(
        'WooCommerce requires ?product_id= for listVariants; variations are nested under parent products.',
      )
    }
    const pid = String(productId)
    const res = await this.clientFor(credentials).listWithPage<RawWooCommerceVariation>(
      `products/${pid}/variations`,
      this.listParams(params),
    )
    return res.items.map((v) => transformProductVariant(v, pid))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error(
        'Invalid variant id format: expected `productId:variantId`',
      )
    }
    const res = await this.clientFor(credentials).get<RawWooCommerceVariation>(
      `products/${productId}/variations/${variantId}`,
    )
    return transformProductVariant(res, productId)
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const productId = data.productId
    if (!productId) throw new Error('createVariant requires productId')
    const res = await this.clientFor(credentials).post<RawWooCommerceVariation>(
      `products/${productId}/variations`,
      untransformProductVariant(data),
    )
    return transformProductVariant(res, productId)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error(
        'Invalid variant id format: expected `productId:variantId`',
      )
    }
    const res = await this.clientFor(credentials).put<RawWooCommerceVariation>(
      `products/${productId}/variations/${variantId}`,
      untransformProductVariant(data),
    )
    return transformProductVariant(res, productId)
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error(
        'Invalid variant id format: expected `productId:variantId`',
      )
    }
    await this.clientFor(credentials).delete(
      `products/${productId}/variations/${variantId}`,
      { force: true },
    )
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const res = await this.clientFor(credentials).listWithPage<RawWooCommerceCategory>(
      'products/categories',
      this.listParams(params),
    )
    return res.items.map((c) => transformCollection(c))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.clientFor(credentials).get<RawWooCommerceCategory>(
      `products/categories/${id}`,
    )
    return transformCollection(res)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.clientFor(credentials).post<RawWooCommerceCategory>(
      'products/categories',
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.clientFor(credentials).put<RawWooCommerceCategory>(
      `products/categories/${id}`,
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`products/categories/${id}`, {
      force: true,
    })
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<Location[]> {
    return [syntheticDefaultLocation(this.configSite ?? 'default')]
  }

  async getLocation(_credentials: Credentials, id: string): Promise<Location> {
    if (id !== 'default') {
      throw new Error(`WooCommerce has no native locations; unknown location id '${id}'`)
    }
    return syntheticDefaultLocation(this.configSite ?? 'default')
  }

  // ── Inventory mutations ───────────────────────────────────────────────────

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const [productId, variationId] = data.variantId.split(':')
    if (!productId || !variationId) {
      throw new Error(
        'WooCommerce adjustInventoryLevel requires composite variantId `productId:variationId`',
      )
    }
    const client = this.clientFor(credentials)
    const current = await client.get<RawWooCommerceVariationStock>(
      `products/${productId}/variations/${variationId}`,
    )
    const newQty = (current.stock_quantity ?? 0) + data.delta
    const updated = await client.put<RawWooCommerceVariationStock>(
      `products/${productId}/variations/${variationId}`,
      { manage_stock: true, stock_quantity: newQty },
    )
    return transformInventoryLevel(updated, productId)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const [productId, variationId] = data.variantId.split(':')
    if (!productId || !variationId) {
      throw new Error(
        'WooCommerce setInventoryLevel requires composite variantId `productId:variationId`',
      )
    }
    const client = this.clientFor(credentials)
    const updated = await client.put<RawWooCommerceVariationStock>(
      `products/${productId}/variations/${variationId}`,
      { manage_stock: true, stock_quantity: data.available },
    )
    return transformInventoryLevel(updated, productId)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Customer[]> {
    const res = await this.clientFor(credentials).listWithPage<RawWooCommerceCustomer>(
      'customers',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.clientFor(credentials).get<RawWooCommerceCustomer>(
      `customers/${id}`,
    )
    return transformCustomer(res)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.clientFor(credentials).post<RawWooCommerceCustomer>(
      'customers',
      untransformCustomer(data),
    )
    return transformCustomer(res)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.clientFor(credentials).put<RawWooCommerceCustomer>(
      `customers/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(res)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`customers/${id}`, {
      force: true,
      reassign: 0,
    })
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.clientFor(credentials).listWithPage<RawWooCommerceOrder>(
      'orders',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.clientFor(credentials).get<RawWooCommerceOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const res = await this.clientFor(credentials).post<RawWooCommerceOrder>(
      'orders',
      untransformOrder(data),
    )
    return transformOrder(res)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const res = await this.clientFor(credentials).put<RawWooCommerceOrder>(
      `orders/${id}`,
      untransformOrder(data),
    )
    return transformOrder(res)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const res = await this.clientFor(credentials).put<RawWooCommerceOrder>(
      `orders/${id}`,
      { status: 'cancelled' },
    )
    return transformOrder(res)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = (params['order_id'] ?? params['orderId']) as
      | string
      | number
      | undefined
    if (orderId == null) {
      throw new Error('listRefunds requires `order_id` in query params')
    }
    const oid = String(orderId)
    const res = await this.clientFor(credentials).listWithPage<RawWooCommerceRefund>(
      `orders/${oid}/refunds`,
      this.listParams(params),
    )
    return res.items.map((r) => transformRefund(r, oid))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const [orderId, refundId] = id.split(':')
    if (!orderId || !refundId) {
      throw new Error('Invalid refund id format: expected `orderId:refundId`')
    }
    const res = await this.clientFor(credentials).get<RawWooCommerceRefund>(
      `orders/${orderId}/refunds/${refundId}`,
    )
    return transformRefund(res, orderId)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const res = await this.clientFor(credentials).post<RawWooCommerceRefund>(
      `orders/${data.orderId}/refunds`,
      untransformRefund(data),
    )
    return transformRefund(res, data.orderId)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const res = await this.clientFor(credentials).listWithPage<RawWooCommerceCoupon>(
      'coupons',
      this.listParams(params),
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.clientFor(credentials).get<RawWooCommerceCoupon>(
      `coupons/${id}`,
    )
    return transformDiscount(res)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.clientFor(credentials).post<RawWooCommerceCoupon>(
      'coupons',
      untransformDiscount(data),
    )
    return transformDiscount(res)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.clientFor(credentials).put<RawWooCommerceCoupon>(
      `coupons/${id}`,
      untransformDiscount(data),
    )
    return transformDiscount(res)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`coupons/${id}`, { force: true })
  }

  // ── Fulfillments (synthesized from orders) ────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    // WooCommerce has no standalone fulfillment endpoint; derive from orders.
    const res = await this.clientFor(credentials).listWithPage<RawWooCommerceOrder>(
      'orders',
      this.listParams(params),
    )
    return res.items
      .filter((o) => o.status !== 'pending' && o.status !== 'on-hold')
      .map((o) => transformFulfillment(o))
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // id = "ful-{orderId}" or "{orderId}-{shippingLineId}" — extract orderId
    const orderId = id.startsWith('ful-')
      ? id.slice(4)
      : id.includes('-')
        ? id.split('-')[0]!
        : id
    const res = await this.clientFor(credentials).get<RawWooCommerceOrder>(`orders/${orderId}`)
    return transformFulfillment(res)
  }

  // ── Transactions (derived from orders) ───────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    // WC has no standalone transactions endpoint; derive from paid/completed orders.
    const res = await this.clientFor(credentials).listWithPage<RawWooCommerceOrder>(
      'orders',
      { ...this.listParams(params), status: 'any' },
    )
    return res.items.map((o) => transformTransaction(o))
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // Transaction id is "txn-{orderId}".
    const orderId = id.startsWith('txn-') ? id.slice(4) : id
    const res = await this.clientFor(credentials).get<RawWooCommerceOrder>(`orders/${orderId}`)
    return transformTransaction(res)
  }
}
