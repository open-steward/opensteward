/**
 * Shoper adapter for the ecommerce vertical.
 *
 * Maps the Shoper REST API (`/webapi/rest`) to the canonical ecommerce
 * resources.  Shoper uses an OAuth2 authorization-code flow via its AppStore
 * program; the adapter implements the full auth lifecycle including token
 * refresh.
 *
 * Supported resources:
 *  - Products (list, get, create, update, delete) + child variants
 *  - Categories → Collections (list, get, create, update, delete)
 *  - Users → Customers (list, get, create, update, delete)
 *  - Orders (list, get, create, update, cancel)
 *  - Deliveries → Fulfillments (list, get, create, update)
 *  - Order-Returns → Refunds (list, get, create)
 *  - Order-Transactions → Transactions (list, get)
 *  - Promotion-Codes → Discounts (list, get, create, update, delete)
 *  - Warehouses → Locations (list, get)
 *  - Product stock → InventoryLevels (list, set)
 *
 * Docs: https://developers.shoper.pl/developers/api/getting-started
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

import { buildAuthUrl, exchangeCode as shoperExchangeCode, refreshAccessToken } from './auth'
import { ShoperClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, MAX_PAGE_SIZE } from './constants'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawShoperProduct,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawShoperCategory,
} from './transform/collection'
import {
  transformCustomer,
  untransformCustomer,
  type RawShoperUser,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawShoperOrder,
} from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShoperDelivery,
} from './transform/fulfillment'
import {
  transformRefund,
  untransformRefund,
  type RawShoperOrderReturn,
} from './transform/refund'
import {
  transformTransaction,
  type RawShoperTransaction,
} from './transform/transaction'
import {
  transformDiscount,
  untransformDiscount,
  type RawShoperPromotionCode,
} from './transform/discount'
import {
  transformLocation,
  type RawShoperWarehouse,
} from './transform/location'
import {
  transformInventoryLevel,
  type RawShoperProductStock,
} from './transform/inventory'

export interface ShoperAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** Store URL, e.g. `https://mystore.shoparena.pl`. */
  storeUrl: string
  scopes?: string[]
}

export class ShoperAdapter implements EcommerceAdapter {
  readonly platform = 'shoper'
  readonly version = '0.1.0'

  /** Every list goes through listWithPage, which caps `limit` at 50; the router and the sync worker ask for no more. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private storeUrl: string
  private scopes: string[]

  constructor(config: ShoperAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.storeUrl = config.storeUrl.replace(/\/$/, '')
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(
      this.storeUrl,
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return shoperExchangeCode(
      this.storeUrl,
      code,
      this.clientId,
      this.clientSecret,
      redirectUri,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshAccessToken(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): ShoperClient {
    // Inject storeUrl into credentials.extra so the client can build the baseURL.
    const merged: Credentials = {
      ...credentials,
      extra: {
        storeUrl: this.storeUrl,
        ...credentials.extra,
      },
    }
    return new ShoperClient(merged)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page != null) out['page'] = params.page
    if (params.updatedAfter) out['filters[edit_date][gte]'] = params.updatedAfter.toISOString()
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    // Filter out child (variant) products — show only parent products.
    const extra: Record<string, unknown> = {
      ...this.listParams(params),
      'filters[main_product_id][eq]': 0,
    }
    const res = await this.client(credentials).listWithPage<RawShoperProduct>('products', extra)
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawShoperProduct>(`products/${id}`)
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const raw = await this.client(credentials).post<RawShoperProduct>(
      'products',
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const raw = await this.client(credentials).put<RawShoperProduct>(
      `products/${id}`,
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`products/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['product_id']
    const extra: Record<string, unknown> = this.listParams(params)
    if (productId) {
      extra['filters[main_product_id][eq]'] = String(productId)
    }
    const res = await this.client(credentials).listWithPage<RawShoperProduct>('products', extra)
    return res.items.map((v) => transformVariant(v))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const raw = await this.client(credentials).get<RawShoperProduct>(`products/${id}`)
    return transformVariant(raw)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const raw = await this.client(credentials).put<RawShoperProduct>(
      `products/${id}`,
      untransformVariant(data),
    )
    return transformVariant(raw)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const res = await this.client(credentials).listWithPage<RawShoperCategory>(
      'categories',
      this.listParams(params),
    )
    return res.items.map((c) => transformCollection(c))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.client(credentials).get<RawShoperCategory>(`categories/${id}`)
    return transformCollection(raw)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const raw = await this.client(credentials).post<RawShoperCategory>(
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
    const raw = await this.client(credentials).put<RawShoperCategory>(
      `categories/${id}`,
      untransformCollection(data),
    )
    return transformCollection(raw)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`categories/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).listWithPage<RawShoperWarehouse>(
      'warehouses',
      this.listParams(params),
    )
    return res.items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawShoperWarehouse>(`warehouses/${id}`)
    return transformLocation(raw)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const warehouseId = params['warehouse_id'] ?? params['locationId'] ?? params['location_id']
    const extra: Record<string, unknown> = this.listParams(params)
    if (warehouseId) extra['filters[warehouse_id][eq]'] = String(warehouseId)

    const res = await this.client(credentials).listWithPage<RawShoperProductStock>(
      'products',
      extra,
    )
    return res.items.map((p) =>
      transformInventoryLevel(
        { ...((p as unknown as Record<string, unknown>)['stock'] as RawShoperProductStock ?? {}), product_id: p.product_id },
        warehouseId ? String(warehouseId) : undefined,
      ),
    )
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const updated = await this.client(credentials).put<RawShoperProduct>(
      `products/${data.variantId}`,
      { stock: { stock: data.available } },
    )
    const stockObj = (updated as unknown as Record<string, unknown>)['stock'] as RawShoperProductStock ?? {}
    return transformInventoryLevel(
      { ...stockObj, product_id: data.variantId },
      data.locationId,
    )
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).listWithPage<RawShoperUser>(
      'users',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawShoperUser>(`users/${id}`)
    return transformCustomer(raw)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const raw = await this.client(credentials).post<RawShoperUser>(
      'users',
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const raw = await this.client(credentials).put<RawShoperUser>(
      `users/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`users/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.client(credentials).listWithPage<RawShoperOrder>(
      'orders',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.client(credentials).get<RawShoperOrder>(`orders/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const raw = await this.client(credentials).post<RawShoperOrder>(
      'orders',
      untransformOrder(data),
    )
    return transformOrder(raw)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const raw = await this.client(credentials).put<RawShoperOrder>(
      `orders/${id}`,
      untransformOrder(data),
    )
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    // Shoper cancel = set status to 4 (cancelled).
    const raw = await this.client(credentials).put<RawShoperOrder>(`orders/${id}`, {
      status_id: 4,
    })
    return transformOrder(raw)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderId = params['order_id'] ?? params['orderId']
    const extra: Record<string, unknown> = this.listParams(params)
    if (orderId) extra['filters[order_id][eq]'] = String(orderId)
    const res = await this.client(credentials).listWithPage<RawShoperDelivery>(
      'deliveries',
      extra,
    )
    return res.items.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const raw = await this.client(credentials).get<RawShoperDelivery>(`deliveries/${id}`)
    return transformFulfillment(raw)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const raw = await this.client(credentials).post<RawShoperDelivery>(
      'deliveries',
      untransformFulfillment(data),
    )
    return transformFulfillment(raw)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const raw = await this.client(credentials).put<RawShoperDelivery>(
      `deliveries/${id}`,
      untransformFulfillment(data),
    )
    return transformFulfillment(raw)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listRefunds requires `order_id` in query params')
    }
    const oid = String(orderId)
    const extra: Record<string, unknown> = {
      ...this.listParams(params),
      'filters[order_id][eq]': oid,
    }
    const res = await this.client(credentials).listWithPage<RawShoperOrderReturn>(
      'order-returns',
      extra,
    )
    return res.items.map((r) => transformRefund(r, oid))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const raw = await this.client(credentials).get<RawShoperOrderReturn>(`order-returns/${id}`)
    return transformRefund(raw)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const raw = await this.client(credentials).post<RawShoperOrderReturn>(
      'order-returns',
      untransformRefund(data),
    )
    return transformRefund(raw, data.orderId)
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
    const extra: Record<string, unknown> = {
      ...this.listParams(params),
      'filters[order_id][eq]': String(orderId),
    }
    const res = await this.client(credentials).listWithPage<RawShoperTransaction>(
      'order-transactions',
      extra,
    )
    return res.items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const raw = await this.client(credentials).get<RawShoperTransaction>(
      `order-transactions/${id}`,
    )
    return transformTransaction(raw)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const res = await this.client(credentials).listWithPage<RawShoperPromotionCode>(
      'promotion-codes',
      this.listParams(params),
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const raw = await this.client(credentials).get<RawShoperPromotionCode>(
      `promotion-codes/${id}`,
    )
    return transformDiscount(raw)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const raw = await this.client(credentials).post<RawShoperPromotionCode>(
      'promotion-codes',
      untransformDiscount(data),
    )
    return transformDiscount(raw)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const raw = await this.client(credentials).put<RawShoperPromotionCode>(
      `promotion-codes/${id}`,
      untransformDiscount(data),
    )
    return transformDiscount(raw)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`promotion-codes/${id}`)
  }
}
