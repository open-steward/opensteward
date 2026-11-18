import { CONNECT_FORM } from './connect-form'
/**
 * PrestaShop adapter for the ecommerce vertical.
 *
 * Maps the PrestaShop Webservice API (`/api/`) to the canonical ecommerce
 * resources. PrestaShop uses a webservice key via HTTP Basic auth (key as
 * username, empty password). No OAuth flow, no native webhooks.
 *
 * PrestaShop defaults to XML output — the client forces JSON via
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

import { buildAuthUrl, exchangeCode as psExchangeCode } from './auth'
import { PrestaShopClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformProduct,
  untransformProduct,
  transformProductVariant,
  untransformProductVariant,
  type RawPrestaShopProduct,
  type RawPrestaShopCombination,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawPrestaShopCategory,
} from './transform/collection'
import {
  transformCustomer,
  untransformCustomer,
  type RawPrestaShopCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawPrestaShopOrder,
} from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawPrestaShopOrderCarrier,
} from './transform/fulfillment'
import {
  transformRefund,
  untransformRefund,
  type RawPrestaShopOrderSlip,
} from './transform/refund'
import {
  transformDiscount,
  untransformDiscount,
  type RawPrestaShopCartRule,
} from './transform/discount'
import { syntheticDefaultLocation } from './transform/location'
import {
  transformInventoryLevel,
  type RawPrestaShopStockAvailable,
} from './transform/inventory'
import {
  transformTransaction,
  type RawPrestaShopOrderPayment,
} from './transform/transaction'

export interface PrestaShopAdapterConfig {
  /** Webservice API key. */
  apiKey?: string
  /** PrestaShop site URL, e.g. `https://shop.example.com`. */
  site?: string
}


export class PrestaShopAdapter implements EcommerceAdapter {

  // Connect Link support — see ./connect-form.ts for the fields collected.

  credentialFields = CONNECT_FORM.credentialFields

  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  readonly platform = 'prestashop'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  private configKey: string | undefined
  private configSite: string | undefined

  constructor(config: PrestaShopAdapterConfig = {}) {
    this.configKey = config.apiKey
    this.configSite = config.site
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl(this.configSite ?? 'https://your-prestashop-site.example')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return psExchangeCode()
  }

  /** Webservice keys don't expire — no-op. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): PrestaShopClient {
    const apiKey =
      credentials.accessToken && credentials.accessToken !== 'api-key'
        ? credentials.accessToken
        : this.configKey
    const site = (credentials.extra?.['site'] as string | undefined) ?? this.configSite

    if (!apiKey || !site) {
      throw new Error(
        'PrestaShop adapter is missing apiKey/site — ' +
          'either configure them in config.yml under adapters.prestashop, ' +
          'or POST them to /v1/connections with credentials: {apiKey, site}.',
      )
    }

    const mergedCreds: Credentials = {
      ...credentials,
      accessToken: apiKey,
      extra: { ...credentials.extra, site },
    }
    return new PrestaShopClient(mergedCreds)
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
    const res = await client.listWithPage<RawPrestaShopProduct>('products', this.listParams(params))
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const wrapper = await client.get<{ product: RawPrestaShopProduct }>(`products/${id}`)
    return transformProduct(wrapper.product ?? (wrapper as unknown as RawPrestaShopProduct))
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const wrapper = await client.post<{ product: RawPrestaShopProduct }>(
      'products',
      { product: untransformProduct(data) },
    )
    return transformProduct(wrapper.product ?? (wrapper as unknown as RawPrestaShopProduct))
  }

  async updateProduct(credentials: Credentials, id: string, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const wrapper = await client.put<{ product: RawPrestaShopProduct }>(
      `products/${id}`,
      { product: { ...untransformProduct(data), id: Number(id) } },
    )
    return transformProduct(wrapper.product ?? (wrapper as unknown as RawPrestaShopProduct))
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`products/${id}`)
  }

  // ── Variants (combinations) ───────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | number | undefined
    if (productId == null) {
      throw new Error(
        'PrestaShop requires ?product_id= for listVariants; combinations are linked via id_product.',
      )
    }
    const pid = String(productId)
    const client = this.clientFor(credentials)
    const listParams = { ...this.listParams(params), 'filter[id_product]': pid }
    const res = await client.listWithPage<RawPrestaShopCombination>('combinations', listParams)
    return res.items.map((v) => transformProductVariant(v, pid))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    const client = this.clientFor(credentials)
    const wrapper = await client.get<{ combination: RawPrestaShopCombination }>(`combinations/${variantId}`)
    const raw = wrapper.combination ?? (wrapper as unknown as RawPrestaShopCombination)
    return transformProductVariant(raw, productId)
  }

  async createVariant(credentials: Credentials, data: Partial<ProductVariant>): Promise<ProductVariant> {
    const productId = data.productId
    if (!productId) throw new Error('createVariant requires productId')
    const client = this.clientFor(credentials)
    const body = { ...untransformProductVariant(data), id_product: Number(productId) }
    const wrapper = await client.post<{ combination: RawPrestaShopCombination }>(
      'combinations',
      { combination: body },
    )
    const raw = wrapper.combination ?? (wrapper as unknown as RawPrestaShopCombination)
    return transformProductVariant(raw, productId)
  }

  async updateVariant(credentials: Credentials, id: string, data: Partial<ProductVariant>): Promise<ProductVariant> {
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    const client = this.clientFor(credentials)
    const wrapper = await client.put<{ combination: RawPrestaShopCombination }>(
      `combinations/${variantId}`,
      { combination: { ...untransformProductVariant(data), id: Number(variantId) } },
    )
    const raw = wrapper.combination ?? (wrapper as unknown as RawPrestaShopCombination)
    return transformProductVariant(raw, productId)
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    const [, variantId] = id.split(':')
    if (!variantId) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    await this.clientFor(credentials).delete(`combinations/${variantId}`)
  }

  // ── Collections (categories) ──────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<RawPrestaShopCategory>('categories', this.listParams(params))
    return res.items.map((c) => transformCollection(c))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.clientFor(credentials)
    const wrapper = await client.get<{ category: RawPrestaShopCategory }>(`categories/${id}`)
    return transformCollection(wrapper.category ?? (wrapper as unknown as RawPrestaShopCategory))
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const client = this.clientFor(credentials)
    const wrapper = await client.post<{ category: RawPrestaShopCategory }>(
      'categories',
      { category: untransformCollection(data) },
    )
    return transformCollection(wrapper.category ?? (wrapper as unknown as RawPrestaShopCategory))
  }

  async updateCollection(credentials: Credentials, id: string, data: Partial<Collection>): Promise<Collection> {
    const client = this.clientFor(credentials)
    const wrapper = await client.put<{ category: RawPrestaShopCategory }>(
      `categories/${id}`,
      { category: { ...untransformCollection(data), id: Number(id) } },
    )
    return transformCollection(wrapper.category ?? (wrapper as unknown as RawPrestaShopCategory))
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`categories/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(_credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    return [syntheticDefaultLocation(this.configSite ?? 'default')]
  }

  async getLocation(_credentials: Credentials, id: string): Promise<Location> {
    if (id !== 'default') {
      throw new Error(`PrestaShop has no native locations; unknown location id '${id}'`)
    }
    return syntheticDefaultLocation(this.configSite ?? 'default')
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(credentials: Credentials, params: QueryParams): Promise<InventoryLevel[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<RawPrestaShopStockAvailable>(
      'stock_availables',
      this.listParams(params),
    )
    return res.items.map((s) => transformInventoryLevel(s))
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    const wrapper = await client.get<{ stock_available: RawPrestaShopStockAvailable }>(
      `stock_availables/${id}`,
    )
    const raw = wrapper.stock_available ?? (wrapper as unknown as RawPrestaShopStockAvailable)
    return transformInventoryLevel(raw)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    // Find stock_available for this variant.
    const [productId, combinationId] = data.variantId.split(':')
    if (!productId) {
      throw new Error('adjustInventoryLevel requires composite variantId `productId:combinationId`')
    }
    const filterParams: Record<string, unknown> = {
      'filter[id_product]': productId,
      display: 'full',
    }
    if (combinationId && combinationId !== 'default') {
      filterParams['filter[id_product_attribute]'] = combinationId
    }
    const list = await client.get<{ stock_availables: RawPrestaShopStockAvailable[] }>(
      'stock_availables',
      filterParams,
    )
    const stocks = list.stock_availables ?? []
    if (stocks.length === 0) {
      throw new Error(`No stock_available found for variant ${data.variantId}`)
    }
    const stock = stocks[0]!
    const currentQty = typeof stock.quantity === 'string'
      ? parseInt(stock.quantity, 10)
      : (stock.quantity ?? 0)
    const newQty = currentQty + data.delta
    const wrapper = await client.put<{ stock_available: RawPrestaShopStockAvailable }>(
      `stock_availables/${stock.id}`,
      { stock_available: { id: stock.id, quantity: newQty } },
    )
    const updated = wrapper.stock_available ?? (wrapper as unknown as RawPrestaShopStockAvailable)
    return transformInventoryLevel(updated, productId)
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
    const list = await client.get<{ stock_availables: RawPrestaShopStockAvailable[] }>(
      'stock_availables',
      filterParams,
    )
    const stocks = list.stock_availables ?? []
    if (stocks.length === 0) {
      throw new Error(`No stock_available found for variant ${data.variantId}`)
    }
    const stock = stocks[0]!
    const wrapper = await client.put<{ stock_available: RawPrestaShopStockAvailable }>(
      `stock_availables/${stock.id}`,
      { stock_available: { id: stock.id, quantity: data.available } },
    )
    const updated = wrapper.stock_available ?? (wrapper as unknown as RawPrestaShopStockAvailable)
    return transformInventoryLevel(updated, productId)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<RawPrestaShopCustomer>('customers', this.listParams(params))
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const client = this.clientFor(credentials)
    const wrapper = await client.get<{ customer: RawPrestaShopCustomer }>(`customers/${id}`)
    return transformCustomer(wrapper.customer ?? (wrapper as unknown as RawPrestaShopCustomer))
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const client = this.clientFor(credentials)
    const wrapper = await client.post<{ customer: RawPrestaShopCustomer }>(
      'customers',
      { customer: untransformCustomer(data) },
    )
    return transformCustomer(wrapper.customer ?? (wrapper as unknown as RawPrestaShopCustomer))
  }

  async updateCustomer(credentials: Credentials, id: string, data: Partial<Customer>): Promise<Customer> {
    const client = this.clientFor(credentials)
    const wrapper = await client.put<{ customer: RawPrestaShopCustomer }>(
      `customers/${id}`,
      { customer: { ...untransformCustomer(data), id: Number(id) } },
    )
    return transformCustomer(wrapper.customer ?? (wrapper as unknown as RawPrestaShopCustomer))
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`customers/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<RawPrestaShopOrder>('orders', this.listParams(params))
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const wrapper = await client.get<{ order: RawPrestaShopOrder }>(`orders/${id}`)
    return transformOrder(wrapper.order ?? (wrapper as unknown as RawPrestaShopOrder))
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = this.clientFor(credentials)
    const wrapper = await client.post<{ order: RawPrestaShopOrder }>(
      'orders',
      { order: untransformOrder(data) },
    )
    return transformOrder(wrapper.order ?? (wrapper as unknown as RawPrestaShopOrder))
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = this.clientFor(credentials)
    const wrapper = await client.put<{ order: RawPrestaShopOrder }>(
      `orders/${id}`,
      { order: { ...untransformOrder(data), id: Number(id) } },
    )
    return transformOrder(wrapper.order ?? (wrapper as unknown as RawPrestaShopOrder))
  }

  async cancelOrder(credentials: Credentials, id: string, _data?: { reason?: string }): Promise<Order> {
    const client = this.clientFor(credentials)
    // Cancel by setting current_state to 6 (Cancelled).
    const wrapper = await client.put<{ order: RawPrestaShopOrder }>(
      `orders/${id}`,
      { order: { id: Number(id), current_state: 6 } },
    )
    return transformOrder(wrapper.order ?? (wrapper as unknown as RawPrestaShopOrder))
  }

  // ── Fulfillments (order_carriers) ─────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | number | undefined
    const client = this.clientFor(credentials)
    const listParams: Record<string, unknown> = { ...this.listParams(params) }
    if (orderId != null) {
      listParams['filter[id_order]'] = String(orderId)
    }
    const res = await client.listWithPage<RawPrestaShopOrderCarrier>('order_carriers', listParams)
    return res.items.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const wrapper = await client.get<{ order_carrier: RawPrestaShopOrderCarrier }>(
      `order_carriers/${id}`,
    )
    const raw = wrapper.order_carrier ?? (wrapper as unknown as RawPrestaShopOrderCarrier)
    return transformFulfillment(raw)
  }

  async createFulfillment(credentials: Credentials, data: Partial<Fulfillment>): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const wrapper = await client.post<{ order_carrier: RawPrestaShopOrderCarrier }>(
      'order_carriers',
      { order_carrier: untransformFulfillment(data) },
    )
    const raw = wrapper.order_carrier ?? (wrapper as unknown as RawPrestaShopOrderCarrier)
    return transformFulfillment(raw)
  }

  async updateFulfillment(credentials: Credentials, id: string, data: Partial<Fulfillment>): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const wrapper = await client.put<{ order_carrier: RawPrestaShopOrderCarrier }>(
      `order_carriers/${id}`,
      { order_carrier: { ...untransformFulfillment(data), id: Number(id) } },
    )
    const raw = wrapper.order_carrier ?? (wrapper as unknown as RawPrestaShopOrderCarrier)
    return transformFulfillment(raw)
  }

  // ── Refunds (order_slip) ──────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = (params['order_id'] ?? params['orderId']) as string | number | undefined
    const client = this.clientFor(credentials)
    const listParams: Record<string, unknown> = { ...this.listParams(params) }
    if (orderId != null) {
      listParams['filter[id_order]'] = String(orderId)
    }
    const res = await client.listWithPage<RawPrestaShopOrderSlip>('order_slip', listParams)
    return res.items.map((r) => transformRefund(r, orderId != null ? String(orderId) : undefined))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const client = this.clientFor(credentials)
    const wrapper = await client.get<{ order_slip: RawPrestaShopOrderSlip }>(
      `order_slip/${id}`,
    )
    const raw = wrapper.order_slip ?? (wrapper as unknown as RawPrestaShopOrderSlip)
    return transformRefund(raw)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const client = this.clientFor(credentials)
    const wrapper = await client.post<{ order_slip: RawPrestaShopOrderSlip }>(
      'order_slip',
      { order_slip: untransformRefund(data) },
    )
    const raw = wrapper.order_slip ?? (wrapper as unknown as RawPrestaShopOrderSlip)
    return transformRefund(raw, data.orderId)
  }

  // ── Discounts (cart_rules) ────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<RawPrestaShopCartRule>('cart_rules', this.listParams(params))
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.clientFor(credentials)
    const wrapper = await client.get<{ cart_rule: RawPrestaShopCartRule }>(`cart_rules/${id}`)
    return transformDiscount(wrapper.cart_rule ?? (wrapper as unknown as RawPrestaShopCartRule))
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const client = this.clientFor(credentials)
    const wrapper = await client.post<{ cart_rule: RawPrestaShopCartRule }>(
      'cart_rules',
      { cart_rule: untransformDiscount(data) },
    )
    return transformDiscount(wrapper.cart_rule ?? (wrapper as unknown as RawPrestaShopCartRule))
  }

  async updateDiscount(credentials: Credentials, id: string, data: Partial<Discount>): Promise<Discount> {
    const client = this.clientFor(credentials)
    const wrapper = await client.put<{ cart_rule: RawPrestaShopCartRule }>(
      `cart_rules/${id}`,
      { cart_rule: { ...untransformDiscount(data), id: Number(id) } },
    )
    return transformDiscount(wrapper.cart_rule ?? (wrapper as unknown as RawPrestaShopCartRule))
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`cart_rules/${id}`)
  }

  // ── Transactions (order_payments) ─────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    const client = this.clientFor(credentials)
    const listParams: Record<string, unknown> = { ...this.listParams(params) }
    if (orderId != null) {
      // PrestaShop filters order_payments by order reference, not id
      listParams['filter[order_reference]'] = orderId
    }
    const res = await client.listWithPage<RawPrestaShopOrderPayment>(
      'order_payments',
      listParams,
    )
    return res.items.map((p) => transformTransaction(p))
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = this.clientFor(credentials)
    const wrapper = await client.get<{ order_payment: RawPrestaShopOrderPayment }>(
      `order_payments/${id}`,
    )
    const raw = wrapper.order_payment ?? (wrapper as unknown as RawPrestaShopOrderPayment)
    return transformTransaction(raw)
  }
}
