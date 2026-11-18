import { CONNECT_FORM } from './connect-form'
/**
 * Thirty Bees adapter for the ecommerce vertical.
 *
 * Thirty Bees is a fork of PrestaShop 1.6 with an identical webservice API.
 * Maps the Thirty Bees Webservice (`/api/`) to the canonical ecommerce
 * resources. Uses a webservice key via HTTP Basic auth (key as username,
 * empty password). No OAuth flow, no native webhooks.
 *
 * Thirty Bees defaults to XML output — the client forces JSON via
 * `output_format=JSON` on every request.
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

import { exchangeCode as tbExchangeCode } from './auth'
import { ThirtyBeesClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformProduct,
  untransformProduct,
  transformProductVariant,
  type RawThirtyBeesProduct,
  type RawThirtyBeesCombination,
} from './transform/product'
import {
  transformCustomer,
  untransformCustomer,
  type RawThirtyBeesCustomer,
} from './transform/customer'
import {
  transformOrder,
  type RawThirtyBeesOrder,
} from './transform/order'
import {
  transformFulfillment,
  type RawThirtyBeesOrderCarrier,
} from './transform/fulfillment'
import {
  transformInventoryLevel,
  type RawThirtyBeesStockAvailable,
} from './transform/inventory'
import {
  transformDiscount,
  untransformDiscount,
  type RawThirtyBeesCartRule,
} from './transform/discount'
import {
  transformRefund,
  type RawThirtyBeesOrderReturn,
} from './transform/refund'
import {
  transformTransaction,
  type RawThirtyBeesOrderPayment,
} from './transform/transaction'

// ── Synthetic collection shape for Thirty Bees categories ──────────────────

interface RawThirtyBeesCategory {
  id: number | string
  name?: string | Record<string, string>
  description?: string | Record<string, string>
  link_rewrite?: string | Record<string, string>
  active?: string | number
  date_add?: string
  date_upd?: string
  id_parent?: number | string | null
  [key: string]: unknown
}

function extractString(v: string | Record<string, string> | undefined | null): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'string') return v
  const vals = Object.values(v)
  return vals.length > 0 ? vals[0] : undefined
}

function transformCollection(raw: RawThirtyBeesCategory): Collection {
  return {
    id: String(raw.id),
    title: extractString(raw.name) ?? '',
    description: extractString(raw.description),
    handle: extractString(raw.link_rewrite),
    updatedAt: raw.date_upd,
    metadata: raw as Record<string, unknown>,
  }
}

function untransformCollection(collection: Partial<Collection>): Record<string, unknown> {
  return {
    name: collection.title,
    description: collection.description,
    link_rewrite: collection.handle,
    active: 1,
  }
}

function syntheticDefaultLocation(baseUrl: string): Location {
  return {
    id: 'default',
    name: baseUrl,
    active: true,
    isFulfillmentCenter: true,
    metadata: {
      synthetic: true,
      reason: 'Thirty Bees has no native multi-location',
      baseUrl,
    },
  }
}

// ── Adapter ─────────────────────────────────────────────────────────────────

export interface ThirtyBeesAdapterConfig {
  /** Webservice API key. */
  apiKey?: string
  /** Thirty Bees store base URL, e.g. `https://shop.example.com`. */
  baseUrl?: string
}


export class ThirtyBeesAdapter implements EcommerceAdapter {

  // Connect Link support — see ./connect-form.ts for the fields collected.

  credentialFields = CONNECT_FORM.credentialFields

  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  readonly platform = 'thirty-bees'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  private configKey: string | undefined
  private configBaseUrl: string | undefined

  constructor(config: ThirtyBeesAdapterConfig = {}) {
    this.configKey = config.apiKey
    this.configBaseUrl = config.baseUrl
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    throw new Error('Thirty Bees uses API key auth — no OAuth URL.')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return tbExchangeCode()
  }

  /** Webservice keys don't expire — no-op. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): ThirtyBeesClient {
    const apiKey =
      credentials.accessToken && credentials.accessToken !== 'api-key'
        ? credentials.accessToken
        : this.configKey
    const baseUrl =
      (credentials.extra?.['baseUrl'] as string | undefined) ?? this.configBaseUrl

    if (!apiKey || !baseUrl) {
      throw new Error(
        'Thirty Bees adapter is missing apiKey/baseUrl — ' +
          'either configure them in config.yml under adapters.thirty-bees, ' +
          'or POST them to /v1/connections with credentials: {accessToken, extra: {baseUrl}}.',
      )
    }

    const mergedCreds: Credentials = {
      ...credentials,
      accessToken: apiKey,
      extra: { ...credentials.extra, baseUrl },
    }
    return new ThirtyBeesClient(mergedCreds)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page != null) out['page'] = params.page
    if (params.search) out['filter[name]'] = `%[${params.search}]%`
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<RawThirtyBeesProduct>('products', this.listParams(params))
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const wrapper = await client.get<{ product: RawThirtyBeesProduct }>(`products/${id}`)
    return transformProduct(wrapper.product ?? (wrapper as unknown as RawThirtyBeesProduct))
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const wrapper = await client.post<{ product: RawThirtyBeesProduct }>(
      'products',
      { product: untransformProduct(data) },
    )
    return transformProduct(wrapper.product ?? (wrapper as unknown as RawThirtyBeesProduct))
  }

  async updateProduct(credentials: Credentials, id: string, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const wrapper = await client.put<{ product: RawThirtyBeesProduct }>(
      `products/${id}`,
      { product: { ...untransformProduct(data), id: Number(id) } },
    )
    return transformProduct(wrapper.product ?? (wrapper as unknown as RawThirtyBeesProduct))
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`products/${id}`)
  }

  // ── Variants (combinations) ───────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | number | undefined
    if (productId == null) {
      throw new Error(
        'Thirty Bees requires ?product_id= for listVariants; combinations are linked via id_product.',
      )
    }
    const pid = String(productId)
    const client = this.clientFor(credentials)
    const listParams = { ...this.listParams(params), 'filter[id_product]': pid }
    const res = await client.listWithPage<RawThirtyBeesCombination>('combinations', listParams)
    return res.items.map((v) => transformProductVariant(v, pid))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    const client = this.clientFor(credentials)
    const wrapper = await client.get<{ combination: RawThirtyBeesCombination }>(`combinations/${variantId}`)
    const raw = wrapper.combination ?? (wrapper as unknown as RawThirtyBeesCombination)
    return transformProductVariant(raw, productId)
  }

  // ── Collections (categories) ──────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<RawThirtyBeesCategory>('categories', this.listParams(params))
    return res.items.map((c) => transformCollection(c))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.clientFor(credentials)
    const wrapper = await client.get<{ category: RawThirtyBeesCategory }>(`categories/${id}`)
    return transformCollection(wrapper.category ?? (wrapper as unknown as RawThirtyBeesCategory))
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const client = this.clientFor(credentials)
    const wrapper = await client.post<{ category: RawThirtyBeesCategory }>(
      'categories',
      { category: untransformCollection(data) },
    )
    return transformCollection(wrapper.category ?? (wrapper as unknown as RawThirtyBeesCategory))
  }

  async updateCollection(credentials: Credentials, id: string, data: Partial<Collection>): Promise<Collection> {
    const client = this.clientFor(credentials)
    const wrapper = await client.put<{ category: RawThirtyBeesCategory }>(
      `categories/${id}`,
      { category: { ...untransformCollection(data), id: Number(id) } },
    )
    return transformCollection(wrapper.category ?? (wrapper as unknown as RawThirtyBeesCategory))
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`categories/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(_credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    return [syntheticDefaultLocation(this.configBaseUrl ?? 'default')]
  }

  async getLocation(_credentials: Credentials, id: string): Promise<Location> {
    if (id !== 'default') {
      throw new Error(`Thirty Bees has no native locations; unknown location id '${id}'`)
    }
    return syntheticDefaultLocation(this.configBaseUrl ?? 'default')
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(credentials: Credentials, params: QueryParams): Promise<InventoryLevel[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<RawThirtyBeesStockAvailable>(
      'stock_availables',
      this.listParams(params),
    )
    return res.items.map((s) => transformInventoryLevel(s))
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    const wrapper = await client.get<{ stock_available: RawThirtyBeesStockAvailable }>(
      `stock_availables/${id}`,
    )
    const raw = wrapper.stock_available ?? (wrapper as unknown as RawThirtyBeesStockAvailable)
    return transformInventoryLevel(raw)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    const [productId, combinationId] = data.variantId.split(':')
    if (!productId) {
      throw new Error('setInventoryLevel requires composite variantId `productId:combinationId`')
    }
    const filterParams: Record<string, unknown> = {
      'filter[id_product]': productId,
      display: 'full',
    }
    if (combinationId && combinationId !== 'default') {
      filterParams['filter[id_product_attribute]'] = combinationId
    }
    const list = await client.get<{ stock_availables: RawThirtyBeesStockAvailable[] }>(
      'stock_availables',
      filterParams,
    )
    const stocks = list.stock_availables ?? []
    if (stocks.length === 0) {
      throw new Error(`No stock_available found for variant ${data.variantId}`)
    }
    const stock = stocks[0]!
    const wrapper = await client.put<{ stock_available: RawThirtyBeesStockAvailable }>(
      `stock_availables/${stock.id}`,
      { stock_available: { id: stock.id, quantity: data.available } },
    )
    const updated = wrapper.stock_available ?? (wrapper as unknown as RawThirtyBeesStockAvailable)
    return transformInventoryLevel(updated, productId)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<RawThirtyBeesCustomer>('customers', this.listParams(params))
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const client = this.clientFor(credentials)
    const wrapper = await client.get<{ customer: RawThirtyBeesCustomer }>(`customers/${id}`)
    return transformCustomer(wrapper.customer ?? (wrapper as unknown as RawThirtyBeesCustomer))
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const client = this.clientFor(credentials)
    const wrapper = await client.post<{ customer: RawThirtyBeesCustomer }>(
      'customers',
      { customer: untransformCustomer(data) },
    )
    return transformCustomer(wrapper.customer ?? (wrapper as unknown as RawThirtyBeesCustomer))
  }

  async updateCustomer(credentials: Credentials, id: string, data: Partial<Customer>): Promise<Customer> {
    const client = this.clientFor(credentials)
    const wrapper = await client.put<{ customer: RawThirtyBeesCustomer }>(
      `customers/${id}`,
      { customer: { ...untransformCustomer(data), id: Number(id) } },
    )
    return transformCustomer(wrapper.customer ?? (wrapper as unknown as RawThirtyBeesCustomer))
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<RawThirtyBeesOrder>('orders', this.listParams(params))
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const wrapper = await client.get<{ order: RawThirtyBeesOrder }>(`orders/${id}`)
    return transformOrder(wrapper.order ?? (wrapper as unknown as RawThirtyBeesOrder))
  }

  async cancelOrder(credentials: Credentials, id: string, _data?: { reason?: string }): Promise<Order> {
    const client = this.clientFor(credentials)
    // Cancel by setting current_state to 6 (Cancelled).
    const wrapper = await client.put<{ order: RawThirtyBeesOrder }>(
      `orders/${id}`,
      { order: { id: Number(id), current_state: 6 } },
    )
    return transformOrder(wrapper.order ?? (wrapper as unknown as RawThirtyBeesOrder))
  }

  // ── Fulfillments (order_carriers) ─────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | number | undefined
    const client = this.clientFor(credentials)
    const listParams: Record<string, unknown> = { ...this.listParams(params) }
    if (orderId != null) {
      listParams['filter[id_order]'] = String(orderId)
    }
    const res = await client.listWithPage<RawThirtyBeesOrderCarrier>('order_carriers', listParams)
    return res.items.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const wrapper = await client.get<{ order_carrier: RawThirtyBeesOrderCarrier }>(
      `order_carriers/${id}`,
    )
    const raw = wrapper.order_carrier ?? (wrapper as unknown as RawThirtyBeesOrderCarrier)
    return transformFulfillment(raw)
  }

  // ── Discounts (cart rules) ────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<RawThirtyBeesCartRule>(
      'cart_rules',
      this.listParams(params),
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.clientFor(credentials)
    const wrapper = await client.get<{ cart_rule: RawThirtyBeesCartRule }>(`cart_rules/${id}`)
    const raw = wrapper.cart_rule ?? (wrapper as unknown as RawThirtyBeesCartRule)
    return transformDiscount(raw)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const client = this.clientFor(credentials)
    const wrapper = await client.post<{ cart_rule: RawThirtyBeesCartRule }>(
      'cart_rules',
      { cart_rule: untransformDiscount(data) },
    )
    const raw = wrapper.cart_rule ?? (wrapper as unknown as RawThirtyBeesCartRule)
    return transformDiscount(raw)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.clientFor(credentials)
    const wrapper = await client.put<{ cart_rule: RawThirtyBeesCartRule }>(
      `cart_rules/${id}`,
      { cart_rule: { ...untransformDiscount(data), id: Number(id) } },
    )
    const raw = wrapper.cart_rule ?? (wrapper as unknown as RawThirtyBeesCartRule)
    return transformDiscount(raw)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`cart_rules/${id}`)
  }

  // ── Refunds (order returns) ───────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const client = this.clientFor(credentials)
    const listParams: Record<string, unknown> = { ...this.listParams(params) }
    const orderId = params['orderId'] ?? params['order_id']
    if (orderId != null) {
      listParams['filter[id_order]'] = String(orderId)
    }
    const res = await client.listWithPage<RawThirtyBeesOrderReturn>('order_returns', listParams)
    return res.items.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const client = this.clientFor(credentials)
    const wrapper = await client.get<{ order_return: RawThirtyBeesOrderReturn }>(
      `order_returns/${id}`,
    )
    const raw = wrapper.order_return ?? (wrapper as unknown as RawThirtyBeesOrderReturn)
    return transformRefund(raw)
  }

  // ── Transactions (order payments) ─────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = this.clientFor(credentials)
    const listParams: Record<string, unknown> = { ...this.listParams(params) }
    const orderRef = params['orderId'] ?? params['order_reference']
    if (orderRef != null) {
      listParams['filter[order_reference]'] = String(orderRef)
    }
    const res = await client.listWithPage<RawThirtyBeesOrderPayment>('order_payments', listParams)
    return res.items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = this.clientFor(credentials)
    const wrapper = await client.get<{ order_payment: RawThirtyBeesOrderPayment }>(
      `order_payments/${id}`,
    )
    const raw = wrapper.order_payment ?? (wrapper as unknown as RawThirtyBeesOrderPayment)
    return transformTransaction(raw)
  }
}
