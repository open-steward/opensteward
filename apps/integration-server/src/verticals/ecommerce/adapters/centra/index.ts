/**
 * Centra adapter for the ecommerce vertical.
 *
 * Maps the Centra Order API to the canonical ecommerce resources.
 *
 * Authentication:
 *   Centra uses API key auth via the `API-Authorization` header. The key is
 *   generated in the Centra backend (System → Plugins → Order API) and
 *   supplied in `credentials.accessToken`. The plugin base URL (e.g.
 *   `https://myshop.centra.com/api/order-api`) is supplied in
 *   `credentials.extra.baseUrl`.
 *
 * Supported resources:
 *   Products (read), Variants (read), Collections (read from product feed),
 *   Inventory (stock read/write), Customers (read),
 *   Orders (read/create/cancel), Fulfillments/Shipments (read/create),
 *   Refunds/Returns (read/create).
 *
 * Not supported (no Order API endpoint):
 *   Locations (no warehouse endpoint; listLocations/getLocation refuse 501).
 *   Transactions (synthesised from order payment fields — read only).
 *   Discounts (vouchers — limited read/create; no update/delete endpoint).
 *
 * Docs: https://centra.dev/docs/apis/order-api/api-reference
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  pageOffset,
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

import { buildAuthUrl, exchangeCode as centraExchangeCode } from './auth'
import { CentraClient, type ListResult } from './client'
import { CENTRA_FORM } from './connect-form'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  groupProductItems,
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawCentraProductItem,
} from './transform/product'
import { categoryNames, transformCollection } from './transform/collection'
import { transformInventoryLevel, type RawCentraStockItem } from './transform/inventory'
import { transformCustomer, type RawCentraCustomer } from './transform/customer'
import { transformOrder, untransformOrder, type RawCentraOrder } from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawCentraShipment,
} from './transform/fulfillment'
import { transformRefund, untransformRefund, type RawCentraReturn } from './transform/refund'
import { transformTransaction, type RawCentraOrderPayment } from './transform/transaction'

/**
 * The upstream page a GET products/stock `next` names. The documented value
 * is a relative query ("?limit=10&page=3"); a missing or backwards page is
 * read as the following page.
 */
function nextPageOf(next: string, page: number): number {
  const n = Number(new URLSearchParams(next.slice(next.indexOf('?') + 1)).get('page'))
  return Number.isInteger(n) && n > page ? n : page + 1
}

/** A read the Order API documents no endpoint for, refused before any request. */
function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export interface CentraAdapterConfig {
  /** Informational backend URL used to construct the getAuthUrl link. */
  backendUrl?: string
}

export class CentraAdapter implements EcommerceAdapter {
  readonly platform = 'centra'
  readonly version = '0.1.0'

  // Connect Link support — Order API URL + API key (see ./connect-form).
  credentialFields = CENTRA_FORM.credentialFields
  exchangeCredentials = CENTRA_FORM.exchangeCredentials

  private backendUrl: string | undefined

  constructor(config: CentraAdapterConfig = {}) {
    this.backendUrl = config.backendUrl
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Centra has no OAuth authorize URL. Point the user at the backend plugin
    // page (informational only). The `state` param is intentionally ignored.
    return buildAuthUrl(this.backendUrl)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // Throws a descriptive error — see ./auth.ts.
    return centraExchangeCode()
  }

  /**
   * Centra Order API keys do not expire. Returning credentials unchanged is
   * correct — the shared `isTokenExpired` helper treats credentials without
   * `expiresAt` as non-expiring.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): CentraClient {
    return new CentraClient(credentials)
  }

  /**
   * Filters shared by the list methods, and the caller's page size clamped to
   * MAX_PAGE_SIZE. Paging parameters differ per endpoint and are added by the
   * method. The size sent is reported before the request, so a caller whose
   * limit was clamped strides and judges short pages by the size really sent.
   */
  private listParams(params: QueryParams): Record<string, unknown> {
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    reportUpstreamPage(params, { pageSize: size })
    const out: Record<string, unknown> = { limit: size }
    if (params.updatedAfter) {
      out['modified'] = params.updatedAfter.toISOString().slice(0, 10)
    }
    return out
  }

  /**
   * `offset` for GET orders, customers and shipments ("Offset how far in to
   * start returning orders."), striding by the size sent. These responses
   * carry no next signal or total, so a full page means there may be more.
   */
  private async offsetPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    extra: Record<string, unknown> = {},
  ): Promise<T[]> {
    const query = { ...this.listParams(params), ...extra }
    const size = query['limit'] as number
    query['offset'] = pageOffset(params, size)
    const res = await this.client(credentials).listWithOffset<T>(path, path, query)
    reportUpstreamPage(params, { hasMore: res.items.length >= size })
    return res.items
  }

  /**
   * `page` (1-based) for GET returns ("Number of page of results to
   * return.") and GET products / stock, whose documented `next`
   * ("?limit=10&page=3") says whether another page exists. Returns has no
   * next signal, so there a full page means there may be more.
   */
  private async numberedPage<T>(
    credentials: Credentials,
    path: string,
    resourceKey: string,
    params: QueryParams,
    extra: Record<string, unknown> = {},
  ): Promise<T[]> {
    const query: Record<string, unknown> = {
      ...this.listParams(params),
      ...extra,
      page: pageOffset(params, 1) + 1,
    }
    const size = query['limit'] as number
    const res = await this.client(credentials).listWithOffset<T>(path, resourceKey, query)
    const signalsNext = path === 'products' || path === 'stock'
    reportUpstreamPage(params, {
      hasMore: signalsNext ? res.next !== undefined : res.items.length >= size,
    })
    return res.items
  }

  // ── Products ──────────────────────────────────────────────────────────────

  /**
   * GET products returns one row per stock item, folded here into products,
   * so one upstream page is not one caller page of products. The pager walks
   * upstream pages of MAX_PAGE_SIZE rows, following the documented `next`
   * ("?limit=10&page=3"), and cuts the caller's products out of them.
   *
   * The last product of an upstream page may continue on the next one, so its
   * rows are carried into the next page's cursor and served there, whole. A
   * cursor is `{ page, carry }`, which fetches the same rows every time.
   */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const filters: Record<string, unknown> = {}
    if (params.updatedAfter) filters['modified'] = params.updatedAfter.toISOString().slice(0, 10)
    const client = this.client(credentials)
    const account = String(credentials.extra?.['baseUrl'] ?? credentials.extra?.['site'] ?? '')
    const key = cursorPagerKey(connectionScope(account, credentials), 'products', {
      ...filters,
      limit: MAX_PAGE_SIZE,
    })
    type Cursor = { page: number; carry: RawCentraProductItem[] }
    const { items } = await pageByRows<Product, Cursor>(
      key,
      params,
      async (cursor) => {
        const page = cursor?.page ?? 1
        const res = await client.listWithOffset<RawCentraProductItem>('products', 'products', {
          ...filters,
          limit: MAX_PAGE_SIZE,
          page,
        })
        const rows = [...(cursor?.carry ?? []), ...res.items]
        if (res.next === undefined) return { items: groupProductItems(rows), next: undefined }
        const last = rows.at(-1)
        const lastId = last === undefined ? undefined : String(last.productId)
        return {
          items: groupProductItems(rows.filter((r) => String(r.productId) !== lastId)),
          next: {
            page: nextPageOf(res.next, page),
            carry: rows.filter((r) => String(r.productId) === lastId),
          },
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    // Centra /products supports filtering by productId via query param.
    const res = await this.client(credentials).listWithOffset<RawCentraProductItem>(
      'products',
      'products',
      { product: id, limit: 100 },
    )
    const items = res.items.filter((i) => String(i.productId) === id)
    if (items.length === 0) throw new Error(`Centra product not found: ${id}`)
    const [first, ...rest] = items
    return transformProduct(first!, [first!, ...rest])
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    await this.client(credentials).put(`products/${id}`, untransformProduct(data))
    return this.getProduct(credentials, id)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    const items = await this.numberedPage<RawCentraProductItem>(
      credentials,
      'products',
      'products',
      params,
      productId ? { product: productId } : {},
    )
    return items.map(transformVariant)
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Centra stockItemId == variant id in our transform; filter by sku or scan.
    const res = await this.client(credentials).listWithOffset<RawCentraProductItem>(
      'products',
      'products',
      { limit: 100 },
    )
    const item = res.items.find((i) => String(i.stockItemId) === id || String(i.variantId) === id)
    if (!item) throw new Error(`Centra variant not found: ${id}`)
    return transformVariant(item)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    await this.client(credentials).put(`products/variants/${id}`, untransformVariant(data))
    return this.getVariant(credentials, id)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  /**
   * Every category name on the product feed, in order of first appearance.
   * The Order API has no categories endpoint: GET products "will return
   * product data from Centra with categories", each row's `categories` being
   * an "Array with names of the categories the product belongs to." A
   * category can first appear on any product, so the whole feed is walked,
   * following the documented `next` ("?limit=10&page=3") until it is absent.
   */
  private async allCategoryNames(credentials: Credentials): Promise<string[]> {
    const client = this.client(credentials)
    const names = new Set<string>()
    let page: number | undefined = 1
    while (page !== undefined) {
      const res: ListResult<RawCentraProductItem> =
        await client.listWithOffset<RawCentraProductItem>('products', 'products', {
          limit: MAX_PAGE_SIZE,
          page,
        })
      for (const item of res.items) {
        for (const name of categoryNames((item as Record<string, unknown>)['categories'])) {
          names.add(name)
        }
      }
      page = res.next === undefined ? undefined : nextPageOf(res.next, page)
    }
    return [...names]
  }

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const names = await this.allCategoryNames(credentials)
    return pageLocally(names, params).map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const names = await this.allCategoryNames(credentials)
    if (!names.includes(id)) throw new Error(`Centra category not found: ${id}`)
    return transformCollection(id)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  /**
   * The Order API reference documents no warehouse or location endpoint.
   * Warehouses surface only per shipment line (`"warehouses": [{ "name":
   * "Default warehouse", "itemQty": "1" }]`) of GET shipments, which "will
   * list all Good to Go-shipments that are not sent, oldest first." That is
   * not a list of locations, so this refuses rather than derive or invent one.
   */
  async listLocations(_credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    throw notSupported(
      'Centra cannot list locations: the Order API documents no warehouse endpoint; ' +
        'warehouses appear only as shipment lines\' "warehouses" (name, itemQty).',
    )
  }

  async getLocation(_credentials: Credentials, _id: string): Promise<Location> {
    throw notSupported(
      'Centra cannot read a location: the Order API documents no warehouse endpoint.',
    )
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    // Get stock returns its rows under `products` ("products array required
    // List of the products."), not `stock`.
    const items = await this.numberedPage<RawCentraStockItem>(
      credentials,
      'stock',
      'products',
      params,
    )
    return items.map((s) => transformInventoryLevel(s))
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    // Centra POST /stock sets physical stock by SKU / stockItemId.
    const updated = await this.client(credentials).post<RawCentraStockItem>('stock', {
      stockItemId: data.variantId,
      quantity: data.available,
    })
    return transformInventoryLevel(updated, data.locationId)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const items = await this.offsetPage<RawCentraCustomer>(credentials, 'customers', params)
    return items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ customer: RawCentraCustomer }>(
      `customers/${id}`,
    )
    // Centra may wrap in a `customer` key or return the object directly.
    const raw = (res.customer ?? res) as RawCentraCustomer
    return transformCustomer(raw)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const items = await this.offsetPage<RawCentraOrder>(credentials, 'orders', params)
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    // Centra GET /orders with `order` param returns the specific order.
    const res = await this.client(credentials).listWithOffset<RawCentraOrder>('orders', 'orders', {
      order: id,
      limit: 1,
    })
    const order = res.items[0]
    if (!order) throw new Error(`Centra order not found: ${id}`)
    return transformOrder(order)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const body = untransformOrder(data)
    const res = await this.client(credentials).post<{
      status: string
      order?: RawCentraOrder
      orders?: string[]
    }>('order', body)
    // Centra returns `{ status: "ok", orders: ["12345"] }` on success. If
    // `order` is embedded we can use it directly; otherwise re-fetch.
    if (res.order) return transformOrder(res.order)
    const orderId = res.orders?.[0]
    if (!orderId) throw new Error('Centra createOrder: no order id in response')
    return this.getOrder(credentials, orderId)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    // Centra cancels orders by updating orderStatus via PUT /orders.
    await this.client(credentials).put(`orders/${id}`, { orderStatus: 'cancelled' })
    return this.getOrder(credentials, id)
  }

  // ── Fulfillments (Shipments) ──────────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = params['order_id'] ?? params['orderId']
    const items = await this.offsetPage<RawCentraShipment>(
      credentials,
      'shipments',
      params,
      orderId ? { order: String(orderId) } : {},
    )
    return items.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const res = await this.client(credentials).listWithOffset<RawCentraShipment>(
      'shipments',
      'shipments',
      { shipment: id, limit: 1 },
    )
    const shipment = res.items[0]
    if (!shipment) throw new Error(`Centra shipment not found: ${id}`)
    return transformFulfillment(shipment)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const body = {
      order: data.orderId,
      ...untransformFulfillment(data),
    }
    const res = await this.client(credentials).post<{
      shipment: RawCentraShipment
      shipmentId?: number | string
    }>('shipments', body)
    if (res.shipment) return transformFulfillment(res.shipment)
    if (res.shipmentId != null) return this.getFulfillment(credentials, String(res.shipmentId))
    throw new Error('Centra createFulfillment: no shipment in response')
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    await this.client(credentials).put(`shipments/${id}`, {
      carrier: data.carrier,
      service: data.service,
      trackingId: data.trackingNumber,
      trackingUrl: data.trackingUrl,
    })
    return this.getFulfillment(credentials, id)
  }

  // ── Refunds (Returns) ─────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = params['order_id'] ?? params['orderId']
    const items = await this.numberedPage<RawCentraReturn>(
      credentials,
      'returns',
      'returns',
      params,
      orderId ? { order: String(orderId) } : {},
    )
    return items.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).listWithOffset<RawCentraReturn>(
      'returns',
      'returns',
      { return: id, limit: 1 },
    )
    const ret = res.items[0]
    if (!ret) throw new Error(`Centra return not found: ${id}`)
    return transformRefund(ret)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const body = untransformRefund(data)
    const res = await this.client(credentials).post<{
      return?: RawCentraReturn
      returnId?: number | string
    }>('return', body)
    if (res.return) return transformRefund(res.return)
    if (res.returnId != null) return this.getRefund(credentials, String(res.returnId))
    throw new Error('Centra createRefund: no return id in response')
  }

  // ── Transactions (synthetic from order payment data) ──────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) throw new Error('listTransactions requires `order_id` in query params')
    // Centra exposes payment info on the order object, not a separate endpoint.
    const order = await this.getOrder(credentials, String(orderId))
    const rawOrder = order.metadata as Omit<RawCentraOrderPayment, 'orderId'>
    if (!rawOrder) return []
    return [transformTransaction({ ...rawOrder, orderId: String(orderId) })]
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // Synthetic id format: `orderId:payment`
    const [orderId] = id.split(':')
    if (!orderId) throw new Error('Invalid transaction id format: expected `orderId:payment`')
    const txs = await this.listTransactions(credentials, { order_id: orderId } as QueryParams)
    const found = txs.find((t) => t.id === id) ?? txs[0]
    if (!found) throw new Error(`Centra transaction not found: ${id}`)
    return found
  }
}
