/**
 * Petpooja adapter for the ecommerce vertical.
 *
 * Petpooja is a restaurant POS and management platform. Their Online Ordering
 * API (V2.1.0) exposes menu management (items = Products, categories =
 * Collections) and order push/status. The API uses four-credential API-key
 * auth supplied as POST body fields on every request.
 *
 * Supported resources:
 *   - Products    (menu items: list, get, create, update, delete)
 *   - Collections (menu categories: list, get, create, update, delete)
 *   - Orders      (list, get, create, update, cancel)
 *
 * Not supported by the Petpooja API and therefore omitted (auto-501):
 *   Variants (no separate variant endpoint — variants nest under items),
 *   Customers, Locations, InventoryLevels, Fulfillments, Refunds,
 *   Transactions, Discounts.
 *
 * Webhooks: Petpooja does not publish webhook signature documentation;
 *   verifyWebhook and parseWebhookEvents are not implemented.
 *
 * Docs: https://onlineorderingapisv210.docs.apiary.io/
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeCode as petpoojaExchangeCode, PETPOOJA_CREDENTIAL_FORM } from './auth'
import { PetpoojaClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformProduct,
  untransformProduct,
  type RawPetpoojaItem,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawPetpoojaCategory,
} from './transform/collection'
import {
  transformOrder,
  untransformOrder,
  type RawPetpoojaOrder,
} from './transform/order'

export interface PetpoojaAdapterConfig {
  /** App Key issued by Petpooja (optional — may come from per-connection credentials). */
  appKey?: string
  /** Access Token issued by Petpooja (optional — may come from per-connection credentials). */
  accessToken?: string
  /** Restaurant ID in the Petpooja system (optional — may come from per-connection credentials). */
  restaurantId?: string
  /** App Secret Key issued by Petpooja (optional — may come from per-connection credentials). */
  appSecretKey?: string
}

export class PetpoojaAdapter implements EcommerceAdapter {
  readonly platform = 'petpooja'
  readonly version = '0.1.0'

  // Connect Link support — multi-field API-key form.
  credentialFields = PETPOOJA_CREDENTIAL_FORM.credentialFields
  exchangeCredentials = PETPOOJA_CREDENTIAL_FORM.exchangeCredentials

  private configAppKey: string | undefined
  private configAccessToken: string | undefined
  private configRestaurantId: string | undefined
  private configAppSecretKey: string | undefined

  constructor(config: PetpoojaAdapterConfig = {}) {
    this.configAppKey = config.appKey
    this.configAccessToken = config.accessToken
    this.configRestaurantId = config.restaurantId
    this.configAppSecretKey = config.appSecretKey
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return petpoojaExchangeCode()
  }

  /**
   * Petpooja credentials are long-lived API keys that do not expire.
   * `refreshCredentials` is a no-op.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): PetpoojaClient {
    // Merge adapter-level config into credentials so per-connection creds
    // take priority while falling back to the constructor config.
    const accessToken =
      credentials.accessToken && credentials.accessToken !== 'api-key'
        ? credentials.accessToken
        : (this.configAccessToken ?? '')
    const appKey =
      (credentials.extra?.['appKey'] as string | undefined) ?? this.configAppKey ?? ''
    const restaurantId =
      (credentials.extra?.['restaurantId'] as string | undefined) ?? this.configRestaurantId ?? ''
    const appSecretKey =
      (credentials.extra?.['appSecretKey'] as string | undefined) ?? this.configAppSecretKey ?? ''

    if (!appKey || !accessToken || !restaurantId || !appSecretKey) {
      throw new Error(
        'Petpooja adapter is missing credentials. ' +
          'Provide appKey, accessToken, restaurantId, and appSecretKey via the credential form ' +
          'or via the adapter constructor config.',
      )
    }

    const merged: Credentials = {
      ...credentials,
      accessToken,
      extra: {
        ...credentials.extra,
        appKey,
        restaurantId,
        appSecretKey,
      },
    }
    return new PetpoojaClient(merged)
  }

  private listBody(params: QueryParams): Record<string, unknown> {
    const body: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      offset: (params['offset'] as number | undefined) ?? 0,
    }
    return body
  }

  // ── Products (menu items) ─────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.clientFor(credentials).listWithOffset<RawPetpoojaItem>(
      '/getItems',
      'items',
      this.listBody(params),
    )
    return res.items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    // Petpooja does not expose a single-item GET endpoint; fetch list and filter.
    const res = await this.clientFor(credentials).post<Record<string, unknown>>(
      '/getItems',
      { itemid: id },
    )
    const rawItems = (res['items'] ?? []) as RawPetpoojaItem[]
    const item = rawItems.find((i) => String(i.itemid) === id)
    if (!item) throw new Error(`Petpooja item ${id} not found`)
    return transformProduct(item)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.clientFor(credentials).post<Record<string, unknown>>(
      '/saveItem',
      untransformProduct(data),
    )
    const rawItem = res['item'] as RawPetpoojaItem | undefined
    if (!rawItem || typeof rawItem !== 'object') {
      throw new Error('Petpooja saveItem response did not include an `item` object')
    }
    return transformProduct(rawItem)
  }

  async updateProduct(credentials: Credentials, id: string, data: Partial<Product>): Promise<Product> {
    const res = await this.clientFor(credentials).post<Record<string, unknown>>(
      '/saveItem',
      { itemid: id, ...untransformProduct(data) },
    )
    const rawItem = res['item'] as RawPetpoojaItem | undefined
    if (!rawItem || typeof rawItem !== 'object') {
      throw new Error('Petpooja saveItem response did not include an `item` object')
    }
    return transformProduct(rawItem)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).post('/deleteItem', { itemid: id })
  }

  // ── Collections (categories) ──────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const res = await this.clientFor(credentials).listWithOffset<RawPetpoojaCategory>(
      '/getCategories',
      'categories',
      this.listBody(params),
    )
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.clientFor(credentials).post<Record<string, unknown>>(
      '/getCategories',
      { categoryid: id },
    )
    const rawCats = (res['categories'] ?? []) as RawPetpoojaCategory[]
    const cat = rawCats.find((c) => String(c.categoryid) === id)
    if (!cat) throw new Error(`Petpooja category ${id} not found`)
    return transformCollection(cat)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const res = await this.clientFor(credentials).post<Record<string, unknown>>(
      '/saveCategory',
      untransformCollection(data),
    )
    const rawCat = res['category'] as RawPetpoojaCategory | undefined
    if (!rawCat || typeof rawCat !== 'object') {
      throw new Error('Petpooja saveCategory response did not include a `category` object')
    }
    return transformCollection(rawCat)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.clientFor(credentials).post<Record<string, unknown>>(
      '/saveCategory',
      { categoryid: id, ...untransformCollection(data) },
    )
    const rawCat = res['category'] as RawPetpoojaCategory | undefined
    if (!rawCat || typeof rawCat !== 'object') {
      throw new Error('Petpooja saveCategory response did not include a `category` object')
    }
    return transformCollection(rawCat)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).post('/deleteCategory', { categoryid: id })
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.clientFor(credentials).listWithOffset<RawPetpoojaOrder>(
      '/getOrders',
      'orders',
      this.listBody(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.clientFor(credentials).post<Record<string, unknown>>(
      '/getOrders',
      { orderid: id },
    )
    const rawOrders = (res['orders'] ?? []) as RawPetpoojaOrder[]
    const order = rawOrders.find(
      (o) => String(o.orderid) === id || String(o.client_order_id) === id,
    )
    if (!order) throw new Error(`Petpooja order ${id} not found`)
    return transformOrder(order)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const res = await this.clientFor(credentials).post<Record<string, unknown>>(
      '/saveOrder',
      untransformOrder(data),
    )
    const rawOrder = res['order'] as RawPetpoojaOrder | undefined
    if (!rawOrder || typeof rawOrder !== 'object') {
      throw new Error('Petpooja saveOrder response did not include an `order` object')
    }
    return transformOrder(rawOrder)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const res = await this.clientFor(credentials).post<Record<string, unknown>>(
      '/saveOrder',
      { orderid: id, ...untransformOrder(data) },
    )
    const rawOrder = res['order'] as RawPetpoojaOrder | undefined
    if (!rawOrder || typeof rawOrder !== 'object') {
      throw new Error('Petpooja saveOrder response did not include an `order` object')
    }
    return transformOrder(rawOrder)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const res = await this.clientFor(credentials).post<Record<string, unknown>>(
      '/updateOrderStatus',
      { orderid: id, order_status: 6 },
    )
    // cancelOrder may return an order object or just a confirmation; synthesise
    // a minimal cancelled order from the envelope when `order` is absent.
    const rawOrder = (
      res['order'] != null && typeof res['order'] === 'object'
        ? res['order']
        : { orderid: id, order_status: 6 }
    ) as RawPetpoojaOrder
    return transformOrder(rawOrder)
  }
}
