import { simpleApiKey } from '@opensteward/shared'
/**
 * X-Cart adapter for the ecommerce vertical.
 *
 * Maps the X-Cart REST API (`/api/`) to the canonical ecommerce resources.
 * X-Cart is a self-hosted PHP ecommerce platform that uses a static API key
 * sent via the `X-Auth-Token` header — there is no OAuth code-exchange flow.
 *
 * Required credentials:
 *  - `accessToken` = X-Cart API key (X-Auth-Token header value)
 *  - `extra.baseUrl` = full base URL of the X-Cart store
 *    (e.g. `https://mystore.example.com`)
 *
 * Implemented resources: products, collections (categories), orders, customers,
 * fulfillments (derived from order shipping), and inventory levels.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: location — X-Cart REST API has no location resource; the
 *   platform is a single-install self-hosted system with no multi-location /
 *   fulfillment-center concept exposed via REST.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'

import {
  getAuthUrl as xcartGetAuthUrl,
  exchangeCode as xcartExchangeCode,
  refreshCredentials as xcartRefreshCredentials,
} from './auth'
import { XCartClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import {
  transformProduct,
  untransformProduct,
  type XCartProduct,
} from './transform/product'
import { transformOrder, type XCartOrder } from './transform/order'
import { transformCustomer, type XCartProfile } from './transform/customer'
import { transformFulfillment } from './transform/fulfillment'
import { transformInventoryLevel } from './transform/inventory'
import { transformCollection, type XCartCategory } from './transform/collection'
import { transformDiscount, type XCartCoupon } from './transform/discount'
import { transformRefund, type XCartRefund } from './transform/refund'
import { transformTransaction, type XCartTransaction } from './transform/transaction'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class XCartAdapter implements EcommerceAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'xcart'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return xcartGetAuthUrl(state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return xcartExchangeCode(code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return xcartRefreshCredentials(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): XCartClient {
    return new XCartClient(credentials)
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
    const res = await this.clientFor(credentials).listWithPage<XCartProduct>(
      '/products',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.clientFor(credentials).get<XCartProduct>(`/products/${id}`)
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const raw = await this.clientFor(credentials).post<XCartProduct>(
      '/products',
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const raw = await this.clientFor(credentials).put<XCartProduct>(
      `/products/${id}`,
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/products/${id}`)
  }

  // ── Collections (categories) ──────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const res = await this.clientFor(credentials).listWithPage<XCartCategory>(
      '/categories',
      this.listParams(params),
    )
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.clientFor(credentials).get<XCartCategory>(`/categories/${id}`)
    return transformCollection(raw)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.clientFor(credentials).listWithPage<XCartOrder>(
      '/orders',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.clientFor(credentials).get<XCartOrder>(`/orders/${id}`)
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const raw = await this.clientFor(credentials).put<XCartOrder>(`/orders/${id}`, {
      status: 'Canceled',
      payment_status: 'Declined',
    })
    return transformOrder(raw)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.clientFor(credentials).listWithPage<XCartProfile>(
      '/profiles',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.clientFor(credentials).get<XCartProfile>(`/profiles/${id}`)
    return transformCustomer(raw)
  }

  // ── Fulfillments (derived from orders) ───────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    // X-Cart has no standalone fulfillment resource. We list orders that
    // have been shipped and synthesize one fulfillment per order.
    const listP: Record<string, unknown> = {
      ...this.listParams(params),
      shipping_status: 'Shipped',
    }
    const res = await this.clientFor(credentials).listWithPage<XCartOrder>('/orders', listP)
    return res.items.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Canonical fulfillment id = `{orderId}-fulfillment`.
    const orderId = id.replace(/-fulfillment$/, '')
    const raw = await this.clientFor(credentials).get<XCartOrder>(`/orders/${orderId}`)
    return transformFulfillment(raw)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const res = await this.clientFor(credentials).listWithPage<XCartProduct>(
      '/products',
      this.listParams(params),
    )
    return res.items.map(transformInventoryLevel)
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // id = `{productId}:default:default` or `{productId}:default`
    const productId = id.split(':')[0]!
    const raw = await this.clientFor(credentials).get<XCartProduct>(`/products/${productId}`)
    return transformInventoryLevel(raw)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    // variantId = `{productId}:default`
    const productId = data.variantId.split(':')[0]!
    const raw = await this.clientFor(credentials).put<XCartProduct>(`/products/${productId}`, {
      quantity: data.available,
    })
    return transformInventoryLevel(raw)
  }

  // ── Discounts (coupons) ───────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const res = await this.clientFor(credentials).listWithPage<XCartCoupon>(
      '/coupons',
      this.listParams(params),
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const raw = await this.clientFor(credentials).get<XCartCoupon>(`/coupons/${id}`)
    return transformDiscount(raw)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = (params['order_id'] ?? params['orderId']) as string | undefined
    if (!orderId) throw new Error('X-Cart listRefunds requires order_id in params')
    const res = await this.clientFor(credentials).listWithPage<XCartRefund>(
      `/orders/${orderId}/refunds`,
      this.listParams(params),
    )
    return res.items.map((r) => transformRefund(r, orderId))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // id expected as `orderId:refundId`
    const [orderId, refundId] = id.split(':')
    if (!orderId || !refundId) {
      throw new Error('X-Cart getRefund expects id as "orderId:refundId"')
    }
    const raw = await this.clientFor(credentials).get<XCartRefund>(
      `/orders/${orderId}/refunds/${refundId}`,
    )
    return transformRefund(raw, orderId)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const orderId = (params['order_id'] ?? params['orderId']) as string | undefined
    if (!orderId) throw new Error('X-Cart listTransactions requires order_id in params')
    const res = await this.clientFor(credentials).listWithPage<XCartTransaction>(
      `/orders/${orderId}/transactions`,
      this.listParams(params),
    )
    return res.items.map((t) => transformTransaction(t, orderId))
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // id expected as `orderId:transactionId`
    const [orderId, transactionId] = id.split(':')
    if (!orderId || !transactionId) {
      throw new Error('X-Cart getTransaction expects id as "orderId:transactionId"')
    }
    const raw = await this.clientFor(credentials).get<XCartTransaction>(
      `/orders/${orderId}/transactions/${transactionId}`,
    )
    return transformTransaction(raw, orderId)
  }
}
