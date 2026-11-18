/**
 * Loyverse adapter for the ecommerce vertical.
 *
 * Loyverse is a cloud-based POS (Point of Sale) system. Its API exposes:
 *   - Items (products) + variants
 *   - Categories (collections)
 *   - Stores (locations)
 *   - Inventory levels
 *   - Customers
 *   - Receipts (orders) + refund receipts
 *   - Discounts
 *
 * Resources NOT available in Loyverse's API:
 *   - Fulfillments (POS sales are fulfilled at the point of sale implicitly)
 *   - Transactions (payments are embedded in receipts, not a separate resource;
 *     we surface them as read-only from the receipt context)
 *   - Webhooks (no public webhook signature scheme documented)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: fulfillment — Loyverse is a POS system; sales are fulfilled
 *   implicitly at the point of sale. No fulfillment or shipment endpoint
 *   exists in the Loyverse API.
 *
 * Auth: OAuth 2.0 Authorization Code Flow. Access tokens expire; refresh
 * tokens are long-lived. `refreshCredentials` calls the token endpoint.
 *
 * Base URL: https://api.loyverse.com/v1.0
 * OAuth authorize: https://cloud.loyverse.com/oauth/authorize
 * OAuth token: https://api.loyverse.com/oauth/token
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'

import { buildAuthUrl, exchangeCode as loyverseExchangeCode, refreshAccessToken } from './auth'
import { LoyverseClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawLoyverseItem,
  type RawLoyverseVariant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawLoyverseCategory,
} from './transform/collection'
import {
  transformLocation,
  type RawLoyverseStore,
} from './transform/location'
import {
  transformInventoryLevel,
  type RawLoyverseInventoryLevel,
} from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawLoyverseCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawLoyverseReceipt,
} from './transform/order'
import {
  transformRefund,
  untransformRefund,
} from './transform/refund'
import {
  transformTransaction,
} from './transform/transaction'
import {
  transformDiscount,
  untransformDiscount,
  type RawLoyverseDiscount,
} from './transform/discount'

export interface LoyverseAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export class LoyverseAdapter implements EcommerceAdapter {
  readonly platform = 'loyverse'
  readonly version = '0.1.0'
  /**
   * "Default value is 50 and maximum is 250" (API reference, pagination).
   * Every list method honours it: the cursor endpoints page at the requested
   * size, variants / orders / refunds are cut from the cursor stream with
   * pageByRows, and stores / discounts (unpaginated) are sliced locally.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string

  constructor(config: LoyverseAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(this.clientId, this.redirectUri, state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return loyverseExchangeCode(code, this.clientId, this.clientSecret, this.redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) {
      // No refresh token available — return credentials unchanged.
      return credentials
    }
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): LoyverseClient {
    return new LoyverseClient(credentials)
  }

  /**
   * The filters a list request sends besides `limit` and `cursor`. A
   * followup request that carries a cursor has always dropped
   * `updated_at_min`: the cursor holds the position in the filtered walk.
   */
  private filterParams(params: QueryParams, cursor: unknown): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    if (!cursor && params.updatedAfter) {
      out.updated_at_min = params.updatedAfter.toISOString()
    }
    return out
  }

  /** The caller's page size, clamped to the documented 1..250. */
  private pageSize(params: QueryParams): number {
    const limit = params.limit
    return typeof limit === 'number' && Number.isFinite(limit) && limit >= 1
      ? Math.min(Math.floor(limit), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE
  }

  /** Pager scope for one connection. Credentials carry no merchant id. */
  private scope(credentials: Credentials): string {
    return connectionScope('loyverse', credentials)
  }

  /**
   * A caller page of an endpoint where one upstream page is one caller page:
   * `limit` is the caller's size and page N is reached through the body
   * `cursor` of page N-1 ("When the endpoint sends the final set of results,
   * the response body will not include a cursor field").
   *
   * A caller that already holds an upstream `cursor` is at a position, not a
   * page number, and gets that one page.
   */
  private async pageCursor<T>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    resourceKey: string,
    extra: Record<string, unknown> = {},
  ): Promise<T[]> {
    const client = this.client(credentials)
    const size = this.pageSize(params)
    const explicit = params['cursor']
    const fetchPage = async (cursor: unknown): Promise<{ items: T[]; next?: string }> => {
      const res = await client.listWithCursor<T>(path, resourceKey, {
        ...extra,
        ...this.filterParams(params, cursor),
        limit: size,
        ...(cursor ? { cursor } : {}),
      })
      return { items: res.items, next: res.nextCursor || undefined }
    }

    let items: T[]
    let hasMore: boolean
    if (explicit) {
      const res = await fetchPage(explicit)
      items = res.items
      hasMore = res.next !== undefined
    } else {
      const key = cursorPagerKey(this.scope(credentials), path, {
        ...extra,
        ...this.filterParams(params, undefined),
        limit: size,
      })
      ;({ items, hasMore } = await pageByCursor<T>(key, params.page, fetchPage))
    }
    const clamped = typeof params.limit === 'number' && size < params.limit
    reportUpstreamPage(params, { hasMore, ...(clamped ? { pageSize: size } : {}) })
    return items
  }

  /**
   * A caller page of rows derived from a cursor endpoint where one upstream
   * page is NOT one caller page: variants flattened out of items, or
   * receipts split into sales and refunds client-side. Upstream pages are
   * always the documented maximum of 250, so row positions do not depend on
   * the caller's limit; pageByRows cuts the caller's page out of the stream.
   */
  private async pageRows<R, T>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    resourceKey: string,
    collection: string,
    derive: (raw: R[]) => T[],
  ): Promise<T[]> {
    const client = this.client(credentials)
    const explicit = params['cursor']
    const fetchPage = async (cursor: string | undefined) => {
      const res = await client.listWithCursor<R>(path, resourceKey, {
        ...this.filterParams(params, cursor),
        limit: explicit ? this.pageSize(params) : MAX_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      })
      return { items: derive(res.items), next: res.nextCursor || undefined }
    }

    if (explicit) {
      const res = await fetchPage(String(explicit))
      reportUpstreamPage(params, { hasMore: res.next !== undefined })
      return res.items
    }
    const key = cursorPagerKey(this.scope(credentials), collection, {
      ...this.filterParams(params, undefined),
      upstreamLimit: MAX_PAGE_SIZE,
    })
    const { items } = await pageByRows<T>(key, params, fetchPage, {
      defaultLimit: DEFAULT_PAGE_SIZE,
    })
    return items
  }

  // ── Products (Items) ──────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const items = await this.pageCursor<RawLoyverseItem>(credentials, params, 'items', 'items')
    return items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawLoyverseItem>(`items/${id}`)
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const raw = await this.client(credentials).post<RawLoyverseItem>(
      'items',
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const raw = await this.client(credentials).post<RawLoyverseItem>('items', {
      id,
      ...untransformProduct(data),
    })
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`items/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    // Variants are flattened out of items so each keeps its item's option
    // names. An upstream `limit` counts items, not variants, so the caller's
    // page is cut from the flattened stream.
    return this.pageRows<RawLoyverseItem, ProductVariant>(
      credentials,
      params,
      'items',
      'items',
      'variants',
      (items) =>
        items.flatMap((item) =>
          (item.variants ?? []).map((v: RawLoyverseVariant) =>
            transformVariant(v, 'USD', [item.option1_name, item.option2_name, item.option3_name]),
          ),
        ),
    )
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const raw = await this.client(credentials).get<RawLoyverseVariant>(`variants/${id}`)
    return transformVariant(raw)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const raw = await this.client(credentials).post<RawLoyverseVariant>('variants', {
      variant_id: id,
      ...untransformVariant(data),
    })
    return transformVariant(raw)
  }

  // ── Collections (Categories) ──────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const items = await this.pageCursor<RawLoyverseCategory>(
      credentials,
      params,
      'categories',
      'categories',
    )
    return items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.client(credentials).get<RawLoyverseCategory>(`categories/${id}`)
    return transformCollection(raw)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const raw = await this.client(credentials).post<RawLoyverseCategory>(
      'categories',
      untransformCollection(data),
    )
    return transformCollection(raw)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const raw = await this.client(credentials).post<RawLoyverseCategory>('categories', {
      id,
      ...untransformCollection(data),
    })
    return transformCollection(raw)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`categories/${id}`)
  }

  // ── Locations (Stores) ────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    // GET /stores documents neither `limit` nor `cursor`: it returns every
    // store, so the caller's page is sliced locally.
    const res = await this.client(credentials).get<{ stores?: RawLoyverseStore[] }>('stores')
    return pageLocally((res.stores ?? []).map(transformLocation), params)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawLoyverseStore>(`stores/${id}`)
    return transformLocation(raw)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const extra: Record<string, unknown> = {}
    // Optional filter by variant_id or store_id
    const variantIds = params['variant_ids'] ?? params['variantIds']
    const storeId = params['store_id'] ?? params['storeId']
    if (variantIds) extra.variant_ids = variantIds
    if (storeId) extra.store_id = storeId

    const items = await this.pageCursor<RawLoyverseInventoryLevel>(
      credentials,
      params,
      'inventory',
      'inventory_levels',
      extra,
    )
    return items.map(transformInventoryLevel)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    // Loyverse batch-updates inventory via POST /inventory with an
    // inventory_levels array.
    const body = {
      inventory_levels: [
        {
          variant_id: data.variantId,
          store_id: data.locationId,
          in_stock: data.available,
        },
      ],
    }
    const res = await this.client(credentials).post<{
      inventory_levels: RawLoyverseInventoryLevel[]
    }>('inventory', body)
    const updated = res.inventory_levels?.[0]
    if (!updated) {
      throw new Error('Loyverse did not return updated inventory level')
    }
    return transformInventoryLevel(updated)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const items = await this.pageCursor<RawLoyverseCustomer>(
      credentials,
      params,
      'customers',
      'customers',
    )
    return items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawLoyverseCustomer>(`customers/${id}`)
    return transformCustomer(raw)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const raw = await this.client(credentials).post<RawLoyverseCustomer>(
      'customers',
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const raw = await this.client(credentials).post<RawLoyverseCustomer>('customers', {
      id,
      ...untransformCustomer(data),
    })
    return transformCustomer(raw)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`customers/${id}`)
  }

  // ── Orders (Receipts) ─────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    // Filter to SALE receipts only when listing orders (refunds are separate).
    // GET /receipts has no receipt-type filter, so an upstream page holds
    // fewer orders than its `limit`: the caller's page is cut from the stream.
    return this.pageRows<RawLoyverseReceipt, Order>(
      credentials,
      params,
      'receipts',
      'receipts',
      'orders',
      (receipts) =>
        receipts.filter((r) => r.receipt_type !== 'REFUND').map((r) => transformOrder(r)),
    )
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.client(credentials).get<RawLoyverseReceipt>(`receipts/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const raw = await this.client(credentials).post<RawLoyverseReceipt>(
      'receipts',
      untransformOrder(data),
    )
    return transformOrder(raw)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    // Only REFUND receipts, cut from the receipt stream like listOrders.
    return this.pageRows<RawLoyverseReceipt, Refund>(
      credentials,
      params,
      'receipts',
      'receipts',
      'refunds',
      (receipts) =>
        receipts.filter((r) => r.receipt_type === 'REFUND').map((r) => transformRefund(r)),
    )
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const raw = await this.client(credentials).get<RawLoyverseReceipt>(`receipts/${id}`)
    return transformRefund(raw)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId (original receipt_number)')
    const raw = await this.client(credentials).post<RawLoyverseReceipt>(
      `receipts/${data.orderId}/refund`,
      untransformRefund(data),
    )
    return transformRefund(raw)
  }

  // ── Transactions (Payments embedded in receipts) ───────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const receiptId = params['receipt_number'] ?? params['receiptNumber'] ?? params['orderId'] ?? params['order_id']
    if (!receiptId) {
      throw new Error(
        'listTransactions requires `orderId` (receipt_number) in query params',
      )
    }
    const raw = await this.client(credentials).get<RawLoyverseReceipt>(
      `receipts/${String(receiptId)}`,
    )
    return (raw.payments ?? []).map((p, i) =>
      transformTransaction(p, raw.receipt_number, i),
    )
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // Composite id format: `receiptNumber:paymentTypeId:index`
    const parts = id.split(':')
    if (parts.length < 2) {
      throw new Error(
        'Invalid transaction id format: expected `receiptNumber:paymentTypeId:index`',
      )
    }
    const receiptNumber = parts[0]!
    const raw = await this.client(credentials).get<RawLoyverseReceipt>(
      `receipts/${receiptNumber}`,
    )
    const payments = raw.payments ?? []
    // Find by matching the synthesized id pattern
    for (let i = 0; i < payments.length; i++) {
      const tx = transformTransaction(payments[i]!, raw.receipt_number, i)
      if (tx.id === id) return tx
    }
    throw new Error(`Transaction ${id} not found in receipt ${receiptNumber}`)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    // GET /discounts documents neither `limit` nor `cursor`: it returns every
    // discount, so the caller's page is sliced locally.
    const res = await this.client(credentials).get<{ discounts?: RawLoyverseDiscount[] }>(
      'discounts',
      this.filterParams(params, undefined),
    )
    return pageLocally((res.discounts ?? []).map(transformDiscount), params)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const raw = await this.client(credentials).get<RawLoyverseDiscount>(`discounts/${id}`)
    return transformDiscount(raw)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const raw = await this.client(credentials).post<RawLoyverseDiscount>(
      'discounts',
      untransformDiscount(data),
    )
    return transformDiscount(raw)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const raw = await this.client(credentials).post<RawLoyverseDiscount>('discounts', {
      id,
      ...untransformDiscount(data),
    })
    return transformDiscount(raw)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`discounts/${id}`)
  }
}
