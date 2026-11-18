/**
 * Falabella Seller Center adapter for the ecommerce vertical.
 *
 * Falabella Seller Center is a marketplace-seller Action-RPC API (Chile,
 * Colombia, Peru — Argentina is not supported) on a single host,
 * disambiguated per call by an `Action` query parameter and authenticated
 * with a static per-seller API key used to HMAC-sign every request. See
 * `client.ts` for the signing algorithm and `auth.ts` for the credential
 * shape (static key — no OAuth, no refresh).
 *
 * Coverage: 5 of 11 canonical resources (product, location, inventory,
 * order, fulfillment). As a marketplace seller API, Falabella has no
 * seller-manipulable customers, collections, discounts, refunds or
 * transactions, and variants are sibling products (`ParentSku`) rather than
 * a documented parent/variant hierarchy — see `metadata.ts` for the reason
 * behind each.
 *
 * `ProductCreate`/`ProductUpdate` and `UpdateStock` are asynchronous
 * (Falabella returns a feed/request id to poll, not a confirmed result) —
 * this adapter returns the accepted submission, documented per-method.
 *
 * No webhooks: callbacks exist but the docs at
 * https://developers.falabella.com/docs/webhooks describe no inbound
 * signature-verification scheme (`webhook.ts` removed — see the top-level
 * report for the required `webhooks.ts` change).
 */
import { customForm } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'

import { buildAuthUrl, exchangeCode as falabellaExchangeCode, refreshCredentials as falabellaRefreshCredentials } from './auth'
import { FalabellaClient, toArray } from './client'
import {
  BUSINESS_UNIT_BY_COUNTRY,
  CURRENCY_BY_COUNTRY,
  DEFAULT_PAGE_SIZE,
  ACTION_GET_PRODUCTS,
  ACTION_PRODUCT_CREATE,
  ACTION_PRODUCT_UPDATE,
  ACTION_PRODUCT_REMOVE,
  ACTION_GET_WAREHOUSE,
  ACTION_GET_STOCK,
  ACTION_UPDATE_STOCK,
  ACTION_GET_ORDERS,
  ACTION_GET_ORDER,
  ACTION_GET_ORDER_ITEMS,
  ACTION_SET_STATUS_READY_TO_SHIP,
  ACTION_SET_STATUS_CANCELED,
  type FalabellaCountry,
} from './constants'

import { transformProduct, untransformProduct, type RawFalabellaProduct } from './transform/product'
import {
  transformSellerWarehouseStock,
  transformFulfillmentWarehouseStock,
  untransformInventoryLevel,
  type RawFalabellaSellerWarehouseStock,
  type RawFalabellaFulfillmentWarehouseStock,
} from './transform/inventory'
import { transformLocation, type RawFalabellaWarehouse } from './transform/location'
import { transformOrder, type RawFalabellaOrder, type RawFalabellaOrderItem } from './transform/order'
import { transformFulfillment, transformFulfillments } from './transform/fulfillment'

const FALABELLA_FORM = customForm({
  fields: [
    {
      name: 'userId',
      label: 'Seller Center email (UserID)',
      type: 'email',
      required: true,
      helpText: 'The email you log into Falabella Seller Center with.',
    },
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      helpText: 'Static key from Seller Center → Settings → Users → API key. Keys do not expire.',
    },
    {
      name: 'sellerId',
      label: 'Seller ID',
      type: 'text',
      required: true,
    },
    {
      name: 'country',
      label: 'Country',
      type: 'select',
      required: true,
      options: [
        { value: 'CL', label: 'Chile (FACL)' },
        { value: 'CO', label: 'Colombia (FACO)' },
        { value: 'PE', label: 'Peru (FAPE)' },
      ],
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const userId = (fields['userId'] ?? '').trim()
    const apiKey = fields['apiKey'] ?? ''
    const sellerId = (fields['sellerId'] ?? '').trim()
    const country = (fields['country'] ?? '').trim().toUpperCase()
    if (!userId || !apiKey || !sellerId) {
      throw new Error('Seller Center email, API key, and Seller ID are all required.')
    }
    if (!(country in BUSINESS_UNIT_BY_COUNTRY)) {
      throw new Error('Country must be one of Chile, Colombia, or Peru — Argentina is not supported.')
    }
    return { accessToken: apiKey, extra: { userId, sellerId, country } }
  },
})

export interface FalabellaAdapterConfig {
  userId?: string
  apiKey?: string
  sellerId?: string
  country?: FalabellaCountry
}

interface ProductsBody {
  Products?: { Product?: RawFalabellaProduct | RawFalabellaProduct[] }
}
interface StockBody {
  Stocks?: {
    SellerWarehouses?: { Warehouse?: RawFalabellaSellerWarehouseStock | RawFalabellaSellerWarehouseStock[] }
    FulfillmentWarehouses?: {
      Warehouse?: RawFalabellaFulfillmentWarehouseStock | RawFalabellaFulfillmentWarehouseStock[]
    }
  }
}
interface WarehousesBody {
  Warehouses?: { Warehouse?: RawFalabellaWarehouse | RawFalabellaWarehouse[] }
}
interface OrdersBody {
  Orders?: { Order?: RawFalabellaOrder | RawFalabellaOrder[] }
}
interface OrderItemsBody {
  OrderItems?: { OrderItem?: RawFalabellaOrderItem | RawFalabellaOrderItem[] }
}

export class FalabellaAdapter implements EcommerceAdapter {
  readonly platform = 'falabella'
  readonly version = '0.1.0'

  credentialFields = FALABELLA_FORM.credentialFields
  exchangeCredentials = FALABELLA_FORM.exchangeCredentials

  private configUserId: string | undefined
  private configApiKey: string | undefined
  private configSellerId: string | undefined
  private configCountry: FalabellaCountry | undefined

  constructor(config: FalabellaAdapterConfig = {}) {
    this.configUserId = config.userId
    this.configApiKey = config.apiKey
    this.configSellerId = config.sellerId
    this.configCountry = config.country
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(): string {
    return buildAuthUrl()
  }

  async exchangeCode(): Promise<Credentials> {
    return falabellaExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return falabellaRefreshCredentials(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): FalabellaClient {
    const userId = (credentials.extra?.['userId'] as string | undefined) ?? this.configUserId
    const apiKey = credentials.accessToken || this.configApiKey
    const sellerId = (credentials.extra?.['sellerId'] as string | undefined) ?? this.configSellerId
    const country = (credentials.extra?.['country'] as FalabellaCountry | undefined) ?? this.configCountry
    if (!userId || !apiKey || !sellerId || !country) {
      throw new Error(
        'Falabella adapter is missing userId/apiKey/sellerId/country — POST them to ' +
          '/v1/connections with credentials: {userId, apiKey, sellerId, country}.',
      )
    }
    const merged: Credentials = {
      ...credentials,
      accessToken: apiKey,
      extra: { ...credentials.extra, userId, sellerId, country },
    }
    return new FalabellaClient(merged)
  }

  private countryOf(credentials: Credentials): FalabellaCountry {
    return (credentials.extra?.['country'] as FalabellaCountry | undefined) ?? this.configCountry ?? 'CL'
  }

  private currencyOf(credentials: Credentials): string {
    return CURRENCY_BY_COUNTRY[this.countryOf(credentials)]
  }

  /** Falabella paginates by zero-based `Offset` + `Limit`, not a 1-indexed page. */
  private pageParams(params: QueryParams): { Limit: string; Offset: string } {
    const limit = Math.max(1, Math.floor(Number(params.limit ?? DEFAULT_PAGE_SIZE)))
    const page = Math.max(1, Math.floor(Number(params.page ?? 1)))
    return { Limit: String(limit), Offset: String((page - 1) * limit) }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const body = await client.call<ProductsBody>(ACTION_GET_PRODUCTS, this.pageParams(params))
    return toArray(body.Products?.Product).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const body = await client.call<ProductsBody>(ACTION_GET_PRODUCTS, { SkuSellerList: id })
    const found = toArray(body.Products?.Product)[0]
    if (!found) throw new Error(`Falabella getProduct: no product found for SellerSku '${id}'`)
    return transformProduct(found)
  }

  /**
   * Falabella's canonical `Product` has no room for the leaf `PrimaryCategory`
   * id or per-business-unit `Price`/`Stock` a submission requires — callers
   * must supply them via `data.metadata`. `ProductCreate` is asynchronous
   * (returns a feed/request id to poll, not a confirmed catalog entry).
   */
  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    if (!data.id || !data.title) {
      throw new Error('Falabella createProduct requires `id` (SellerSku) and `title` (Name).')
    }
    const primaryCategoryId = data.metadata?.['primaryCategoryId'] as string | undefined
    const price = data.metadata?.['price'] as string | undefined
    const stock = data.metadata?.['stock'] as number | undefined
    if (!primaryCategoryId || !price || stock == null) {
      throw new Error(
        'Falabella createProduct requires metadata.primaryCategoryId, metadata.price (decimal ' +
          'string), and metadata.stock — Falabella has no way to create a product without a leaf ' +
          'category id and per-business-unit price/stock.',
      )
    }
    const operatorCode = BUSINESS_UNIT_BY_COUNTRY[this.countryOf(credentials)].toLowerCase()
    const body = untransformProduct({
      id: data.id,
      title: data.title,
      description: data.description,
      primaryCategoryId,
      price,
      stock,
      operatorCode,
    })
    const client = this.clientFor(credentials)
    const res = await client.call<unknown>(ACTION_PRODUCT_CREATE, {}, { method: 'POST', body })
    return {
      id: data.id,
      title: data.title,
      description: data.description,
      metadata: { submitted: body, response: res },
    }
  }

  async updateProduct(credentials: Credentials, id: string, data: Partial<Product>): Promise<Product> {
    const current = await this.getProduct(credentials, id)
    const title = data.title ?? current.title
    const primaryCategoryId = data.metadata?.['primaryCategoryId'] as string | undefined
    const price = data.metadata?.['price'] as string | undefined
    const stock = data.metadata?.['stock'] as number | undefined
    if (!primaryCategoryId || !price || stock == null) {
      throw new Error(
        'Falabella updateProduct requires metadata.primaryCategoryId, metadata.price, and ' +
          'metadata.stock on every submission — Falabella has no partial-field update.',
      )
    }
    const operatorCode = BUSINESS_UNIT_BY_COUNTRY[this.countryOf(credentials)].toLowerCase()
    const body = untransformProduct({
      id,
      title,
      description: data.description ?? current.description,
      primaryCategoryId,
      price,
      stock,
      operatorCode,
    })
    const client = this.clientFor(credentials)
    const res = await client.call<unknown>(ACTION_PRODUCT_UPDATE, {}, { method: 'POST', body })
    return {
      id,
      title,
      description: data.description ?? current.description,
      metadata: { submitted: body, response: res },
    }
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    await client.call(ACTION_PRODUCT_REMOVE, { SellerSku: id }, { method: 'POST' })
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const client = this.clientFor(credentials)
    const body = await client.call<WarehousesBody>(ACTION_GET_WAREHOUSE, this.pageParams(params))
    return toArray(body.Warehouses?.Warehouse).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const locations = await this.listLocations(credentials, {} as QueryParams)
    const found = locations.find((l) => l.id === id)
    if (!found) throw new Error(`Falabella getLocation: no warehouse found for '${id}'`)
    return found
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(credentials: Credentials, params: QueryParams): Promise<InventoryLevel[]> {
    const client = this.clientFor(credentials)
    const body = await client.call<StockBody>(ACTION_GET_STOCK, this.pageParams(params))
    return [
      ...toArray(body.Stocks?.SellerWarehouses?.Warehouse).map(transformSellerWarehouseStock),
      ...toArray(body.Stocks?.FulfillmentWarehouses?.Warehouse).map(transformFulfillmentWarehouseStock),
    ]
  }

  /**
   * `GetStock` documents no single-SKU filter, so a lookup by the composite
   * `${sku}:${locationId}` id reads a page and finds the match rather than
   * guessing an unconfirmed query parameter.
   */
  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    const levels = await this.listInventoryLevels(credentials, { limit: 1000 } as QueryParams)
    const found = levels.find((l) => l.id === id)
    if (!found) throw new Error(`Falabella getInventoryLevel: no stock row found for '${id}'`)
    return found
  }

  /** `UpdateStock` sets an ABSOLUTE quantity (see `metadata.ts`) — asynchronous, returns a feed id to poll. */
  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const body = untransformInventoryLevel({
      variantId: data.variantId,
      available: data.available,
      locationId: data.locationId,
    })
    const client = this.clientFor(credentials)
    const res = await client.call<unknown>(ACTION_UPDATE_STOCK, {}, { method: 'POST', body })
    return {
      id: `${data.variantId}:${data.locationId}`,
      variantId: data.variantId,
      locationId: data.locationId,
      available: data.available,
      metadata: { submitted: body, response: res },
    }
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  private orderParams(params: QueryParams): Record<string, string> {
    const out: Record<string, string> = { ...this.pageParams(params) }
    if (params.updatedAfter) out['UpdatedAfter'] = params.updatedAfter.toISOString()
    return out
  }

  private async itemsFor(client: FalabellaClient, orderId: string): Promise<RawFalabellaOrderItem[]> {
    const body = await client.call<OrderItemsBody>(ACTION_GET_ORDER_ITEMS, { OrderId: orderId })
    return toArray(body.OrderItems?.OrderItem)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const currency = this.currencyOf(credentials)
    const body = await client.call<OrdersBody>(ACTION_GET_ORDERS, this.orderParams(params))
    const orders = toArray(body.Orders?.Order)
    const out: Order[] = []
    // Sequential, one GetOrderItems call per order — matches how this
    // codebase treats other Seller-Center-style rate limits (see shopify's
    // per-order transactions comment): a burst of parallel calls against a
    // request-per-second-limited API spends the sync in 429s.
    for (const order of orders) {
      const items = await this.itemsFor(client, order.OrderId)
      out.push(transformOrder(order, items, currency))
    }
    return out
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const currency = this.currencyOf(credentials)
    const [orderBody, items] = await Promise.all([
      client.call<OrdersBody>(ACTION_GET_ORDER, { OrderId: id }),
      this.itemsFor(client, id),
    ])
    const order = toArray(orderBody.Orders?.Order)[0]
    if (!order) throw new Error(`Falabella getOrder: no order found for '${id}'`)
    return transformOrder(order, items, currency)
  }

  /** `SetStatusToCanceled` only succeeds while the order is still `pending`. */
  async cancelOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    await client.call(ACTION_SET_STATUS_CANCELED, { OrderId: id }, { method: 'POST' })
    return this.getOrder(credentials, id)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const client = this.clientFor(credentials)
    const orderId = params['orderId'] ?? params['order_id']
    if (orderId) {
      return transformFulfillments(await this.itemsFor(client, String(orderId)))
    }
    const body = await client.call<OrdersBody>(ACTION_GET_ORDERS, this.orderParams(params))
    const orders = toArray(body.Orders?.Order)
    const out: Fulfillment[] = []
    for (const order of orders) {
      out.push(...transformFulfillments(await this.itemsFor(client, order.OrderId)))
    }
    return out
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const [orderId, orderItemId] = id.split(':')
    if (!orderId || !orderItemId) {
      throw new Error('Falabella fulfillment id must be `orderId:orderItemId`.')
    }
    const client = this.clientFor(credentials)
    const items = await this.itemsFor(client, orderId)
    const found = items.find((i) => i.OrderItemId === orderItemId)
    if (!found) throw new Error(`Falabella getFulfillment: no item '${orderItemId}' on order '${orderId}'`)
    return transformFulfillment(found)
  }

  /** `SetStatusToReadyToShip` — the seller action that starts a shipment for one order item. */
  async createFulfillment(credentials: Credentials, data: Partial<Fulfillment>): Promise<Fulfillment> {
    const orderItemId = data.lineItems?.[0]?.lineItemId
    if (!data.orderId || !orderItemId) {
      throw new Error('Falabella createFulfillment requires orderId and lineItems[0].lineItemId (the OrderItemId).')
    }
    const client = this.clientFor(credentials)
    await client.call(ACTION_SET_STATUS_READY_TO_SHIP, { OrderItemId: orderItemId }, { method: 'POST' })
    return this.getFulfillment(credentials, `${data.orderId}:${orderItemId}`)
  }
}
