import { simpleApiKey } from '@opensteward/shared'
/**
 * Ecwid adapter for the ecommerce vertical.
 *
 * Maps the Ecwid REST API (`/api/v3/{storeId}/`) to the canonical
 * ecommerce resources. Ecwid (Lightspeed-owned, ~1.2M micro-merchants)
 * uses API key (store token) authentication — there is no OAuth
 * code-exchange flow for self-hosted usage. See `service.md` for the
 * canonical resource model.
 *
 * Docs: https://developer.ecwid.com/
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as ecwidExchangeCode } from './auth'
import { EcwidClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyEcwidWebhook, parseEcwidWebhookEvents } from './webhook'

import {
  transformProduct,
  untransformProduct,
  transformProductVariant,
  untransformProductVariant,
  type RawEcwidProduct,
  type RawEcwidCombination,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawEcwidCategory,
} from './transform/collection'
import {
  transformCustomer,
  untransformCustomer,
  type RawEcwidCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawEcwidOrder,
} from './transform/order'
import {
  transformRefund,
  untransformRefund,
  type RawEcwidRefund,
} from './transform/refund'
import {
  transformDiscount,
  untransformDiscount,
  type RawEcwidCoupon,
} from './transform/discount'
import { syntheticDefaultLocation } from './transform/location'
import {
  transformInventoryLevel,
  type RawEcwidProductStock,
} from './transform/inventory'
import {
  transformFulfillment,
  type RawEcwidFulfillment,
} from './transform/fulfillment'
import { transformTransaction, type RawEcwidTransaction } from './transform/transaction'

export interface EcwidAdapterConfig {
  /** Secret API token (optional — may come from per-connection credentials). */
  accessToken?: string
  /** Ecwid store ID. */
  storeId?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class EcwidAdapter implements EcommerceAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'ecwid'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  private configToken: string | undefined
  private configStoreId: string | undefined

  constructor(config: EcwidAdapterConfig = {}) {
    this.configToken = config.accessToken
    this.configStoreId = config.storeId
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return ecwidExchangeCode()
  }

  /**
   * Ecwid API tokens are long-lived and do not expire, so
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
    return verifyEcwidWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseEcwidWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): EcwidClient {
    const token = credentials.accessToken || this.configToken
    const storeId =
      (credentials.extra?.['storeId'] as string | undefined) ?? this.configStoreId

    if (!token || !storeId) {
      throw new Error(
        'Ecwid adapter is missing accessToken/storeId — ' +
          'either configure them in apps/integration-server/config/config.yml under adapters.ecwid, ' +
          'or POST them to /v1/connections with credentials: {accessToken, storeId}.',
      )
    }

    const mergedCreds: Credentials = {
      ...credentials,
      accessToken: token,
      extra: { ...credentials.extra, storeId },
    }
    return new EcwidClient(mergedCreds)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page != null) {
      // Convert page-based to offset-based
      const limit = params.limit ?? DEFAULT_PAGE_SIZE
      out['offset'] = (params.page - 1) * limit
    }
    if (params.updatedAfter) out['updatedFrom'] = params.updatedAfter.toISOString()
    if (params.search) out['keyword'] = params.search
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.clientFor(credentials).listWithPage<RawEcwidProduct>(
      'products',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.clientFor(credentials).get<RawEcwidProduct>(
      `products/${id}`,
    )
    return transformProduct(res)
  }

  async createProduct(
    credentials: Credentials,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const createRes = await client.post<{ id: number }>(
      'products',
      untransformProduct(data),
    )
    const res = await client.get<RawEcwidProduct>(`products/${createRes.id}`)
    return transformProduct(res)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    await client.put(`products/${id}`, untransformProduct(data))
    const res = await client.get<RawEcwidProduct>(`products/${id}`)
    return transformProduct(res)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`products/${id}`)
  }

  // ── Variants (Combinations) ──────────────────────────────────────────────

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
        'Ecwid requires ?product_id= for listVariants; combinations are nested under products.',
      )
    }
    const pid = String(productId)
    const res = await this.clientFor(credentials).get<RawEcwidCombination[]>(
      `products/${pid}/combinations`,
    )
    return (res ?? []).map((v) => transformProductVariant(v, pid))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error(
        'Invalid variant id format: expected `productId:variantId`',
      )
    }
    const res = await this.clientFor(credentials).get<RawEcwidCombination>(
      `products/${productId}/combinations/${variantId}`,
    )
    return transformProductVariant(res, productId)
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const productId = data.productId
    if (!productId) throw new Error('createVariant requires productId')
    const client = this.clientFor(credentials)
    const createRes = await client.post<{ id: number }>(
      `products/${productId}/combinations`,
      untransformProductVariant(data),
    )
    const res = await client.get<RawEcwidCombination>(
      `products/${productId}/combinations/${createRes.id}`,
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
    const client = this.clientFor(credentials)
    await client.put(
      `products/${productId}/combinations/${variantId}`,
      untransformProductVariant(data),
    )
    const res = await client.get<RawEcwidCombination>(
      `products/${productId}/combinations/${variantId}`,
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
      `products/${productId}/combinations/${variantId}`,
    )
  }

  // ── Collections (Categories) ──────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const res = await this.clientFor(credentials).listWithPage<RawEcwidCategory>(
      'categories',
      this.listParams(params),
    )
    return res.items.map((c) => transformCollection(c))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.clientFor(credentials).get<RawEcwidCategory>(
      `categories/${id}`,
    )
    return transformCollection(res)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.clientFor(credentials)
    const createRes = await client.post<{ id: number }>(
      'categories',
      untransformCollection(data),
    )
    const res = await client.get<RawEcwidCategory>(`categories/${createRes.id}`)
    return transformCollection(res)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.clientFor(credentials)
    await client.put(`categories/${id}`, untransformCollection(data))
    const res = await client.get<RawEcwidCategory>(`categories/${id}`)
    return transformCollection(res)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`categories/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<Location[]> {
    return [syntheticDefaultLocation(this.configStoreId ?? 'default')]
  }

  async getLocation(_credentials: Credentials, id: string): Promise<Location> {
    if (id !== 'default') {
      throw new Error(`Ecwid has no native locations; unknown location id '${id}'`)
    }
    return syntheticDefaultLocation(this.configStoreId ?? 'default')
  }

  // ── Inventory mutations ───────────────────────────────────────────────────

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const [productId, combinationId] = data.variantId.split(':')
    if (!productId || !combinationId) {
      throw new Error(
        'Ecwid adjustInventoryLevel requires composite variantId `productId:combinationId`',
      )
    }
    const client = this.clientFor(credentials)
    const current = await client.get<RawEcwidProductStock>(
      `products/${productId}/combinations/${combinationId}`,
    )
    const newQty = (current.quantity ?? 0) + data.delta
    await client.put(
      `products/${productId}/combinations/${combinationId}`,
      { quantity: newQty },
    )
    const updated = await client.get<RawEcwidProductStock>(
      `products/${productId}/combinations/${combinationId}`,
    )
    return transformInventoryLevel(updated, productId)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const [productId, combinationId] = data.variantId.split(':')
    if (!productId || !combinationId) {
      throw new Error(
        'Ecwid setInventoryLevel requires composite variantId `productId:combinationId`',
      )
    }
    const client = this.clientFor(credentials)
    await client.put(
      `products/${productId}/combinations/${combinationId}`,
      { quantity: data.available },
    )
    const updated = await client.get<RawEcwidProductStock>(
      `products/${productId}/combinations/${combinationId}`,
    )
    return transformInventoryLevel(updated, productId)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Customer[]> {
    const res = await this.clientFor(credentials).listWithPage<RawEcwidCustomer>(
      'customers',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.clientFor(credentials).get<RawEcwidCustomer>(
      `customers/${id}`,
    )
    return transformCustomer(res)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.clientFor(credentials)
    const createRes = await client.post<{ id: number }>(
      'customers',
      untransformCustomer(data),
    )
    const res = await client.get<RawEcwidCustomer>(`customers/${createRes.id}`)
    return transformCustomer(res)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.clientFor(credentials)
    await client.put(`customers/${id}`, untransformCustomer(data))
    const res = await client.get<RawEcwidCustomer>(`customers/${id}`)
    return transformCustomer(res)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`customers/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.clientFor(credentials).listWithPage<RawEcwidOrder>(
      'orders',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.clientFor(credentials).get<RawEcwidOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = this.clientFor(credentials)
    const createRes = await client.post<{ id: number }>(
      'orders',
      untransformOrder(data),
    )
    const res = await client.get<RawEcwidOrder>(`orders/${createRes.id}`)
    return transformOrder(res)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    await client.put(`orders/${id}`, untransformOrder(data))
    const res = await client.get<RawEcwidOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    await client.put(`orders/${id}`, {
      paymentStatus: 'CANCELLED',
      fulfillmentStatus: 'WILL_NOT_DELIVER',
    })
    const res = await client.get<RawEcwidOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    // Ecwid does not have a dedicated refund endpoint. We search for
    // orders with paymentStatus REFUNDED or PARTIALLY_REFUNDED.
    const client = this.clientFor(credentials)
    const listP = this.listParams(params)
    listP['paymentStatus'] = 'REFUNDED,PARTIALLY_REFUNDED'
    const res = await client.listWithPage<RawEcwidOrder>('orders', listP)
    return res.items.map((o) => {
      const raw: RawEcwidRefund = {
        id: o.id ?? o.orderNumber ?? 0,
        orderId: o.id ?? o.orderNumber ?? 0,
        amount: o.total,
        reason: o.privateAdminNotes ?? undefined,
        date: o.updateDate ?? o.createDate,
      }
      return transformRefund(raw)
    })
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // Refund id maps to the order id in Ecwid
    const client = this.clientFor(credentials)
    const order = await client.get<RawEcwidOrder>(`orders/${id}`)
    const raw: RawEcwidRefund = {
      id: order.id ?? order.orderNumber ?? 0,
      orderId: order.id ?? order.orderNumber ?? 0,
      amount: order.total,
      reason: order.privateAdminNotes ?? undefined,
      date: order.updateDate ?? order.createDate,
    }
    return transformRefund(raw)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const client = this.clientFor(credentials)
    const body = untransformRefund(data)
    // Mark the order as refunded
    await client.put(`orders/${data.orderId}`, {
      paymentStatus: 'REFUNDED',
      privateAdminNotes: body['reason'],
    })
    const order = await client.get<RawEcwidOrder>(`orders/${data.orderId}`)
    const raw: RawEcwidRefund = {
      id: order.id ?? order.orderNumber ?? 0,
      orderId: data.orderId,
      amount: data.amount?.amount ?? order.total,
      reason: data.reason,
      date: order.updateDate ?? order.createDate,
    }
    return transformRefund(raw)
  }

  // ── Discounts (Coupons) ──────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const res = await this.clientFor(credentials).listWithPage<RawEcwidCoupon>(
      'discount_coupons',
      this.listParams(params),
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.clientFor(credentials).get<RawEcwidCoupon>(
      `discount_coupons/${id}`,
    )
    return transformDiscount(res)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.clientFor(credentials)
    await client.post('discount_coupons', untransformDiscount(data))
    // Ecwid coupon creation returns the coupon code, not a numeric id
    // Re-fetch using the code
    const code = data.code
    if (!code) throw new Error('createDiscount requires a coupon code')
    const res = await client.get<RawEcwidCoupon>(`discount_coupons/${code}`)
    return transformDiscount(res)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.clientFor(credentials)
    await client.put(`discount_coupons/${id}`, untransformDiscount(data))
    const res = await client.get<RawEcwidCoupon>(`discount_coupons/${id}`)
    return transformDiscount(res)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`discount_coupons/${id}`)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    // Ecwid fulfillments derive from orders with a fulfillmentStatus.
    // Scope to a specific order if orderId is given.
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (orderId) {
      const order = await this.clientFor(credentials).get<RawEcwidFulfillment>(`orders/${orderId}`)
      return [transformFulfillment({ ...order, orderId })]
    }
    // Otherwise, return fulfillments from shipped orders
    const res = await this.clientFor(credentials).listWithPage<RawEcwidFulfillment>(
      'orders',
      { ...this.listParams(params), fulfillmentStatus: 'SHIPPED,DELIVERED,READY_FOR_PICKUP' },
    )
    return res.items.map((o) => transformFulfillment({ ...o, orderId: String(o.id ?? o.orderNumber ?? '') }))
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Ecwid fulfillment id = order id
    const order = await this.clientFor(credentials).get<RawEcwidFulfillment>(`orders/${id}`)
    return transformFulfillment({ ...order, orderId: String(order.id ?? order.orderNumber ?? id) })
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    // Ecwid transactions derive from orders with payment info.
    const res = await this.clientFor(credentials).listWithPage<RawEcwidTransaction>(
      'orders',
      this.listParams(params),
    )
    return res.items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // Transaction id = order id in Ecwid
    const order = await this.clientFor(credentials).get<RawEcwidTransaction>(`orders/${id}`)
    return transformTransaction(order)
  }
}
