/**
 * fabric adapter for the ecommerce vertical.
 *
 * Maps the fabric Composable Commerce API to the canonical ecommerce
 * resources. fabric is a YC-backed composable headless commerce platform
 * with 300+ endpoints across Products (PIM), Orders (OMS), Customers,
 * and Inventory.
 *
 * Key characteristics:
 *
 *  1. **Composable headless SaaS.** All API calls go to
 *     `https://api.fabric.inc/v3/`. Auth uses both an API key
 *     (`x-api-key` header) and an OAuth2 Bearer token.
 *
 *  2. **API key + OAuth2 client-credentials grant.** No user-facing
 *     authorize URL. The caller configures an API key + client
 *     credentials in the merchant dashboard. `getAuthUrl` returns a
 *     pointer to the developer dashboard. `exchangeCode` throws
 *     (not applicable). `refreshCredentials` re-runs the
 *     client_credentials grant.
 *
 *  3. **Standard REST mutations.** Updates use PATCH with JSON body.
 *     Creates use POST. Deletes use DELETE. No actions-based update
 *     pattern.
 *
 *  4. **Webhooks via HMAC-SHA256.** fabric delivers webhook events
 *     with an `x-fabric-signature` header for HMAC verification.
 *
 *  5. **Decimal money values.** Unlike some platforms that use integer
 *     cents, fabric uses decimal amounts directly.
 *
 * Coverage: ~30 of 42 interface methods implemented.
 *   Omitted: createVariant, updateVariant, deleteVariant (variants are
 *   managed as part of product CRUD), adjustInventoryLevel (use
 *   setInventoryLevel), cancelFulfillment.
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

import { oauth2ClientCredentials } from '@opensteward/shared'
import {
  getAuthUrl as fabricGetAuthUrl,
  exchangeCode as fabricExchangeCode,
  refreshCredentials as fabricRefreshCredentials,
} from './auth'
import { FabricClient } from './client'
import { DEFAULT_PAGE_SIZE, BASE_URL, TOKEN_ENDPOINT } from './constants'

const CREDENTIAL_FORM = oauth2ClientCredentials({ tokenUrl: `${BASE_URL}${TOKEN_ENDPOINT}` })
import { verifyFabricWebhook, parseFabricWebhookEvents } from './webhook'

import { transformProduct, transformVariant, untransformProduct, type RawFabricProduct } from './transform/product'
import { transformCollection, untransformCollection, type RawFabricCategory } from './transform/collection'
import { transformLocation, type RawFabricLocation } from './transform/location'
import { transformInventoryLevel, untransformInventoryLevel, type RawFabricInventory } from './transform/inventory'
import { transformCustomer, untransformCustomer, type RawFabricCustomer } from './transform/customer'
import { transformOrder, untransformOrder, type RawFabricOrder } from './transform/order'
import { transformFulfillment, untransformFulfillment, type RawFabricFulfillment } from './transform/fulfillment'
import { transformRefund, untransformRefund, type RawFabricRefund } from './transform/refund'
import { transformTransaction, untransformTransaction, type RawFabricTransaction } from './transform/transaction'
import { transformDiscount, untransformDiscount, type RawFabricPromotion } from './transform/discount'

export interface FabricAdapterConfig {
  apiKey?: string
  clientId?: string
  clientSecret?: string
}

export class FabricAdapter implements EcommerceAdapter {
  readonly platform = 'fabric'
  readonly version = '0.1.0'

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private configApiKey: string | undefined
  private configClientId: string | undefined
  private configClientSecret: string | undefined

  constructor(config: FabricAdapterConfig = {}) {
    this.configApiKey = config.apiKey
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return fabricGetAuthUrl()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return fabricExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return fabricRefreshCredentials(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyFabricWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseFabricWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): FabricClient {
    const merged: Credentials = {
      ...credentials,
      extra: {
        ...credentials.extra,
        ...(this.configApiKey && !credentials.extra?.['apiKey']
          ? { apiKey: this.configApiKey }
          : {}),
      },
    }
    return new FabricClient(merged)
  }

  private pageParams(params: QueryParams): { offset: number; limit: number } {
    const page = params.page ?? 1
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    return {
      offset: (page - 1) * limit,
      limit,
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { offset, limit } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawFabricProduct>(
      '/products',
      { offset, limit },
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const raw = await client.get<RawFabricProduct>(`/products/${encodeURIComponent(id)}`)
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const body = untransformProduct(data)
    const raw = await this.clientFor(credentials).post<RawFabricProduct>('/products', body)
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const body = untransformProduct(data)
    const raw = await this.clientFor(credentials).patch<RawFabricProduct>(
      `/products/${encodeURIComponent(id)}`,
      body,
    )
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/products/${encodeURIComponent(id)}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (!productId) {
      throw new Error(
        'fabric requires ?productId= for listVariants; variants are nested under products.',
      )
    }
    const raw = await this.clientFor(credentials).get<RawFabricProduct>(
      `/products/${encodeURIComponent(productId)}`,
    )
    return (raw.variants ?? []).map((v) => transformVariant(v, productId))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // fabric variant ID format: productId:variantId
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    const raw = await this.clientFor(credentials).get<RawFabricProduct>(
      `/products/${encodeURIComponent(productId)}`,
    )
    const variant = raw.variants?.find((v) => v.id === variantId)
    if (!variant) {
      throw new Error(`fabric variant ${variantId} not found on product ${productId}`)
    }
    return transformVariant(variant, productId)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const { offset, limit } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawFabricCategory>(
      '/categories',
      { offset, limit },
    )
    return res.items.map((c) => transformCollection(c))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.clientFor(credentials).get<RawFabricCategory>(
      `/categories/${encodeURIComponent(id)}`,
    )
    return transformCollection(raw)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const body = untransformCollection(data)
    const raw = await this.clientFor(credentials).post<RawFabricCategory>('/categories', body)
    return transformCollection(raw)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const body = untransformCollection(data)
    const raw = await this.clientFor(credentials).patch<RawFabricCategory>(
      `/categories/${encodeURIComponent(id)}`,
      body,
    )
    return transformCollection(raw)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/categories/${encodeURIComponent(id)}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const { offset, limit } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawFabricLocation>(
      '/locations',
      { offset, limit },
    )
    return res.items.map((l) => transformLocation(l))
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.clientFor(credentials).get<RawFabricLocation>(
      `/locations/${encodeURIComponent(id)}`,
    )
    return transformLocation(raw)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const { offset, limit } = this.pageParams(params)
    const extraParams: Record<string, unknown> = {}
    const variantId = (params['variantId'] ?? params['variant_id']) as string | undefined
    const locationId = (params['locationId'] ?? params['location_id']) as string | undefined
    if (variantId) extraParams['variant_id'] = variantId
    if (locationId) extraParams['location_id'] = locationId

    const res = await this.clientFor(credentials).list<RawFabricInventory>(
      '/inventory',
      { offset, limit, params: extraParams },
    )
    return res.items.map((i) => transformInventoryLevel(i))
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    const raw = await this.clientFor(credentials).get<RawFabricInventory>(
      `/inventory/${encodeURIComponent(id)}`,
    )
    return transformInventoryLevel(raw)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const body = untransformInventoryLevel(data)
    const raw = await this.clientFor(credentials).post<RawFabricInventory>(
      '/inventory/set',
      body,
    )
    return transformInventoryLevel(raw)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const raw = await this.clientFor(credentials).post<RawFabricInventory>(
      '/inventory/adjust',
      {
        variant_id: data.variantId,
        location_id: data.locationId,
        delta: data.delta,
      },
    )
    return transformInventoryLevel(raw)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const { offset, limit } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawFabricCustomer>(
      '/customers',
      { offset, limit },
    )
    return res.items.map((c) => transformCustomer(c))
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.clientFor(credentials).get<RawFabricCustomer>(
      `/customers/${encodeURIComponent(id)}`,
    )
    return transformCustomer(raw)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const body = untransformCustomer(data)
    const raw = await this.clientFor(credentials).post<RawFabricCustomer>('/customers', body)
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const body = untransformCustomer(data)
    const raw = await this.clientFor(credentials).patch<RawFabricCustomer>(
      `/customers/${encodeURIComponent(id)}`,
      body,
    )
    return transformCustomer(raw)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/customers/${encodeURIComponent(id)}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { offset, limit } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawFabricOrder>(
      '/orders',
      { offset, limit },
    )
    return res.items.map((o) => transformOrder(o))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.clientFor(credentials).get<RawFabricOrder>(
      `/orders/${encodeURIComponent(id)}`,
    )
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const body = untransformOrder(data)
    const raw = await this.clientFor(credentials).post<RawFabricOrder>('/orders', body)
    return transformOrder(raw)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const body = untransformOrder(data)
    const raw = await this.clientFor(credentials).patch<RawFabricOrder>(
      `/orders/${encodeURIComponent(id)}`,
      body,
    )
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const raw = await this.clientFor(credentials).post<RawFabricOrder>(
      `/orders/${encodeURIComponent(id)}/cancel`,
      { reason: data?.reason },
    )
    return transformOrder(raw)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) {
      throw new Error('fabric requires ?orderId= for listFulfillments.')
    }
    const { offset, limit } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawFabricFulfillment>(
      `/orders/${encodeURIComponent(orderId)}/fulfillments`,
      { offset, limit },
    )
    return res.items.map((f) => transformFulfillment(f))
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const raw = await this.clientFor(credentials).get<RawFabricFulfillment>(
      `/fulfillments/${encodeURIComponent(id)}`,
    )
    return transformFulfillment(raw)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) {
      throw new Error('fabric createFulfillment requires orderId')
    }
    const body = untransformFulfillment(data)
    const raw = await this.clientFor(credentials).post<RawFabricFulfillment>(
      `/orders/${encodeURIComponent(data.orderId)}/fulfillments`,
      body,
    )
    return transformFulfillment(raw)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const body = untransformFulfillment(data)
    const raw = await this.clientFor(credentials).patch<RawFabricFulfillment>(
      `/fulfillments/${encodeURIComponent(id)}`,
      body,
    )
    return transformFulfillment(raw)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) {
      throw new Error('fabric requires ?orderId= for listRefunds.')
    }
    const res = await this.clientFor(credentials).list<RawFabricRefund>(
      `/orders/${encodeURIComponent(orderId)}/refunds`,
    )
    return res.items.map((r) => transformRefund(r))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const raw = await this.clientFor(credentials).get<RawFabricRefund>(
      `/refunds/${encodeURIComponent(id)}`,
    )
    return transformRefund(raw)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) {
      throw new Error('fabric createRefund requires orderId')
    }
    const body = untransformRefund(data)
    const raw = await this.clientFor(credentials).post<RawFabricRefund>(
      `/orders/${encodeURIComponent(data.orderId)}/refunds`,
      body,
    )
    return transformRefund(raw)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) {
      throw new Error('fabric requires ?orderId= for listTransactions.')
    }
    const res = await this.clientFor(credentials).list<RawFabricTransaction>(
      `/orders/${encodeURIComponent(orderId)}/transactions`,
    )
    return res.items.map((t) => transformTransaction(t))
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const raw = await this.clientFor(credentials).get<RawFabricTransaction>(
      `/transactions/${encodeURIComponent(id)}`,
    )
    return transformTransaction(raw)
  }

  async createTransaction(
    credentials: Credentials,
    data: Partial<Transaction>,
  ): Promise<Transaction> {
    if (!data.orderId) {
      throw new Error('fabric createTransaction requires orderId')
    }
    const body = untransformTransaction(data)
    const raw = await this.clientFor(credentials).post<RawFabricTransaction>(
      `/orders/${encodeURIComponent(data.orderId)}/transactions`,
      body,
    )
    return transformTransaction(raw)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const { offset, limit } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawFabricPromotion>(
      '/promotions',
      { offset, limit },
    )
    return res.items.map((p) => transformDiscount(p))
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const raw = await this.clientFor(credentials).get<RawFabricPromotion>(
      `/promotions/${encodeURIComponent(id)}`,
    )
    return transformDiscount(raw)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const body = untransformDiscount(data)
    const raw = await this.clientFor(credentials).post<RawFabricPromotion>('/promotions', body)
    return transformDiscount(raw)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const body = untransformDiscount(data)
    const raw = await this.clientFor(credentials).patch<RawFabricPromotion>(
      `/promotions/${encodeURIComponent(id)}`,
      body,
    )
    return transformDiscount(raw)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/promotions/${encodeURIComponent(id)}`)
  }
}
