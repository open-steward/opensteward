import { CONNECT_FORM } from './connect-form'
// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: fulfillment — OpenCart has no native REST API endpoint for shipments/fulfillments;
//   the oc_order_shipment table is not exposed via catalog/controller/api controllers.
// Unavailable: transaction — OpenCart has no native REST API endpoint for payment transaction
//   records; catalog/controller/account/transaction.php is a storefront HTML page only.
/**
 * OpenCart adapter for the ecommerce vertical.
 *
 * Maps the OpenCart REST API to the canonical ecommerce resources.
 * OpenCart uses API key authentication — there is no OAuth
 * code-exchange flow. Stock is tracked as a `quantity` field on each
 * product rather than a separate inventory ledger.
 *
 * Auth: API key generated in OpenCart admin → System → Users → API.
 * Base URL: `https://{host}/index.php?route=rest/`
 *
 * Implements ~25/42 methods: products, categories, customers, orders,
 * locations, inventory, refunds, discounts.
 *
 * Docs: https://docs.opencart.com/en-gb/system/users/api/
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
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as ocExchangeCode } from './auth'
import { OpenCartClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import {
  verifyOpenCartWebhook,
  parseOpenCartWebhookEvents,
} from './webhook'

import {
  transformProduct,
  untransformProduct,
  untransformProductVariant,
  type RawOpenCartProduct,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawOpenCartCategory,
} from './transform/collection'
import {
  transformCustomer,
  untransformCustomer,
  type RawOpenCartCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawOpenCartOrder,
} from './transform/order'
import {
  transformRefund,
  untransformRefund,
  type RawOpenCartReturn,
} from './transform/refund'
import {
  transformDiscount,
  untransformDiscount,
  type RawOpenCartCoupon,
} from './transform/discount'
import { syntheticDefaultLocation } from './transform/location'
import {
  transformInventoryLevel,
  type RawOpenCartProductStock,
} from './transform/inventory'

export interface OpenCartAdapterConfig {
  /** API key (optional — may come from per-connection credentials). */
  apiKey?: string
  /** OpenCart site URL, e.g. `https://shop.example.com`. */
  site?: string
}


export class OpenCartAdapter implements EcommerceAdapter {

  // Connect Link support — see ./connect-form.ts for the fields collected.

  credentialFields = CONNECT_FORM.credentialFields

  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  readonly platform = 'opencart'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  private configApiKey: string | undefined
  private configSite: string | undefined

  constructor(config: OpenCartAdapterConfig = {}) {
    this.configApiKey = config.apiKey
    this.configSite = config.site
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl(this.configSite ?? 'https://your-opencart-site.example')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return ocExchangeCode()
  }

  /**
   * OpenCart API keys do not expire and are not rotated, so
   * `refreshCredentials` is a no-op.
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
    return verifyOpenCartWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const topic =
      (payload['event'] as string | undefined) ??
      (payload['topic'] as string | undefined)
    return parseOpenCartWebhookEvents(payload, topic)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): OpenCartClient {
    const apiKey =
      (credentials.extra?.['apiKey'] as string | undefined) ??
      (credentials.accessToken && credentials.accessToken !== 'api-key'
        ? credentials.accessToken
        : this.configApiKey)
    const site = (credentials.extra?.['site'] as string | undefined) ?? this.configSite

    if (!apiKey || !site) {
      throw new Error(
        'OpenCart adapter is missing apiKey/site — ' +
          'either configure them in apps/integration-server/config/config.yml under adapters.opencart, ' +
          'or POST them to /v1/connections with credentials: {apiKey, site}.',
      )
    }

    const mergedCreds: Credentials = {
      ...credentials,
      accessToken: apiKey,
      extra: { ...credentials.extra, site },
    }
    return new OpenCartClient(mergedCreds)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page != null) out['page'] = params.page
    if (params.search) out['search'] = params.search
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.clientFor(credentials).listWithPage<RawOpenCartProduct>(
      'product',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.clientFor(credentials).get<RawOpenCartProduct>(
      `product/${id}`,
    )
    return transformProduct(res)
  }

  async createProduct(
    credentials: Credentials,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.clientFor(credentials).post<RawOpenCartProduct>(
      'product',
      untransformProduct(data),
    )
    return transformProduct(res)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.clientFor(credentials).put<RawOpenCartProduct>(
      `product/${id}`,
      untransformProduct(data),
    )
    return transformProduct(res)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`product/${id}`)
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
        'OpenCart requires ?product_id= for listVariants; options are nested under products.',
      )
    }
    const product = await this.getProduct(credentials, String(productId))
    return product.variants ?? []
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error(
        'Invalid variant id format: expected `productId:variantId`',
      )
    }
    const product = await this.getProduct(credentials, productId)
    const variant = product.variants?.find((v) => v.id === id)
    if (!variant) {
      throw new Error(`Variant ${id} not found on product ${productId}`)
    }
    return variant
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const productId = data.productId
    if (!productId) throw new Error('createVariant requires productId')
    const body = untransformProductVariant(data)
    const res = await this.clientFor(credentials).post<RawOpenCartProduct>(
      `product/${productId}/option`,
      body,
    )
    const product = transformProduct(res)
    // Return the last variant (newly created)
    const variants = product.variants ?? []
    return variants[variants.length - 1] ?? variants[0]!
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
    const body = untransformProductVariant(data)
    const res = await this.clientFor(credentials).put<RawOpenCartProduct>(
      `product/${productId}/option/${variantId}`,
      body,
    )
    const product = transformProduct(res)
    return product.variants?.find((v) => v.id === id) ?? product.variants![0]!
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error(
        'Invalid variant id format: expected `productId:variantId`',
      )
    }
    await this.clientFor(credentials).delete(
      `product/${productId}/option/${variantId}`,
    )
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const res = await this.clientFor(credentials).listWithPage<RawOpenCartCategory>(
      'category',
      this.listParams(params),
    )
    return res.items.map((c) => transformCollection(c))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.clientFor(credentials).get<RawOpenCartCategory>(
      `category/${id}`,
    )
    return transformCollection(res)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.clientFor(credentials).post<RawOpenCartCategory>(
      'category',
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.clientFor(credentials).put<RawOpenCartCategory>(
      `category/${id}`,
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`category/${id}`)
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
      throw new Error(`OpenCart has no native locations; unknown location id '${id}'`)
    }
    return syntheticDefaultLocation(this.configSite ?? 'default')
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    // OpenCart stores stock on the product itself.
    const productId = data.variantId.split(':')[0]!
    const client = this.clientFor(credentials)
    const current = await client.get<RawOpenCartProductStock>(
      `product/${productId}`,
    )
    const newQty = (Number(current.quantity) || 0) + data.delta
    const updated = await client.put<RawOpenCartProductStock>(
      `product/${productId}`,
      { quantity: newQty },
    )
    return transformInventoryLevel(updated, productId)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const productId = data.variantId.split(':')[0]!
    const client = this.clientFor(credentials)
    const updated = await client.put<RawOpenCartProductStock>(
      `product/${productId}`,
      { quantity: data.available },
    )
    return transformInventoryLevel(updated, productId)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Customer[]> {
    const res = await this.clientFor(credentials).listWithPage<RawOpenCartCustomer>(
      'customer',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.clientFor(credentials).get<RawOpenCartCustomer>(
      `customer/${id}`,
    )
    return transformCustomer(res)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.clientFor(credentials).post<RawOpenCartCustomer>(
      'customer',
      untransformCustomer(data),
    )
    return transformCustomer(res)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.clientFor(credentials).put<RawOpenCartCustomer>(
      `customer/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(res)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`customer/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.clientFor(credentials).listWithPage<RawOpenCartOrder>(
      'order',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.clientFor(credentials).get<RawOpenCartOrder>(`order/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const res = await this.clientFor(credentials).post<RawOpenCartOrder>(
      'order',
      untransformOrder(data),
    )
    return transformOrder(res)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const res = await this.clientFor(credentials).put<RawOpenCartOrder>(
      `order/${id}`,
      untransformOrder(data),
    )
    return transformOrder(res)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    // OpenCart status 7 = Cancelled
    const res = await this.clientFor(credentials).put<RawOpenCartOrder>(
      `order/${id}`,
      { order_status_id: 7 },
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
    const res = await this.clientFor(credentials).listWithPage<RawOpenCartReturn>(
      `order/${oid}/return`,
      this.listParams(params),
    )
    return res.items.map((r) => transformRefund(r, oid))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const [orderId, returnId] = id.split(':')
    if (!orderId || !returnId) {
      throw new Error('Invalid refund id format: expected `orderId:returnId`')
    }
    const res = await this.clientFor(credentials).get<RawOpenCartReturn>(
      `return/${returnId}`,
    )
    return transformRefund(res, orderId)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const res = await this.clientFor(credentials).post<RawOpenCartReturn>(
      'return',
      untransformRefund(data),
    )
    return transformRefund(res, data.orderId)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const res = await this.clientFor(credentials).listWithPage<RawOpenCartCoupon>(
      'coupon',
      this.listParams(params),
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.clientFor(credentials).get<RawOpenCartCoupon>(
      `coupon/${id}`,
    )
    return transformDiscount(res)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.clientFor(credentials).post<RawOpenCartCoupon>(
      'coupon',
      untransformDiscount(data),
    )
    return transformDiscount(res)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.clientFor(credentials).put<RawOpenCartCoupon>(
      `coupon/${id}`,
      untransformDiscount(data),
    )
    return transformDiscount(res)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`coupon/${id}`)
  }
}
