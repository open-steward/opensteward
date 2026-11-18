/**
 * Clover adapter for the ecommerce vertical.
 *
 * Maps the Clover REST API to canonical ecommerce resources. Clover is a
 * payments-first POS platform — all URLs are merchant-scoped
 * (`/v3/merchants/{merchantId}/...`). Money values are integer cents.
 *
 * Omitted resources (→ 501): Variants (no parent-child variant model),
 * Fulfillments (POS — no shipping concept), createTransaction (POS card-charging).
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: fulfillment — Clover is a POS/payments platform with no shipping, carrier, or fulfillment lifecycle concept in its REST API.

import type { Credentials, QueryParams } from '@opensteward/shared'
import { pageLocally, pageOffset } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import { exchangeCode as cloverExchangeCode, refreshAccessToken } from './auth'
import { CloverClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyCloverWebhook, parseCloverWebhookEvents } from './webhook'

import { transformProduct, untransformProduct, type RawCloverItem } from './transform/product'
import { transformCollection, untransformCollection, type RawCloverCategory } from './transform/collection'
import { transformLocation, type RawCloverMerchant } from './transform/location'
import { transformInventoryLevel, type RawCloverItemStock } from './transform/inventory'
import { transformCustomer, untransformCustomer, type RawCloverCustomer } from './transform/customer'
import { transformOrder, untransformOrder, type RawCloverOrder } from './transform/order'
import { transformRefund, untransformRefund, type RawCloverRefund } from './transform/refund'
import { transformTransaction, type RawCloverPayment } from './transform/transaction'
import { transformDiscount, untransformDiscount, type RawCloverDiscount } from './transform/discount'

export interface CloverAdapterConfig {
  /** Unused; reserved for future configuration. */
  [key: string]: unknown
}

export class CloverAdapter implements EcommerceAdapter {
  readonly platform = 'clover'
  readonly version = '0.1.0'
  /** "The default limit is 100 elements, and the hard limit is 1000." */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    throw new Error(
      'Clover adapter v1 does not support interactive OAuth. ' +
        'Use POST /v1/connections with pre-generated tokens and ' +
        'extra: { merchantId }.',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return cloverExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshAccessToken(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyCloverWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseCloverWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): CloverClient {
    return new CloverClient(credentials)
  }

  // Still `page × limit`, which skips page 1. Only listRefunds uses it, and its
  // `orders/{orderId}/refunds` path is not in Clover's Platform API reference,
  // so its paging is not fixed until the path is.
  private offset(params: QueryParams): number {
    const page = params.page ?? 0
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    return page * limit
  }

  /**
   * 0-based row `offset` of the caller's 1-based page, strided by the size
   * actually sent: Clover's `offset` is "the number of line items that are
   * excluded from the search results", and `listWithOffset` clamps `limit` to
   * the documented maximum of 1000.
   */
  private rowOffset(params: QueryParams): number {
    return pageOffset(params, Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE))
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.client(credentials)
    const res = await client.listWithOffset<RawCloverItem>(
      'items',
      this.rowOffset(params),
      params.limit ?? DEFAULT_PAGE_SIZE,
    )
    return res.items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.client(credentials)
    const raw = await client.get<RawCloverItem>(`items/${id}`)
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.client(credentials)
    const body = untransformProduct(data)
    const raw = await client.post<RawCloverItem>('items', body)
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.client(credentials)
    const body = untransformProduct(data)
    const raw = await client.post<RawCloverItem>(`items/${id}`, body)
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`items/${id}`)
  }

  // ── Variants — omitted (501) ─────────────────────────────────────────────
  // Clover has no parent-child variant model.

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const client = this.client(credentials)
    const res = await client.listWithOffset<RawCloverCategory>(
      'categories',
      this.rowOffset(params),
      params.limit ?? DEFAULT_PAGE_SIZE,
    )
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.client(credentials)
    const raw = await client.get<RawCloverCategory>(`categories/${id}`)
    return transformCollection(raw)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const client = this.client(credentials)
    const body = untransformCollection(data)
    const raw = await client.post<RawCloverCategory>('categories', body)
    return transformCollection(raw)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.client(credentials)
    const body = untransformCollection(data)
    const raw = await client.post<RawCloverCategory>(`categories/${id}`, body)
    return transformCollection(raw)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`categories/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const client = this.client(credentials)
    // Clover merchant = single location. Fetch merchant info via empty path
    // (base URL already ends with /v3/merchants/{merchantId}/)
    // "Get a single merchant" takes no offset or limit and returns one object,
    // so that one row is the whole collection: page it locally, or page 2
    // serves the same merchant again.
    const raw = await client.get<RawCloverMerchant>('')
    return pageLocally([transformLocation(raw)], params)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const client = this.client(credentials)
    // Only the merchant itself is a location
    if (id !== client.merchantId) {
      throw new Error(`Location not found: ${id}`)
    }
    const raw = await client.get<RawCloverMerchant>('')
    return transformLocation(raw)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const client = this.client(credentials)
    const res = await client.listWithOffset<RawCloverItemStock>(
      'item_stocks',
      this.rowOffset(params),
      params.limit ?? DEFAULT_PAGE_SIZE,
    )
    return res.items.map((s) => transformInventoryLevel(s, client.merchantId))
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // Composite id: {itemId}:{merchantId}
    const [itemId] = id.split(':')
    if (!itemId) {
      throw new Error('Invalid inventory level id format: expected `itemId:merchantId`')
    }
    const client = this.client(credentials)
    const raw = await client.get<RawCloverItemStock>(`item_stocks/${itemId}`)
    return transformInventoryLevel(raw, client.merchantId)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    // Read current, compute new absolute value, then set
    const client = this.client(credentials)
    const current = await client.get<RawCloverItemStock>(`item_stocks/${data.variantId}`)
    const currentQty = current.quantity ?? 0
    const newQty = Math.max(0, currentQty + data.delta)
    await client.post(`item_stocks/${data.variantId}`, {
      quantity: newQty,
    })
    const updated = await client.get<RawCloverItemStock>(`item_stocks/${data.variantId}`)
    return transformInventoryLevel(updated, client.merchantId)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.client(credentials)
    await client.post(`item_stocks/${data.variantId}`, {
      quantity: data.available,
    })
    const updated = await client.get<RawCloverItemStock>(`item_stocks/${data.variantId}`)
    return transformInventoryLevel(updated, client.merchantId)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const client = this.client(credentials)
    const res = await client.listWithOffset<RawCloverCustomer>(
      'customers',
      this.rowOffset(params),
      params.limit ?? DEFAULT_PAGE_SIZE,
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const client = this.client(credentials)
    const raw = await client.get<RawCloverCustomer>(`customers/${id}`)
    return transformCustomer(raw)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const client = this.client(credentials)
    const body = untransformCustomer(data)
    const raw = await client.post<RawCloverCustomer>('customers', body)
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.client(credentials)
    const body = untransformCustomer(data)
    const raw = await client.post<RawCloverCustomer>(`customers/${id}`, body)
    return transformCustomer(raw)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`customers/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.client(credentials)
    const res = await client.listWithOffset<RawCloverOrder>(
      'orders',
      this.rowOffset(params),
      params.limit ?? DEFAULT_PAGE_SIZE,
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.client(credentials)
    const raw = await client.get<RawCloverOrder>(`orders/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = this.client(credentials)
    const body = untransformOrder(data)
    const raw = await client.post<RawCloverOrder>('atomic_order/orders', body)
    return transformOrder(raw)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const client = this.client(credentials)
    const body: Record<string, unknown> = {}
    if (data.note != null) body['note'] = data.note
    if (data.orderNumber != null) body['title'] = data.orderNumber
    const raw = await client.post<RawCloverOrder>(`orders/${id}`, body)
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const client = this.client(credentials)
    // Clover does not have a cancel status per se; delete line items and void payments
    // For now, we mark state via update
    const raw = await client.post<RawCloverOrder>(`orders/${id}`, {
      state: 'locked',
    })
    return transformOrder(raw)
  }

  // ── Fulfillments — omitted (501) ─────────────────────────────────────────
  // Clover is POS — no shipping/fulfillment concept.

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = (params['order_id'] ?? params['orderId']) as string | undefined
    if (!orderId) throw new Error('listRefunds requires `order_id` in query params')
    const client = this.client(credentials)
    const res = await client.listWithOffset<RawCloverRefund>(
      `orders/${orderId}/refunds`,
      this.offset(params),
      params.limit ?? DEFAULT_PAGE_SIZE,
    )
    return res.items.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // Composite id: {orderId}:{refundId}
    const [orderId, refundId] = id.split(':')
    if (!orderId || !refundId) {
      throw new Error('Invalid refund id format: expected `orderId:refundId`')
    }
    const client = this.client(credentials)
    const res = await client.listWithOffset<RawCloverRefund>(
      `orders/${orderId}/refunds`,
    )
    const refund = res.items.find((r) => r.id === refundId)
    if (!refund) throw new Error(`Refund not found: ${id}`)
    return transformRefund(refund)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const client = this.client(credentials)
    const body = untransformRefund(data)
    const raw = await client.post<RawCloverRefund>(
      `orders/${data.orderId}/refunds`,
      body,
    )
    return transformRefund(raw)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const client = this.client(credentials)
    const res = await client.listWithOffset<RawCloverPayment>(
      'payments',
      this.rowOffset(params),
      params.limit ?? DEFAULT_PAGE_SIZE,
    )
    return res.items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = this.client(credentials)
    const raw = await client.get<RawCloverPayment>(`payments/${id}`)
    return transformTransaction(raw)
  }

  // createTransaction omitted — Clover Payments API charges cards at POS (501)

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.client(credentials)
    const res = await client.listWithOffset<RawCloverDiscount>(
      'discounts',
      this.rowOffset(params),
      params.limit ?? DEFAULT_PAGE_SIZE,
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.client(credentials)
    const raw = await client.get<RawCloverDiscount>(`discounts/${id}`)
    return transformDiscount(raw)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const client = this.client(credentials)
    const body = untransformDiscount(data)
    const raw = await client.post<RawCloverDiscount>('discounts', body)
    return transformDiscount(raw)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.client(credentials)
    const body = untransformDiscount(data)
    const raw = await client.post<RawCloverDiscount>(`discounts/${id}`, body)
    return transformDiscount(raw)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`discounts/${id}`)
  }
}
