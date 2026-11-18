/**
 * Solidus adapter for the ecommerce vertical.
 *
 * Maps the Solidus Platform API (`/api/v2/platform/`) to the canonical
 * ecommerce resources. Solidus is a Rails fork of Spree — enterprise-focused,
 * community-maintained, and shares most of Spree's API surface.
 *
 * Notable Solidus-isms vs Spree:
 *
 *  - OAuth2 endpoint is `/oauth/token` (standard Doorkeeper) rather than
 *    `/spree_oauth/token`.
 *  - `make_active_at` field on products (alongside `available_on`).
 *  - `canceler_id` / `approver_id` on orders for audit workflows.
 *  - Return authorizations may carry a `reason` relationship
 *    (Solidus::ReturnReason) in addition to the `memo` text.
 *  - Action/rule class names may use `Solidus::` namespace prefix.
 *  - Collections map to "taxons" (taxonomy categories).
 *  - Inventory is tracked via "stock items" + "stock locations".
 *  - Fulfillments map to "shipments" with state machine transitions.
 *  - Refunds map to "return authorizations" (RMAs).
 *  - Discounts map to "promotions" with actions and rules.
 *  - Transactions map to "payments" on orders.
 *  - The Platform API uses JSON:API format; the client flattens
 *    responses automatically.
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

import {
  buildAuthUrl,
  exchangeCode as solidusExchangeCode,
  refreshCredentials as solidusRefreshCredentials,
} from './auth'
import { SolidusClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformProduct,
  untransformProduct,
  transformProductVariant,
  untransformProductVariant,
  type RawSolidusProduct,
  type RawSolidusVariant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawSolidusTaxon,
} from './transform/collection'
import {
  transformCustomer,
  untransformCustomer,
  type RawSolidusUser,
} from './transform/customer'
import { transformOrder, type RawSolidusOrder } from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawSolidusShipment,
} from './transform/fulfillment'
import {
  transformRefund,
  untransformRefund,
  type RawSolidusReturnAuthorization,
} from './transform/refund'
import {
  transformDiscount,
  untransformDiscount,
  type RawSolidusPromotion,
} from './transform/discount'
import {
  transformTransaction,
  untransformTransaction,
  type RawSolidusPayment,
} from './transform/transaction'
import {
  transformInventoryLevel,
  type RawSolidusStockItem,
} from './transform/inventory'
import {
  transformLocation,
  type RawSolidusStockLocation,
} from './transform/location'

export interface SolidusAdapterConfig {
  /** Base URL of the Solidus store, e.g. `https://mysolidus.example` (no trailing slash). */
  baseUrl?: string
  /** OAuth2 client ID (Doorkeeper application). */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
}

export class SolidusAdapter implements EcommerceAdapter {
  readonly platform = 'solidus'
  readonly version = '0.1.0'

  private configBaseUrl: string | undefined
  private configClientId: string | undefined
  private configClientSecret: string | undefined

  constructor(config: SolidusAdapterConfig = {}) {
    this.configBaseUrl = config.baseUrl
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
  }

  // -- Auth -------------------------------------------------------------------

  getAuthUrl(state: string, _overrideScopes?: string[]): string {
    const baseUrl = this.configBaseUrl ?? 'https://your-solidus-store.example'
    const clientId = this.configClientId ?? 'your-client-id'
    return buildAuthUrl(baseUrl, clientId, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    const baseUrl = this.configBaseUrl
    const clientId = this.configClientId
    const clientSecret = this.configClientSecret
    if (!baseUrl || !clientId || !clientSecret) {
      throw new Error(
        'Solidus exchangeCode requires baseUrl, clientId, and clientSecret in adapter config.',
      )
    }
    return solidusExchangeCode(baseUrl, code, redirectUri, clientId, clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return solidusRefreshCredentials(credentials)
  }

  // -- Private helpers --------------------------------------------------------

  private clientFor(credentials: Credentials): SolidusClient {
    const baseUrl =
      (credentials.extra?.['baseUrl'] as string | undefined) ?? this.configBaseUrl
    const clientId =
      (credentials.extra?.['clientId'] as string | undefined) ?? this.configClientId
    const clientSecret =
      (credentials.extra?.['clientSecret'] as string | undefined) ?? this.configClientSecret

    if (!baseUrl) {
      throw new Error(
        'Solidus adapter is missing baseUrl -- either configure it in adapter config ' +
          'or POST it to /v1/connections with credentials: {baseUrl, accessToken}.',
      )
    }
    if (!credentials.accessToken) {
      throw new Error(
        'Solidus adapter needs an accessToken (API key or OAuth2 bearer token).',
      )
    }

    const mergedCreds: Credentials = {
      ...credentials,
      extra: {
        ...credentials.extra,
        baseUrl,
        ...(clientId ? { clientId } : {}),
        ...(clientSecret ? { clientSecret } : {}),
      },
    }
    return new SolidusClient(mergedCreds)
  }

  private pageParams(params: QueryParams): { page: number; perPage: number } {
    return {
      page: params.page ?? 1,
      perPage: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  // -- Products ---------------------------------------------------------------

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { page, perPage } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawSolidusProduct>(
      'products',
      { page, perPage, include: 'variants,option_types,images' },
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const raw = await client.get<RawSolidusProduct>(
      `products/${encodeURIComponent(id)}?include=variants,option_types,images`,
    )
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.clientFor(credentials).post<RawSolidusProduct>(
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
    const res = await this.clientFor(credentials).patch<RawSolidusProduct>(
      `products/${encodeURIComponent(id)}`,
      untransformProduct(data),
    )
    return transformProduct(res)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`products/${encodeURIComponent(id)}`)
  }

  // -- Variants ---------------------------------------------------------------

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const { page, perPage } = this.pageParams(params)
    const filter: Record<string, string | number> = {}
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (productId) filter['product_id_eq'] = productId
    const res = await this.clientFor(credentials).list<RawSolidusVariant>(
      'variants',
      { page, perPage, filter },
    )
    return res.items
      .filter((v) => !v.is_master)
      .map((v) => transformProductVariant(v, productId))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const raw = await this.clientFor(credentials).get<RawSolidusVariant>(
      `variants/${encodeURIComponent(id)}`,
    )
    return transformProductVariant(raw)
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const body = untransformProductVariant(data)
    if (data.productId) {
      (body['variant'] as Record<string, unknown>)['product_id'] = Number(data.productId)
    }
    const res = await this.clientFor(credentials).post<RawSolidusVariant>('variants', body)
    return transformProductVariant(res, data.productId ?? undefined)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const res = await this.clientFor(credentials).patch<RawSolidusVariant>(
      `variants/${encodeURIComponent(id)}`,
      untransformProductVariant(data),
    )
    return transformProductVariant(res)
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`variants/${encodeURIComponent(id)}`)
  }

  // -- Collections ------------------------------------------------------------

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const { page, perPage } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawSolidusTaxon>(
      'taxons',
      { page, perPage },
    )
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.clientFor(credentials).get<RawSolidusTaxon>(
      `taxons/${encodeURIComponent(id)}`,
    )
    return transformCollection(res)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.clientFor(credentials).post<RawSolidusTaxon>(
      'taxons',
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.clientFor(credentials).patch<RawSolidusTaxon>(
      `taxons/${encodeURIComponent(id)}`,
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`taxons/${encodeURIComponent(id)}`)
  }

  // -- Locations --------------------------------------------------------------

  async listLocations(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Location[]> {
    const { page, perPage } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawSolidusStockLocation>(
      'stock_locations',
      { page, perPage },
    )
    return res.items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.clientFor(credentials).get<RawSolidusStockLocation>(
      `stock_locations/${encodeURIComponent(id)}`,
    )
    return transformLocation(res)
  }

  // -- Inventory --------------------------------------------------------------

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const { page, perPage } = this.pageParams(params)
    const filter: Record<string, string | number> = {}
    const variantId = (params['variantId'] ?? params['variant_id']) as string | undefined
    const locationId = (params['locationId'] ?? params['stock_location_id']) as string | undefined
    if (variantId) filter['variant_id_eq'] = variantId
    if (locationId) filter['stock_location_id_eq'] = locationId
    const res = await this.clientFor(credentials).list<RawSolidusStockItem>(
      'stock_items',
      { page, perPage, filter },
    )
    return res.items.map(transformInventoryLevel)
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // id can be composite `variantId:locationId` or a raw stock_item id
    if (id.includes(':')) {
      const [variantId, locationId] = id.split(':')
      const res = await this.clientFor(credentials).list<RawSolidusStockItem>(
        'stock_items',
        { filter: { variant_id_eq: variantId!, stock_location_id_eq: locationId! } },
      )
      const hit = res.items[0]
      if (!hit) throw new Error(`Stock item not found for variant ${variantId} @ location ${locationId}`)
      return transformInventoryLevel(hit)
    }
    const raw = await this.clientFor(credentials).get<RawSolidusStockItem>(
      `stock_items/${encodeURIComponent(id)}`,
    )
    return transformInventoryLevel(raw)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const current = await this.getInventoryLevel(
      credentials,
      `${data.variantId}:${data.locationId}`,
    )
    return this.setInventoryLevel(credentials, {
      variantId: data.variantId,
      locationId: data.locationId,
      available: current.available + data.delta,
    })
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    // Find existing stock item
    const res = await client.list<RawSolidusStockItem>(
      'stock_items',
      { filter: { variant_id_eq: data.variantId, stock_location_id_eq: data.locationId } },
    )
    const existing = res.items[0]
    if (existing) {
      const updated = await client.patch<RawSolidusStockItem>(
        `stock_items/${existing.id}`,
        { stock_item: { count_on_hand: data.available } },
      )
      return transformInventoryLevel(updated)
    }
    // Create new stock item
    const created = await client.post<RawSolidusStockItem>(
      'stock_items',
      {
        stock_item: {
          variant_id: Number(data.variantId),
          stock_location_id: Number(data.locationId),
          count_on_hand: data.available,
        },
      },
    )
    return transformInventoryLevel(created)
  }

  // -- Customers --------------------------------------------------------------

  async listCustomers(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Customer[]> {
    const { page, perPage } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawSolidusUser>(
      'users',
      { page, perPage },
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.clientFor(credentials).get<RawSolidusUser>(
      `users/${encodeURIComponent(id)}`,
    )
    return transformCustomer(res)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const body = untransformCustomer(data)
    const res = await this.clientFor(credentials).post<RawSolidusUser>('users', body)
    return transformCustomer(res)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const body = untransformCustomer(data)
    const res = await this.clientFor(credentials).patch<RawSolidusUser>(
      `users/${encodeURIComponent(id)}`,
      body,
    )
    return transformCustomer(res)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`users/${encodeURIComponent(id)}`)
  }

  // -- Orders -----------------------------------------------------------------

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { page, perPage } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawSolidusOrder>(
      'orders',
      { page, perPage, include: 'line_items' },
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.clientFor(credentials).get<RawSolidusOrder>(
      `orders/${encodeURIComponent(id)}?include=line_items`,
    )
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const body: Record<string, unknown> = {
      order: {
        email: data.email,
        special_instructions: data.note,
        user_id: data.customerId ? Number(data.customerId) : undefined,
      },
    }
    const res = await this.clientFor(credentials).post<RawSolidusOrder>('orders', body)
    return transformOrder(res)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const body: Record<string, unknown> = {
      order: {
        email: data.email,
        special_instructions: data.note,
      },
    }
    const res = await this.clientFor(credentials).patch<RawSolidusOrder>(
      `orders/${encodeURIComponent(id)}`,
      body,
    )
    return transformOrder(res)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    await client.patch(`orders/${encodeURIComponent(id)}/cancel`, {})
    const refreshed = await client.get<RawSolidusOrder>(
      `orders/${encodeURIComponent(id)}`,
    )
    return transformOrder(refreshed)
  }

  // -- Fulfillments -----------------------------------------------------------

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const { page, perPage } = this.pageParams(params)
    const filter: Record<string, string | number> = {}
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (orderId) filter['order_id_eq'] = orderId
    const res = await this.clientFor(credentials).list<RawSolidusShipment>(
      'shipments',
      { page, perPage, filter },
    )
    return res.items.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const res = await this.clientFor(credentials).get<RawSolidusShipment>(
      `shipments/${encodeURIComponent(id)}`,
    )
    return transformFulfillment(res)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) {
      throw new Error('Solidus createFulfillment requires orderId')
    }
    const res = await this.clientFor(credentials).post<RawSolidusShipment>(
      'shipments',
      untransformFulfillment(data),
    )
    return transformFulfillment(res)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const res = await this.clientFor(credentials).patch<RawSolidusShipment>(
      `shipments/${encodeURIComponent(id)}`,
      untransformFulfillment(data),
    )
    return transformFulfillment(res)
  }

  async cancelFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    await client.patch(`shipments/${encodeURIComponent(id)}/cancel`, {})
    const refreshed = await client.get<RawSolidusShipment>(
      `shipments/${encodeURIComponent(id)}`,
    )
    return transformFulfillment(refreshed)
  }

  // -- Refunds ----------------------------------------------------------------

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const { page, perPage } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawSolidusReturnAuthorization>(
      'return_authorizations',
      { page, perPage },
    )
    return res.items.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.clientFor(credentials).get<RawSolidusReturnAuthorization>(
      `return_authorizations/${encodeURIComponent(id)}`,
    )
    return transformRefund(res)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const res = await this.clientFor(credentials).post<RawSolidusReturnAuthorization>(
      'return_authorizations',
      untransformRefund(data),
    )
    return transformRefund(res)
  }

  // -- Transactions -----------------------------------------------------------

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const { page, perPage } = this.pageParams(params)
    const filter: Record<string, string | number> = {}
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (orderId) filter['order_id_eq'] = orderId
    const res = await this.clientFor(credentials).list<RawSolidusPayment>(
      'payments',
      { page, perPage, filter },
    )
    return res.items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const res = await this.clientFor(credentials).get<RawSolidusPayment>(
      `payments/${encodeURIComponent(id)}`,
    )
    return transformTransaction(res)
  }

  async createTransaction(
    credentials: Credentials,
    data: Partial<Transaction>,
  ): Promise<Transaction> {
    const res = await this.clientFor(credentials).post<RawSolidusPayment>(
      'payments',
      untransformTransaction(data),
    )
    return transformTransaction(res)
  }

  // -- Discounts --------------------------------------------------------------

  async listDiscounts(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Discount[]> {
    const { page, perPage } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawSolidusPromotion>(
      'promotions',
      { page, perPage },
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.clientFor(credentials).get<RawSolidusPromotion>(
      `promotions/${encodeURIComponent(id)}`,
    )
    return transformDiscount(res)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.clientFor(credentials).post<RawSolidusPromotion>(
      'promotions',
      untransformDiscount(data),
    )
    return transformDiscount(res)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.clientFor(credentials).patch<RawSolidusPromotion>(
      `promotions/${encodeURIComponent(id)}`,
      untransformDiscount(data),
    )
    return transformDiscount(res)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`promotions/${encodeURIComponent(id)}`)
  }
}
