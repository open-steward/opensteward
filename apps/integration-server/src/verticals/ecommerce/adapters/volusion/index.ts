/**
 * Volusion adapter for the ecommerce vertical.
 *
 * Maps the Volusion REST API to canonical ecommerce resources. Supports both
 * OAuth2 bearer tokens (V2) and legacy API-key auth. Implements ~25/42
 * methods — limited variant, inventory, fulfillment, and discount surface
 * reflects Volusion's legacy all-in-one platform constraints.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Derived: transaction — no dedicated /transactions endpoint; payment data
 *   (CreditCardTransactionID, CreditCardAuthorizationNumber, PaymentStatus,
 *   GrandTotal, PaymentMethodID) is embedded in each Order record. One
 *   Transaction is derived per Order via transformTransaction.
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

import {
  buildAuthUrl,
  exchangeCode as volusionExchangeCode,
  refreshAccessToken,
} from './auth'
import { VolusionClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyVolusionWebhook, parseVolusionWebhookEvents } from './webhook'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawVolusionProduct,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawVolusionCategory,
} from './transform/collection'
import {
  transformInventoryLevel,
  type RawVolusionInventory,
} from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawVolusionCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawVolusionOrder,
} from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawVolusionShipment,
} from './transform/fulfillment'
import {
  transformDiscount,
  untransformDiscount,
  type RawVolusionCoupon,
} from './transform/discount'
import {
  transformLocation,
  type RawVolusionLocation,
} from './transform/location'
import {
  transformRefund,
  untransformRefund,
  type RawVolusionCreditOrder,
} from './transform/refund'
import {
  transformTransaction,
  type RawVolusionOrderPayment,
} from './transform/transaction'

export interface VolusionAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** Base URL for the Volusion API (defaults to https://api.volusion.com/v1). */
  baseUrl?: string
}

export class VolusionAdapter implements EcommerceAdapter {
  readonly platform = 'volusion'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private baseUrl?: string

  constructor(config: VolusionAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.baseUrl = config.baseUrl
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? [], state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return volusionExchangeCode(
      code,
      this.clientId,
      this.clientSecret,
      this.redirectUri,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    return refreshAccessToken(
      credentials.refreshToken,
      this.clientId,
      this.clientSecret,
    )
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyVolusionWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const topic =
      (payload['__topic'] as string | undefined) ??
      (payload['topic'] as string | undefined)
    return parseVolusionWebhookEvents(payload, topic)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): VolusionClient {
    return new VolusionClient(credentials, this.baseUrl)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params['page'] || params['pageNumber']) {
      out.pageNumber = params['page'] ?? params['pageNumber']
    }
    if (params.updatedAfter) {
      out.updatedAfter = params.updatedAfter.toISOString()
    }
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).list<RawVolusionProduct>(
      '/products',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<RawVolusionProduct>(
      `/products/${id}`,
    )
    return transformProduct(res)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).post<RawVolusionProduct>(
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
    const res = await this.client(credentials).put<RawVolusionProduct>(
      `/products/${id}`,
      untransformProduct(data),
    )
    return transformProduct(res)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/products/${id}`)
  }

  // ── Variants (limited — Volusion models these on the product) ─────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['product_id']
    if (productId) {
      const product = await this.client(credentials).get<RawVolusionProduct>(
        `/products/${String(productId)}`,
      )
      return (product.Variants ?? []).map((v) => transformVariant(v))
    }
    // Fallback: fetch products and flatten variants
    const res = await this.client(credentials).list<RawVolusionProduct>(
      '/products',
      this.listParams(params),
    )
    return res.items.flatMap((p) =>
      (p.Variants ?? []).map((v) => transformVariant(v)),
    )
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Volusion doesn't have a standalone variant endpoint; use composite id
    // format "productId:variantId" or just fetch the variant from the product.
    const [productId, variantId] = id.includes(':') ? id.split(':') : [id, undefined]
    const product = await this.client(credentials).get<RawVolusionProduct>(
      `/products/${productId}`,
    )
    const raw = variantId
      ? (product.Variants ?? []).find((v) => String(v.VariantID) === variantId)
      : (product.Variants ?? [])[0]
    if (!raw) throw new Error(`Variant ${id} not found`)
    return transformVariant(raw)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const [productId] = id.includes(':') ? id.split(':') : [id]
    const res = await this.client(credentials).put<RawVolusionProduct>(
      `/products/${productId}`,
      { Variants: [untransformVariant(data)] },
    )
    const updated = (res.Variants ?? [])[0]
    if (!updated) throw new Error('Variant update returned no data')
    return transformVariant(updated)
  }

  // ── Collections (Categories) ──────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const res = await this.client(credentials).list<RawVolusionCategory>(
      '/categories',
      this.listParams(params),
    )
    return res.items.map((c) => transformCollection(c))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.client(credentials).get<RawVolusionCategory>(
      `/categories/${id}`,
    )
    return transformCollection(res)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).post<RawVolusionCategory>(
      '/categories',
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).put<RawVolusionCategory>(
      `/categories/${id}`,
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/categories/${id}`)
  }

  // ── Inventory (single-location) ──────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const res = await this.client(credentials).list<RawVolusionInventory>(
      '/inventory',
      this.listParams(params),
    )
    return res.items.map(transformInventoryLevel)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const res = await this.client(credentials).put<RawVolusionInventory>(
      `/inventory/${data.variantId}`,
      { StockQuantity: data.available },
    )
    return transformInventoryLevel(res)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).list<RawVolusionLocation>(
      '/stores',
      this.listParams(params),
    )
    return res.items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<RawVolusionLocation>(`/stores/${id}`)
    return transformLocation(res)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).list<RawVolusionCustomer>(
      '/customers',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawVolusionCustomer>(
      `/customers/${id}`,
    )
    return transformCustomer(res)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).post<RawVolusionCustomer>(
      '/customers',
      untransformCustomer(data),
    )
    return transformCustomer(res)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).put<RawVolusionCustomer>(
      `/customers/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(res)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/customers/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.client(credentials).list<RawVolusionOrder>(
      '/orders',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<RawVolusionOrder>(
      `/orders/${id}`,
    )
    return transformOrder(res)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const res = await this.client(credentials).put<RawVolusionOrder>(
      `/orders/${id}`,
      untransformOrder(data),
    )
    return transformOrder(res)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const res = await this.client(credentials).put<RawVolusionOrder>(
      `/orders/${id}/cancel`,
      { CancelReason: data?.reason },
    )
    return transformOrder(res)
  }

  // ── Fulfillments (limited) ───────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listFulfillments requires `order_id` in query params')
    }
    const res = await this.client(credentials).list<RawVolusionShipment>(
      `/orders/${String(orderId)}/shipments`,
      this.listParams(params),
    )
    return res.items.map(transformFulfillment)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const res = await this.client(credentials).post<RawVolusionShipment>(
      `/orders/${data.orderId}/shipments`,
      untransformFulfillment(data),
    )
    return transformFulfillment(res)
  }

  // ── Refunds (Credit Orders) ──────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      // Volusion credit orders are scoped to an original order
      throw new Error('listRefunds requires `order_id` in query params for Volusion')
    }
    const res = await this.client(credentials).list<RawVolusionCreditOrder>(
      `/orders/${String(orderId)}/creditorders`,
      this.listParams(params),
    )
    return res.items.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<RawVolusionCreditOrder>(`/creditorders/${id}`)
    return transformRefund(res)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId for Volusion')
    const res = await this.client(credentials).post<RawVolusionCreditOrder>(
      `/orders/${data.orderId}/creditorder`,
      untransformRefund(data),
    )
    return transformRefund(res)
  }

  // ── Transactions (derived from Orders) ───────────────────────────────────
  //
  // Volusion has no dedicated /transactions endpoint. Payment data is embedded
  // in each Order record. listTransactions fetches orders and maps each to one
  // Transaction; getTransaction fetches a single order by id.

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const res = await this.client(credentials).list<RawVolusionOrderPayment>(
      '/orders',
      this.listParams(params),
    )
    return res.items.map((o) => transformTransaction(o))
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // id is expected to be the Volusion OrderID
    const res = await this.client(credentials).get<RawVolusionOrderPayment>(
      `/orders/${id}`,
    )
    return transformTransaction(res)
  }

  // ── Discounts (Coupons) ──────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const res = await this.client(credentials).list<RawVolusionCoupon>(
      '/coupons',
      this.listParams(params),
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.client(credentials).get<RawVolusionCoupon>(
      `/coupons/${id}`,
    )
    return transformDiscount(res)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.client(credentials).post<RawVolusionCoupon>(
      '/coupons',
      untransformDiscount(data),
    )
    return transformDiscount(res)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.client(credentials).put<RawVolusionCoupon>(
      `/coupons/${id}`,
      untransformDiscount(data),
    )
    return transformDiscount(res)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/coupons/${id}`)
  }
}
