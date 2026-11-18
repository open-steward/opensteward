/**
 * KORONA POS adapter for the ecommerce vertical.
 *
 * Maps the KORONA Cloud API v3 (HTTP Basic — see `./connect-form.ts`) to the
 * canonical ecommerce resources. Verified against the live spec at
 * https://128.koronacloud.com/web/api/v3/openapi.json and
 * https://manual.koronapos.com/korona-cloud-api-v3/.
 *
 * Every list method accepts only `{ page, limit }`: both this platform and
 * the canonical convention are 1-indexed, so `page`/`size` are passed
 * straight through with no off-by-one adjustment (contrast IdoSell, which
 * is 0-indexed).
 *
 * No canonical `Money` field is ever populated from a product, order, or
 * price object — see `transform/product.ts` for why (no currency field
 * exists anywhere on those schemas). `transform/transaction.ts` is the one
 * exception, and only after `resolveCurrency` below independently verifies
 * a real system-currency code.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { Iso4217Currency, reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'

import { CONNECT_FORM } from './connect-form'
import { buildAuthUrl, exchangeCode as koronaExchangeCode } from './auth'
import { KoronaClient, type KoronaAddOrUpdateResult, type KoronaResultList } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformProduct, untransformProduct, type KoronaProduct } from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type KoronaCommodityGroup,
} from './transform/collection'
import { transformLocation, type KoronaOrganizationalUnit } from './transform/location'
import { transformInventoryLevel, type KoronaProductStock } from './transform/inventory'
import { transformCustomer, untransformCustomer, type KoronaCustomer } from './transform/customer'
import { transformOrder, untransformOrder, type KoronaCustomerOrder } from './transform/order'
import { transformReceipt, type KoronaReceipt } from './transform/transaction'
import { transformDiscount, untransformDiscount, type KoronaPromotion } from './transform/discount'

interface KoronaCurrency {
  key?: string
  systemCurrency?: boolean
}

export class KoronaPosAdapter implements EcommerceAdapter {
  readonly platform = 'korona-pos'
  readonly version = '0.1.0'

  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return koronaExchangeCode()
  }

  /** KORONA API credentials are not documented to expire or rotate. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): KoronaClient {
    return new KoronaClient(credentials)
  }

  private page(params: QueryParams): { page: number; size: number } {
    return { page: params.page ?? 1, size: params.limit ?? DEFAULT_PAGE_SIZE }
  }

  private reportPage(params: QueryParams, res: KoronaResultList<unknown>): void {
    reportUpstreamPage(params, {
      totalCount: res.resultsTotal,
      totalPages: res.pagesTotal,
      currentPage: res.currentPage,
      hasMore: res.pagesTotal > 0 ? res.currentPage < res.pagesTotal : undefined,
    })
  }

  /**
   * The one real currency signal on this platform: the `/currencies` entry
   * flagged `systemCurrency: true`. Returns `undefined` (never a fabricated
   * default) when none is found or its `key` doesn't validate as ISO 4217.
   */
  private async resolveCurrency(client: KoronaClient): Promise<string | undefined> {
    const res = await client.list<KoronaCurrency>('/currencies', { page: 1, size: DEFAULT_PAGE_SIZE })
    const key = res.results.find((c) => c.systemCurrency === true)?.key?.toUpperCase()
    return key && Iso4217Currency.safeParse(key).success ? key : undefined
  }

  private async createViaBatch(
    client: KoronaClient,
    path: string,
    body: Record<string, unknown>,
    resourceLabel: string,
  ): Promise<string> {
    const results = await client.post<KoronaAddOrUpdateResult[]>(path, [body])
    const created = results[0]
    if (!created || created.status !== 'OK' || !created.id) {
      throw new Error(`KORONA did not return an id for the created ${resourceLabel}`)
    }
    return created.id
  }

  // ── Products (full CRUD: GET/POST/DELETE/PATCH /products, GET/DELETE/PATCH /products/{id}) ──

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { page, size } = this.page(params)
    const res = await this.client(credentials).list<KoronaProduct>('/products', { page, size })
    this.reportPage(params, res)
    return res.results.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<KoronaProduct>(`/products/${id}`)
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.client(credentials)
    const id = await this.createViaBatch(client, '/products', untransformProduct(data), 'product')
    return this.getProduct(credentials, id)
  }

  async updateProduct(credentials: Credentials, id: string, data: Partial<Product>): Promise<Product> {
    const client = this.client(credentials)
    await client.patch(`/products/${id}`, untransformProduct(data))
    return this.getProduct(credentials, id)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/products/${id}`)
  }

  // ── Collections (full CRUD: /commodityGroups) ───────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const { page, size } = this.page(params)
    const res = await this.client(credentials).list<KoronaCommodityGroup>('/commodityGroups', {
      page,
      size,
    })
    this.reportPage(params, res)
    return res.results.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.client(credentials).get<KoronaCommodityGroup>(`/commodityGroups/${id}`)
    return transformCollection(raw)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const client = this.client(credentials)
    const id = await this.createViaBatch(
      client,
      '/commodityGroups',
      untransformCollection(data),
      'commodity group',
    )
    return this.getCollection(credentials, id)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.client(credentials)
    await client.patch(`/commodityGroups/${id}`, untransformCollection(data))
    return this.getCollection(credentials, id)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/commodityGroups/${id}`)
  }

  // ── Locations (organizationalUnits — see transform/location.ts for why) ────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const { page, size } = this.page(params)
    const res = await this.client(credentials).list<KoronaOrganizationalUnit>('/organizationalUnits', {
      page,
      size,
    })
    this.reportPage(params, res)
    return res.results.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<KoronaOrganizationalUnit>(
      `/organizationalUnits/${id}`,
    )
    return transformLocation(raw)
  }

  // ── Inventory (products/{id}/stocks — see transform/inventory.ts) ──────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const client = this.client(credentials)
    const { page, size } = this.page(params)
    const products = await client.list<KoronaProduct>('/products', { page, size })
    this.reportPage(params, products)
    const levels: InventoryLevel[] = []
    for (const product of products.results) {
      const stocks = await client.list<KoronaProductStock>(`/products/${product.id}/stocks`, {
        page: 1,
        size: DEFAULT_PAGE_SIZE,
      })
      for (const raw of stocks.results) {
        const level = transformInventoryLevel(raw)
        if (level) levels.push(level)
      }
    }
    return levels
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    const [productId, locationId] = id.split(':')
    if (!productId || !locationId) {
      throw new Error('Invalid inventory level id format: expected `productId:locationId`')
    }
    const client = this.client(credentials)
    const stocks = await client.list<KoronaProductStock>(`/products/${productId}/stocks`, {
      page: 1,
      size: DEFAULT_PAGE_SIZE,
    })
    for (const raw of stocks.results) {
      if (raw.warehouse.id !== locationId) continue
      const level = transformInventoryLevel(raw)
      if (level) return level
    }
    throw new Error(`KORONA inventory level ${id} not found`)
  }

  /**
   * `POST /stockAdjustments` (create) → `POST /stockAdjustments/{id}/items`
   * (the relative `amount` change) → `PATCH /stockAdjustments/{id}/book`
   * (apply). `StockAdjustment` "represent[s] a relative quantity change",
   * matching `delta` directly — there is no absolute "set" endpoint (see
   * `metadata.ts` reasoning for why `setInventoryLevel` is not implemented).
   */
  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const client = this.client(credentials)
    const adjustmentId = await this.createViaBatch(
      client,
      '/stockAdjustments',
      { warehouse: { id: data.locationId } },
      'stock adjustment',
    )
    await client.post<KoronaAddOrUpdateResult[]>(`/stockAdjustments/${adjustmentId}/items`, [
      { product: { id: data.variantId }, amount: data.delta },
    ])
    await client.patch(`/stockAdjustments/${adjustmentId}/book`)
    return this.getInventoryLevel(credentials, `${data.variantId}:${data.locationId}`)
  }

  // ── Customers (full CRUD: /customers) ───────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const { page, size } = this.page(params)
    const res = await this.client(credentials).list<KoronaCustomer>('/customers', { page, size })
    this.reportPage(params, res)
    return res.results.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<KoronaCustomer>(`/customers/${id}`)
    return transformCustomer(raw)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const client = this.client(credentials)
    const id = await this.createViaBatch(client, '/customers', untransformCustomer(data), 'customer')
    return this.getCustomer(credentials, id)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.client(credentials)
    await client.patch(`/customers/${id}`, untransformCustomer(data))
    return this.getCustomer(credentials, id)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/customers/${id}`)
  }

  // ── Orders (customerOrders — get/post/patch; see transform/order.ts) ───────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { page, size } = this.page(params)
    const res = await this.client(credentials).list<KoronaCustomerOrder>('/customerOrders', {
      page,
      size,
    })
    this.reportPage(params, res)
    return res.results.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.client(credentials).get<KoronaCustomerOrder>(`/customerOrders/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = this.client(credentials)
    const id = await this.createViaBatch(client, '/customerOrders', untransformOrder(data), 'order')
    return this.getOrder(credentials, id)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = this.client(credentials)
    await client.patch(`/customerOrders/${id}`, untransformOrder(data))
    return this.getOrder(credentials, id)
  }

  // ── Transactions (receipts — read only) ─────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = this.client(credentials)
    const currency = await this.resolveCurrency(client)
    const { page, size } = this.page(params)
    const res = await client.list<KoronaReceipt>('/receipts', { page, size })
    this.reportPage(params, res)
    return res.results.map((r) => transformReceipt(r, currency))
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = this.client(credentials)
    const [currency, raw] = await Promise.all([
      this.resolveCurrency(client),
      client.get<KoronaReceipt>(`/receipts/${id}`),
    ])
    return transformReceipt(raw, currency)
  }

  // ── Discounts (promotions — full CRUD) ──────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const { page, size } = this.page(params)
    const res = await this.client(credentials).list<KoronaPromotion>('/promotions', { page, size })
    this.reportPage(params, res)
    return res.results.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const raw = await this.client(credentials).get<KoronaPromotion>(`/promotions/${id}`)
    return transformDiscount(raw)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const client = this.client(credentials)
    const id = await this.createViaBatch(client, '/promotions', untransformDiscount(data), 'promotion')
    return this.getDiscount(credentials, id)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.client(credentials)
    await client.patch(`/promotions/${id}`, untransformDiscount(data))
    return this.getDiscount(credentials, id)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/promotions/${id}`)
  }
}
