/**
 * Lightspeed Retail (R-Series) adapter for the ecommerce vertical.
 *
 * Maps the Lightspeed R-Series API to canonical ecommerce resources.
 * R-Series is a legacy POS platform with a REST API that wraps responses
 * in resource-named envelopes. Access tokens expire every ~30 minutes.
 *
 * No webhooks — R-Series does not support native webhooks.
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
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

import { exchangeCode as lsExchangeCode, refreshAccessToken } from './auth'
import { LightspeedRetailClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformProduct, untransformProduct, type RawLightspeedItem } from './transform/product'
import { transformVariant, untransformVariant } from './transform/variant'
import { transformCollection, untransformCollection, type RawLightspeedCategory } from './transform/collection'
import { transformLocation, type RawLightspeedShop } from './transform/location'
import { transformInventoryLevel, type RawLightspeedItemShop } from './transform/inventory'
import { transformCustomer, untransformCustomer, type RawLightspeedCustomer } from './transform/customer'
import { transformOrder, untransformOrder, type RawLightspeedSale } from './transform/order'
import { transformFulfillment, type RawLightspeedSpecialOrder } from './transform/fulfillment'
import { transformRefund, untransformRefund } from './transform/refund'
import { transformTransaction, type RawLightspeedSalePayment } from './transform/transaction'
import { transformDiscount, untransformDiscount, type RawLightspeedDiscount } from './transform/discount'

export class LightspeedRetailAdapter implements EcommerceAdapter {
  readonly platform = 'lightspeed-retail'
  readonly version = '0.1.0'
  /** "The Lightspeed API limits the number of returned objects to a maximum of 100." */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    throw new Error(
      'Lightspeed Retail adapter v1 does not support interactive OAuth. ' +
        'Use POST /v1/connections with pre-generated tokens.',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return lsExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshAccessToken(credentials)
  }

  // ── Webhooks — NOT supported by R-Series ─────────────────────────────────
  // Intentionally omitted. The registry will return 501 for webhook methods.

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): LightspeedRetailClient {
    return new LightspeedRetailClient(credentials)
  }

  /**
   * Caller page `params.page` of a V3 query endpoint, at the caller's limit
   * clamped to the documented maximum of 100.
   *
   * V3 pages by opaque cursor only, so page N is reached by following
   * `@attributes.next` from page 1; `pageByCursor` remembers the URL that
   * starts each page so a sequential walk costs one request per page. The key
   * covers the connection, the endpoint, every filter and the size sent,
   * because a next URL carries all of them.
   */
  private async listPage<R>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    resourceKey: string,
    filters: Record<string, unknown> = {},
  ): Promise<R[]> {
    const client = this.client(credentials)
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    const limit = Math.min(asked, MAX_PAGE_SIZE)
    const query = { ...filters, limit }
    const accountId = String(credentials.extra?.['accountId'])
    const page = await pageByCursor<R, string>(
      cursorPagerKey(connectionScope(accountId, credentials), path, query),
      params.page,
      (next) => client.listCursorPage<R>(next ?? path, resourceKey, query),
    )
    reportUpstreamPage(params, {
      hasMore: page.hasMore,
      ...(limit < asked ? { pageSize: limit } : {}),
    })
    return page.items
  }

  private getShopId(credentials: Credentials, params?: QueryParams): string | undefined {
    return (params?.['shop_id'] ?? params?.['shopId'] ?? params?.['location_id'] ??
      params?.['locationId'] ?? credentials.extra?.['shopId']) as string | undefined
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const filters: Record<string, unknown> = {}
    if (params['categoryId'] || params['category_id']) {
      filters['categoryID'] = params['categoryId'] ?? params['category_id']
    }
    const items = await this.listPage<RawLightspeedItem>(credentials, params, 'Item.json', 'Item', filters)
    return items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.client(credentials)
    const res = await client.get<{ Item: RawLightspeedItem }>(`Item/${id}.json`)
    return transformProduct(res.Item)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.client(credentials)
    const body = untransformProduct(data)
    const res = await client.post<{ Item: RawLightspeedItem }>('Item.json', body)
    return transformProduct(res.Item)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.client(credentials)
    const body = untransformProduct(data)
    const res = await client.put<{ Item: RawLightspeedItem }>(`Item/${id}.json`, body)
    return transformProduct(res.Item)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`Item/${id}.json`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const matrixId = params['productId'] ?? params['product_id'] ?? params['itemMatrixID']
    const filters: Record<string, unknown> = {}
    if (matrixId) {
      filters['itemMatrixID'] = String(matrixId)
    }
    const items = await this.listPage<RawLightspeedItem>(credentials, params, 'Item.json', 'Item', filters)
    return items.map((item) => transformVariant(item, matrixId ? String(matrixId) : undefined))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const client = this.client(credentials)
    const res = await client.get<{ Item: RawLightspeedItem }>(`Item/${id}.json`)
    return transformVariant(res.Item)
  }

  async createVariant(credentials: Credentials, data: Partial<ProductVariant>): Promise<ProductVariant> {
    const client = this.client(credentials)
    const body = untransformVariant(data)
    const res = await client.post<{ Item: RawLightspeedItem }>('Item.json', body)
    return transformVariant(res.Item, data.productId ?? undefined)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const client = this.client(credentials)
    const body = untransformVariant(data)
    const res = await client.put<{ Item: RawLightspeedItem }>(`Item/${id}.json`, body)
    return transformVariant(res.Item)
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`Item/${id}.json`)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const items = await this.listPage<RawLightspeedCategory>(credentials, params, 'Category.json', 'Category')
    return items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.client(credentials)
    const res = await client.get<{ Category: RawLightspeedCategory }>(`Category/${id}.json`)
    return transformCollection(res.Category)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const client = this.client(credentials)
    const body = untransformCollection(data)
    const res = await client.post<{ Category: RawLightspeedCategory }>('Category.json', body)
    return transformCollection(res.Category)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.client(credentials)
    const body = untransformCollection(data)
    const res = await client.put<{ Category: RawLightspeedCategory }>(`Category/${id}.json`, body)
    return transformCollection(res.Category)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`Category/${id}.json`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const items = await this.listPage<RawLightspeedShop>(credentials, params, 'Shop.json', 'Shop')
    return items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const client = this.client(credentials)
    const res = await client.get<{ Shop: RawLightspeedShop }>(`Shop/${id}.json`)
    return transformLocation(res.Shop)
  }

  // createLocation / updateLocation / deleteLocation — Lightspeed Shops cannot
  // be created/modified/deleted via the API. (501)

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const filters: Record<string, unknown> = {}
    const itemId = params['variantId'] ?? params['variant_id'] ?? params['itemId'] ?? params['item_id']
    const shopId = this.getShopId(credentials, params)
    if (itemId) filters['itemID'] = String(itemId)
    if (shopId) filters['shopID'] = String(shopId)

    const items = await this.listPage<RawLightspeedItemShop>(
      credentials,
      params,
      'ItemShop.json',
      'ItemShop',
      filters,
    )
    return items.map(transformInventoryLevel)
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // Composite id: {itemID}:{shopID}
    const [itemID, shopID] = id.split(':')
    if (!itemID || !shopID) {
      throw new Error('Invalid inventory level id format: expected `itemID:shopID`')
    }
    const client = this.client(credentials)
    const res = await client.listWithOffset<RawLightspeedItemShop>(
      'ItemShop.json',
      'ItemShop',
      { itemID, shopID },
    )
    const record = res.items[0]
    if (!record) throw new Error(`Inventory level not found: ${id}`)
    return transformInventoryLevel(record)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const client = this.client(credentials)
    // Read current stock, apply delta, then set
    const current = await this.getInventoryLevel(credentials, `${data.variantId}:${data.locationId}`)
    const newQoh = current.available + data.delta
    await client.put(`Item/${data.variantId}.json`, {
      Shops: {
        Shop: {
          shopID: data.locationId,
          qoh: String(newQoh),
        },
      },
    })
    return this.getInventoryLevel(credentials, `${data.variantId}:${data.locationId}`)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.client(credentials)
    await client.put(`Item/${data.variantId}.json`, {
      Shops: {
        Shop: {
          shopID: data.locationId,
          qoh: String(data.available),
        },
      },
    })
    return this.getInventoryLevel(credentials, `${data.variantId}:${data.locationId}`)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const items = await this.listPage<RawLightspeedCustomer>(credentials, params, 'Customer.json', 'Customer')
    return items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const client = this.client(credentials)
    const res = await client.get<{ Customer: RawLightspeedCustomer }>(`Customer/${id}.json`)
    return transformCustomer(res.Customer)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const client = this.client(credentials)
    const body = untransformCustomer(data)
    const res = await client.post<{ Customer: RawLightspeedCustomer }>('Customer.json', body)
    return transformCustomer(res.Customer)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.client(credentials)
    const body = untransformCustomer(data)
    const res = await client.put<{ Customer: RawLightspeedCustomer }>(`Customer/${id}.json`, body)
    return transformCustomer(res.Customer)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`Customer/${id}.json`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const filters: Record<string, unknown> = {}
    const shopId = this.getShopId(credentials, params)
    if (shopId) filters['shopID'] = shopId
    if (params['customerId'] ?? params['customer_id']) {
      filters['customerID'] = params['customerId'] ?? params['customer_id']
    }

    const items = await this.listPage<RawLightspeedSale>(credentials, params, 'Sale.json', 'Sale', filters)
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.client(credentials)
    const res = await client.get<{ Sale: RawLightspeedSale }>(`Sale/${id}.json`)
    return transformOrder(res.Sale)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = this.client(credentials)
    const shopId = this.getShopId(credentials) ?? (data.metadata?.['shopID'] as string | undefined)
    const body = untransformOrder(data, shopId)
    const res = await client.post<{ Sale: RawLightspeedSale }>('Sale.json', body)
    return transformOrder(res.Sale)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const client = this.client(credentials)
    const body: Record<string, unknown> = {}
    if (data.customerId) body['customerID'] = data.customerId
    if (data.orderNumber) body['referenceNumber'] = data.orderNumber
    const res = await client.put<{ Sale: RawLightspeedSale }>(`Sale/${id}.json`, body)
    return transformOrder(res.Sale)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const client = this.client(credentials)
    const res = await client.put<{ Sale: RawLightspeedSale }>(`Sale/${id}.json`, {
      voided: 'true',
    })
    return transformOrder(res.Sale)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const filters: Record<string, unknown> = {}
    const saleId = params['order_id'] ?? params['orderId']
    if (saleId) filters['saleID'] = String(saleId)

    const items = await this.listPage<RawLightspeedSpecialOrder>(
      credentials,
      params,
      'SpecialOrder.json',
      'SpecialOrder',
      filters,
    )
    return items.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const client = this.client(credentials)
    const res = await client.get<{ SpecialOrder: RawLightspeedSpecialOrder }>(
      `SpecialOrder/${id}.json`,
    )
    return transformFulfillment(res.SpecialOrder)
  }

  // createFulfillment / updateFulfillment / cancelFulfillment — R-Series special
  // orders have limited mutation API. (501)

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const items = await this.listPage<RawLightspeedSale>(credentials, params, 'Sale.json', 'Sale', {
      voided: 'true',
    })
    return items.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const client = this.client(credentials)
    const res = await client.get<{ Sale: RawLightspeedSale }>(`Sale/${id}.json`)
    return transformRefund(res.Sale)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const client = this.client(credentials)
    const shopId = this.getShopId(credentials) ?? (data.metadata?.['shopID'] as string | undefined)
    const body = untransformRefund(data, shopId)
    const res = await client.post<{ Sale: RawLightspeedSale }>('Sale.json', body)
    return transformRefund(res.Sale)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const filters: Record<string, unknown> = {}
    const saleId = params['order_id'] ?? params['orderId'] ?? params['saleId']
    if (saleId) filters['saleID'] = String(saleId)

    const items = await this.listPage<RawLightspeedSalePayment>(
      credentials,
      params,
      'SalePayment.json',
      'SalePayment',
      filters,
    )
    return items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = this.client(credentials)
    const res = await client.get<{ SalePayment: RawLightspeedSalePayment }>(
      `SalePayment/${id}.json`,
    )
    return transformTransaction(res.SalePayment)
  }

  // createTransaction omitted — Lightspeed POS charging is a device operation. (501)

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const items = await this.listPage<RawLightspeedDiscount>(credentials, params, 'Discount.json', 'Discount')
    return items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.client(credentials)
    const res = await client.get<{ Discount: RawLightspeedDiscount }>(`Discount/${id}.json`)
    return transformDiscount(res.Discount)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const client = this.client(credentials)
    const body = untransformDiscount(data)
    const res = await client.post<{ Discount: RawLightspeedDiscount }>('Discount.json', body)
    return transformDiscount(res.Discount)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.client(credentials)
    const body = untransformDiscount(data)
    const res = await client.put<{ Discount: RawLightspeedDiscount }>(`Discount/${id}.json`, body)
    return transformDiscount(res.Discount)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`Discount/${id}.json`)
  }
}
