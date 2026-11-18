/**
 * InSales adapter for the ecommerce vertical.
 *
 * Maps the InSales Admin REST API (`/admin/`) to the canonical ecommerce
 * resources. InSales uses HTTP Basic auth with an api_id + api_secret pair
 * created by the merchant in the InSales admin panel — there is no OAuth
 * authorization-code flow.
 *
 * Supported resources:
 *   Products, Variants, Collections (categories + collections),
 *   Customers (clients), Orders, Discounts (discount_codes),
 *   Locations (warehouses), Inventory (variant quantity)
 *
 * Not supported by InSales public API (returns 501):
 *   Fulfillments (embedded in orders only), Refunds, Transactions
 *
 * Auth: credentials must include
 *   accessToken    = api_id
 *   extra.apiSecret = api_secret
 *   extra.shop      = merchant subdomain (e.g. "myshop" or "myshop.myinsales.ru")
 */

import { customForm, pageLocally } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Discount } from '../../schema/discount'

import { buildAuthUrl, exchangeCode as insalesExchangeCode } from './auth'
import { InsalesClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawInsalesProduct,
  type RawInsalesVariant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawInsalesCollection,
} from './transform/collection'
import { transformClient, untransformClient, type RawInsalesClient } from './transform/customer'
import { transformOrder, untransformOrder, type RawInsalesOrder } from './transform/order'
import {
  transformDiscount,
  untransformDiscount,
  type RawInsalesDiscountCode,
} from './transform/discount'
import {
  transformWarehouse,
  syntheticDefaultLocation,
  type RawInsalesWarehouse,
} from './transform/location'
import {
  transformInventoryLevel,
  type RawInsalesVariantStock,
} from './transform/inventory'

// ── Connect Link form (api_id + api_secret + shop) ────────────────────────────

const INSALES_FORM = customForm({
  fields: [
    {
      name: 'apiId',
      label: 'API ID',
      type: 'text',
      required: true,
      helpText:
        'Created in InSales admin → Extensions → Developer. This is the "login" of your API access pair.',
    },
    {
      name: 'apiSecret',
      label: 'API secret',
      type: 'password',
      required: true,
      helpText: 'The "password" portion of your InSales API access pair.',
    },
    {
      name: 'shop',
      label: 'Shop subdomain',
      type: 'text',
      required: true,
      placeholder: 'myshop',
      helpText:
        'Your InSales shop subdomain, e.g. "myshop" for myshop.myinsales.ru.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const apiId = (fields['apiId'] ?? '').trim()
    const apiSecret = (fields['apiSecret'] ?? '').trim()
    const shop = (fields['shop'] ?? '').trim()
    if (!apiId || !apiSecret || !shop) {
      throw new Error('API ID, API secret, and shop subdomain are all required.')
    }
    return {
      accessToken: apiId,
      extra: { apiId, apiSecret, shop },
    }
  },
})

export interface InsalesAdapterConfig {
  /** api_id (optional — may come from per-connection credentials instead). */
  apiId?: string
  /** api_secret (optional — may come from per-connection credentials instead). */
  apiSecret?: string
  /** Merchant subdomain, e.g. `myshop` (not `myshop.myinsales.ru`). */
  shop?: string
}

export class InsalesAdapter implements EcommerceAdapter {
  readonly platform = 'insales'
  readonly version = '0.1.0'

  // Connect Link support
  credentialFields = INSALES_FORM.credentialFields
  exchangeCredentials = INSALES_FORM.exchangeCredentials

  private configApiId: string | undefined
  private configApiSecret: string | undefined
  private configShop: string | undefined

  constructor(config: InsalesAdapterConfig = {}) {
    this.configApiId = config.apiId
    this.configApiSecret = config.apiSecret
    this.configShop = config.shop
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl(this.configShop ?? 'your-shop')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return insalesExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // InSales API keys do not expire.
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): InsalesClient {
    const apiId =
      (credentials.extra?.['apiId'] as string | undefined) ??
      (credentials.accessToken && credentials.accessToken !== 'api-key'
        ? credentials.accessToken
        : this.configApiId)
    const apiSecret =
      (credentials.extra?.['apiSecret'] as string | undefined) ?? this.configApiSecret
    const shop =
      (credentials.extra?.['shop'] as string | undefined) ?? this.configShop

    if (!apiId || !apiSecret || !shop) {
      throw new Error(
        'InSales adapter is missing apiId / apiSecret / shop — ' +
          'either configure them in apps/integration-server/config/config.yml ' +
          'under adapters.insales, or POST them to /v1/connections with ' +
          'credentials: { apiId, apiSecret, shop }.',
      )
    }

    const merged: Credentials = {
      ...credentials,
      accessToken: apiId,
      extra: { ...credentials.extra, apiId, apiSecret, shop },
    }
    return new InsalesClient(merged)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page != null) out['page'] = params.page
    if (params.updatedAfter) out['updated_since'] = params.updatedAfter.toISOString()
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.clientFor(credentials).listWithPage<RawInsalesProduct>(
      '/products.json',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.clientFor(credentials).get<RawInsalesProduct>(
      `/products/${id}.json`,
    )
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const raw = await this.clientFor(credentials).post<RawInsalesProduct>(
      '/products.json',
      { product: untransformProduct(data) },
    )
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const raw = await this.clientFor(credentials).put<RawInsalesProduct>(
      `/products/${id}.json`,
      { product: untransformProduct(data) },
    )
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/products/${id}.json`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['product_id']
    if (!productId) {
      throw new Error('InSales requires ?product_id= for listVariants.')
    }
    const res = await this.clientFor(credentials).listWithPage<RawInsalesVariant>(
      `/products/${String(productId)}/variants.json`,
      this.listParams(params),
    )
    return res.items.map((v) => transformVariant(v))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // InSales variant GET requires productId:variantId composite.
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    const raw = await this.clientFor(credentials).get<RawInsalesVariant>(
      `/products/${productId}/variants/${variantId}.json`,
    )
    return transformVariant(raw)
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const productId = data.productId
    if (!productId) throw new Error('createVariant requires productId')
    const raw = await this.clientFor(credentials).post<RawInsalesVariant>(
      `/products/${productId}/variants.json`,
      { variant: untransformVariant(data) },
    )
    return transformVariant(raw)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    const raw = await this.clientFor(credentials).put<RawInsalesVariant>(
      `/products/${productId}/variants/${variantId}.json`,
      { variant: untransformVariant(data) },
    )
    return transformVariant(raw)
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    await this.clientFor(credentials).delete(
      `/products/${productId}/variants/${variantId}.json`,
    )
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const client = this.clientFor(credentials)
    // Fetch both categories and collections; merge them.
    const [cats, cols] = await Promise.all([
      client.listWithPage<RawInsalesCollection>('/categories.json', this.listParams(params)),
      client.listWithPage<RawInsalesCollection>('/collections.json', this.listParams(params)),
    ])
    return [
      ...cats.items.map((c) => transformCollection(c, 'MANUAL')),
      ...cols.items.map((c) => transformCollection(c, 'MANUAL')),
    ]
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.clientFor(credentials)
    // Try categories first, then collections.
    try {
      const raw = await client.get<RawInsalesCollection>(`/categories/${id}.json`)
      return transformCollection(raw, 'MANUAL')
    } catch {
      const raw = await client.get<RawInsalesCollection>(`/collections/${id}.json`)
      return transformCollection(raw, 'MANUAL')
    }
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const raw = await this.clientFor(credentials).post<RawInsalesCollection>(
      '/categories.json',
      { category: untransformCollection(data) },
    )
    return transformCollection(raw, 'MANUAL')
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const raw = await this.clientFor(credentials).put<RawInsalesCollection>(
      `/categories/${id}.json`,
      { category: untransformCollection(data) },
    )
    return transformCollection(raw, 'MANUAL')
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/categories/${id}.json`)
  }

  // ── Locations (Warehouses) ────────────────────────────────────────────────

  // GET /warehouses.json documents no parameters and returns every warehouse
  // as a bare array, so the caller's page is cut locally from the whole list.
  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    try {
      const items = await this.clientFor(credentials).get<RawInsalesWarehouse[]>(
        '/warehouses.json',
      )
      if (Array.isArray(items) && items.length > 0) {
        return pageLocally(items.map(transformWarehouse), params)
      }
    } catch {
      // Warehouses endpoint may not be available on all plans — fall back.
    }
    return pageLocally([syntheticDefaultLocation()], params)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    if (id === 'default') return syntheticDefaultLocation()
    try {
      const raw = await this.clientFor(credentials).get<RawInsalesWarehouse>(
        `/warehouses/${id}.json`,
      )
      return transformWarehouse(raw)
    } catch {
      return syntheticDefaultLocation()
    }
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const productId = params['productId'] ?? params['product_id']
    if (!productId) {
      throw new Error(
        'InSales listInventoryLevels requires ?product_id= (stock is stored per variant)',
      )
    }
    const res = await this.clientFor(credentials).listWithPage<RawInsalesVariantStock>(
      `/products/${String(productId)}/variants.json`,
      this.listParams(params),
    )
    return res.items.map((v) => transformInventoryLevel(v))
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const [productId, variantId] = data.variantId.split(':')
    if (!productId || !variantId) {
      throw new Error(
        'InSales adjustInventoryLevel requires composite variantId `productId:variantId`',
      )
    }
    const client = this.clientFor(credentials)
    const current = await client.get<RawInsalesVariantStock>(
      `/products/${productId}/variants/${variantId}.json`,
    )
    const newQty = (current.quantity ?? 0) + data.delta
    const updated = await client.put<RawInsalesVariantStock>(
      `/products/${productId}/variants/${variantId}.json`,
      { variant: { quantity: newQty } },
    )
    return transformInventoryLevel(updated)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const [productId, variantId] = data.variantId.split(':')
    if (!productId || !variantId) {
      throw new Error(
        'InSales setInventoryLevel requires composite variantId `productId:variantId`',
      )
    }
    const client = this.clientFor(credentials)
    const updated = await client.put<RawInsalesVariantStock>(
      `/products/${productId}/variants/${variantId}.json`,
      { variant: { quantity: data.available } },
    )
    return transformInventoryLevel(updated)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.clientFor(credentials).listWithPage<RawInsalesClient>(
      '/clients.json',
      this.listParams(params),
    )
    return res.items.map(transformClient)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.clientFor(credentials).get<RawInsalesClient>(
      `/clients/${id}.json`,
    )
    return transformClient(raw)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const raw = await this.clientFor(credentials).post<RawInsalesClient>(
      '/clients.json',
      { client: untransformClient(data) },
    )
    return transformClient(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const raw = await this.clientFor(credentials).put<RawInsalesClient>(
      `/clients/${id}.json`,
      { client: untransformClient(data) },
    )
    return transformClient(raw)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/clients/${id}.json`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.clientFor(credentials).listWithPage<RawInsalesOrder>(
      '/orders.json',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.clientFor(credentials).get<RawInsalesOrder>(
      `/orders/${id}.json`,
    )
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const raw = await this.clientFor(credentials).post<RawInsalesOrder>(
      '/orders.json',
      { order: untransformOrder(data) },
    )
    return transformOrder(raw)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const raw = await this.clientFor(credentials).put<RawInsalesOrder>(
      `/orders/${id}.json`,
      { order: untransformOrder(data) },
    )
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    // InSales cancellation is done by updating fulfillment_status.
    const raw = await this.clientFor(credentials).put<RawInsalesOrder>(
      `/orders/${id}.json`,
      { order: { fulfillment_status: 'cancelled' } },
    )
    return transformOrder(raw)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const res = await this.clientFor(credentials).listWithPage<RawInsalesDiscountCode>(
      '/discount_codes.json',
      this.listParams(params),
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const raw = await this.clientFor(credentials).get<RawInsalesDiscountCode>(
      `/discount_codes/${id}.json`,
    )
    return transformDiscount(raw)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const raw = await this.clientFor(credentials).post<RawInsalesDiscountCode>(
      '/discount_codes.json',
      { discount_code: untransformDiscount(data) },
    )
    return transformDiscount(raw)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const raw = await this.clientFor(credentials).put<RawInsalesDiscountCode>(
      `/discount_codes/${id}.json`,
      { discount_code: untransformDiscount(data) },
    )
    return transformDiscount(raw)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/discount_codes/${id}.json`)
  }
}
