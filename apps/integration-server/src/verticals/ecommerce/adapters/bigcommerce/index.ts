/**
 * BigCommerce adapter for the ecommerce vertical.
 *
 * Maps the BigCommerce REST API (v2 + v3) to canonical ecommerce resources.
 * Access tokens are long-lived — `refreshCredentials` is a no-op (same as
 * Shopify).
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

import { buildAuthUrl, exchangeCode as bcExchangeCode, resolveStoreHash } from './auth'
import { BigCommerceClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyBigCommerceWebhook, parseBigCommerceWebhookEvents } from './webhook'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawBigCommerceProduct,
  type RawBigCommerceVariant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawBigCommerceCategory,
} from './transform/collection'
import {
  transformLocation,
  syntheticDefaultLocation,
  type RawBigCommerceLocation,
} from './transform/location'
import {
  transformInventoryLevel,
  transformVariantInventory,
  type RawBigCommerceInventoryItem,
} from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawBigCommerceCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawBigCommerceOrder,
} from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawBigCommerceShipment,
} from './transform/fulfillment'
import {
  transformRefund,
  untransformRefund,
  type RawBigCommerceRefund,
} from './transform/refund'
import {
  transformTransaction,
  type RawBigCommerceTransaction,
} from './transform/transaction'
import {
  transformDiscount,
  untransformDiscount,
  type RawBigCommercePromotion,
} from './transform/discount'

export interface BigCommerceAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /**
   * Deployment-wide store hash, e.g. `abc123`. Optional: the store is the
   * customer's, named by the token response and read back from
   * `credentials.extra.storeHash`. Set this only when every connection on this
   * deployment is the same store.
   */
  storeHash?: string
}

export class BigCommerceAdapter implements EcommerceAdapter {
  readonly platform = 'bigcommerce'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private storeHash: string | undefined

  constructor(config: BigCommerceAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.storeHash = config.storeHash
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(
      this.clientId,
      this.redirectUri,
      overrideScopes ?? ['store_v2_orders', 'store_v2_products', 'store_v2_customers'],
      state,
    )
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return bcExchangeCode(code, this.clientId, this.clientSecret, this.redirectUri)
  }

  /**
   * BigCommerce access tokens are long-lived and do not rotate.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyBigCommerceWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseBigCommerceWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): BigCommerceClient {
    return new BigCommerceClient(
      credentials,
      resolveStoreHash(credentials.extra?.['storeHash'], this.storeHash),
    )
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    const page = params['page'] ?? params['cursor']
    if (page) out.page = Number(page)
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).listV3<RawBigCommerceProduct>(
      '/catalog/products',
      { ...this.listParams(params), include: 'variants,images,options' },
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<{ data: RawBigCommerceProduct }>(
      `/catalog/products/${id}`,
      { include: 'variants,images,options' },
    )
    return transformProduct(res.data)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const body = untransformProduct(data)
    // BigCommerce requires weight and price at minimum
    if (body.weight == null) body.weight = 0
    if (body.price == null && data.variants?.[0]?.price) {
      body.price = data.variants[0].price.amount
    } else if (body.price == null) {
      body.price = 0
    }
    const res = await this.client(credentials).post<{ data: RawBigCommerceProduct }>(
      '/catalog/products',
      body,
    )
    return transformProduct(res.data)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.client(credentials).put<{ data: RawBigCommerceProduct }>(
      `/catalog/products/${id}`,
      untransformProduct(data),
    )
    return transformProduct(res.data)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/catalog/products/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['product_id']
    if (productId) {
      const res = await this.client(credentials).listV3<RawBigCommerceVariant>(
        `/catalog/products/${String(productId)}/variants`,
        this.listParams(params),
      )
      return res.items.map((v) => transformVariant(v))
    }
    // Fallback: fetch products then flatten variants.
    const productsRes = await this.client(credentials).listV3<RawBigCommerceProduct>(
      '/catalog/products',
      { ...this.listParams(params), include: 'variants' },
    )
    return productsRes.items.flatMap((p) =>
      (p.variants ?? []).map((v) => transformVariant(v)),
    )
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // BigCommerce variant ids are composite: `productId:variantId`
    const [productId, variantId] = id.includes(':') ? id.split(':') : [undefined, id]
    if (!productId) {
      throw new Error('getVariant requires composite id format: `productId:variantId`')
    }
    const res = await this.client(credentials).get<{ data: RawBigCommerceVariant }>(
      `/catalog/products/${productId}/variants/${variantId}`,
    )
    return transformVariant(res.data)
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    if (!data.productId) throw new Error('createVariant requires productId')
    const res = await this.client(credentials).post<{ data: RawBigCommerceVariant }>(
      `/catalog/products/${data.productId}/variants`,
      untransformVariant(data),
    )
    return transformVariant(res.data)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const [productId, variantId] = id.includes(':') ? id.split(':') : [data.productId, id]
    if (!productId) {
      throw new Error('updateVariant requires composite id format: `productId:variantId`')
    }
    const res = await this.client(credentials).put<{ data: RawBigCommerceVariant }>(
      `/catalog/products/${productId}/variants/${variantId}`,
      untransformVariant(data),
    )
    return transformVariant(res.data)
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    const [productId, variantId] = id.includes(':') ? id.split(':') : [undefined, id]
    if (!productId) {
      throw new Error('deleteVariant requires composite id format: `productId:variantId`')
    }
    await this.client(credentials).delete(
      `/catalog/products/${productId}/variants/${variantId}`,
    )
  }

  // ── Collections (Categories) ──────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const res = await this.client(credentials).listV3<RawBigCommerceCategory>(
      '/catalog/categories',
      this.listParams(params),
    )
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.client(credentials).get<{ data: RawBigCommerceCategory }>(
      `/catalog/categories/${id}`,
    )
    return transformCollection(res.data)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const body = { ...untransformCollection(data), parent_id: 0 }
    const res = await this.client(credentials).post<{ data: RawBigCommerceCategory }>(
      '/catalog/categories',
      body,
    )
    return transformCollection(res.data)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).put<{ data: RawBigCommerceCategory }>(
      `/catalog/categories/${id}`,
      untransformCollection(data),
    )
    return transformCollection(res.data)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/catalog/categories/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    try {
      const res = await this.client(credentials).listV3<RawBigCommerceLocation>(
        '/inventory/locations',
      )
      return res.items.map(transformLocation)
    } catch {
      // Inventory Locations API not available — return synthetic default
      return [syntheticDefaultLocation()]
    }
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    if (id === 'default') return syntheticDefaultLocation()
    const res = await this.client(credentials).get<{ data: RawBigCommerceLocation }>(
      `/inventory/locations/${id}`,
    )
    return transformLocation(res.data)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    try {
      const res = await this.client(credentials).listV3<RawBigCommerceInventoryItem>(
        '/inventory/items',
        this.listParams(params),
      )
      return res.items.map(transformInventoryLevel)
    } catch {
      // Fallback: use product variants
      const productId = params['product_id'] ?? params['productId']
      if (!productId) {
        throw new Error(
          'listInventoryLevels requires `product_id` or the Inventory API must be available',
        )
      }
      const res = await this.client(credentials).listV3<RawBigCommerceVariant>(
        `/catalog/products/${String(productId)}/variants`,
      )
      return res.items.map((v) =>
        transformVariantInventory(v.id, v.inventory_level ?? 0),
      )
    }
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const res = await this.client(credentials).post<{ data: RawBigCommerceInventoryItem[] }>(
      '/inventory/adjustments/absolute',
      {
        items: [
          {
            variant_id: Number(data.variantId),
            location_id: Number(data.locationId),
            quantity: data.delta,
          },
        ],
      },
    )
    if (res.data?.[0]) return transformInventoryLevel(res.data[0])
    return transformVariantInventory(data.variantId, data.delta, data.locationId)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const res = await this.client(credentials).put<{ data: RawBigCommerceInventoryItem[] }>(
      '/inventory/items',
      {
        items: [
          {
            variant_id: Number(data.variantId),
            location_id: Number(data.locationId),
            available_stock: data.available,
          },
        ],
      },
    )
    if (res.data?.[0]) return transformInventoryLevel(res.data[0])
    return transformVariantInventory(data.variantId, data.available, data.locationId)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).listV3<RawBigCommerceCustomer>(
      '/customers',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    // BigCommerce v3 customers list with `id:in` filter
    const res = await this.client(credentials).get<{ data: RawBigCommerceCustomer[] }>(
      '/customers',
      { 'id:in': id },
    )
    if (!res.data?.[0]) throw new Error(`Customer ${id} not found`)
    return transformCustomer(res.data[0])
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).post<{ data: RawBigCommerceCustomer[] }>(
      '/customers',
      [untransformCustomer(data)],
    )
    return transformCustomer(res.data[0]!)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).put<{ data: RawBigCommerceCustomer[] }>(
      '/customers',
      [{ id: Number(id), ...untransformCustomer(data) }],
    )
    return transformCustomer(res.data[0]!)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/customers?id:in=${id}`)
  }

  // ── Orders (v2) ──────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.client(credentials).listV2<RawBigCommerceOrder>(
      '/orders',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.client(credentials).getV2<RawBigCommerceOrder>(
      `/orders/${id}`,
    )
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const raw = await this.client(credentials).postV2<RawBigCommerceOrder>(
      '/orders',
      untransformOrder(data),
    )
    return transformOrder(raw)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const raw = await this.client(credentials).putV2<RawBigCommerceOrder>(
      `/orders/${id}`,
      untransformOrder(data),
    )
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    // BigCommerce cancels an order by setting status_id to a cancelled state
    const raw = await this.client(credentials).putV2<RawBigCommerceOrder>(
      `/orders/${id}`,
      { status_id: 5 }, // 5 = Cancelled
    )
    return transformOrder(raw)
  }

  // ── Fulfillments (Shipments, v2) ──────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listFulfillments requires `order_id` in query params')
    }
    const res = await this.client(credentials).listV2<RawBigCommerceShipment>(
      `/orders/${String(orderId)}/shipments`,
      this.listParams(params),
    )
    return res.items.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Composite id: `orderId:shipmentId`
    const [orderId, shipmentId] = id.split(':')
    if (!orderId || !shipmentId) {
      throw new Error('Invalid fulfillment id format: expected `orderId:shipmentId`')
    }
    const raw = await this.client(credentials).getV2<RawBigCommerceShipment>(
      `/orders/${orderId}/shipments/${shipmentId}`,
    )
    return transformFulfillment(raw)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const raw = await this.client(credentials).postV2<RawBigCommerceShipment>(
      `/orders/${data.orderId}/shipments`,
      untransformFulfillment(data),
    )
    return transformFulfillment(raw)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const [orderId, shipmentId] = id.split(':')
    if (!orderId || !shipmentId) {
      throw new Error('Invalid fulfillment id format: expected `orderId:shipmentId`')
    }
    const raw = await this.client(credentials).putV2<RawBigCommerceShipment>(
      `/orders/${orderId}/shipments/${shipmentId}`,
      untransformFulfillment(data),
    )
    return transformFulfillment(raw)
  }

  async cancelFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const [orderId, shipmentId] = id.split(':')
    if (!orderId || !shipmentId) {
      throw new Error('Invalid fulfillment id format: expected `orderId:shipmentId`')
    }
    await this.client(credentials).deleteV2(
      `/orders/${orderId}/shipments/${shipmentId}`,
    )
    // BigCommerce deletes shipments rather than cancelling them.
    // Return a minimal cancelled fulfillment.
    return {
      id: shipmentId,
      orderId,
      status: 'CANCELLED',
      metadata: { deleted: true },
    }
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listRefunds requires `order_id` in query params')
    }
    const res = await this.client(credentials).get<{ data: RawBigCommerceRefund[] }>(
      `/orders/${String(orderId)}/payment_actions/refunds`,
    )
    return (res.data ?? []).map((r) => transformRefund(r))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const [orderId, refundId] = id.split(':')
    if (!orderId || !refundId) {
      throw new Error('Invalid refund id format: expected `orderId:refundId`')
    }
    const res = await this.client(credentials).get<{ data: RawBigCommerceRefund[] }>(
      `/orders/${orderId}/payment_actions/refunds`,
    )
    const refund = (res.data ?? []).find((r) => String(r.id) === refundId)
    if (!refund) throw new Error(`Refund ${refundId} not found on order ${orderId}`)
    return transformRefund(refund)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const res = await this.client(credentials).post<{ data: RawBigCommerceRefund }>(
      `/orders/${data.orderId}/payment_actions/refunds`,
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
    const res = await this.client(credentials).get<{ data: RawBigCommerceTransaction[] }>(
      `/orders/${String(orderId)}/transactions`,
    )
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const [orderId, txId] = id.split(':')
    if (!orderId || !txId) {
      throw new Error('Invalid transaction id format: expected `orderId:transactionId`')
    }
    const res = await this.client(credentials).get<{ data: RawBigCommerceTransaction[] }>(
      `/orders/${orderId}/transactions`,
    )
    const tx = (res.data ?? []).find((t) => String(t.id) === txId)
    if (!tx) throw new Error(`Transaction ${txId} not found on order ${orderId}`)
    return transformTransaction(tx)
  }

  // createTransaction → 501 (not implemented; BigCommerce transactions are read-only)

  // ── Discounts (Promotions) ────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const res = await this.client(credentials).listV3<RawBigCommercePromotion>(
      '/promotions',
      this.listParams(params),
    )
    return res.items.map((p) => transformDiscount(p))
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.client(credentials).get<{ data: RawBigCommercePromotion }>(
      `/promotions/${id}`,
    )
    return transformDiscount(res.data)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const body = untransformDiscount(data)
    if (data.code) {
      (body as Record<string, unknown>).coupon_code = data.code
    }
    const res = await this.client(credentials).post<{ data: RawBigCommercePromotion }>(
      '/promotions',
      body,
    )
    return transformDiscount(res.data)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.client(credentials).put<{ data: RawBigCommercePromotion }>(
      `/promotions/${id}`,
      untransformDiscount(data),
    )
    return transformDiscount(res.data)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/promotions/${id}`)
  }
}
