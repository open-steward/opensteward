/**
 * Alibaba.com Open Platform adapter for the ecommerce vertical.
 *
 * Every call is a signed request to the REST gateway
 * https://openapi-api.alibaba.com/rest/{api_path} (docId=61), HMAC-SHA256
 * signed (docId=60), on a seller's access token from the
 * openapi-auth.alibaba.com authorization and /auth/token/create (docId=56).
 * API references are the first-party JSON behind openapi.alibaba.com's doc
 * pages: /handler/share/apidoc/getApi.json?cid=…&path=…&methodType=GET/POST.
 *
 *   Products:     list  /alibaba/icbu/product/list (current_page, page_size ≤ 30)
 *                 get   /alibaba/icbu/product/get/v2 (product_id)
 *   Orders:       list  /alibaba/order/list (role=seller, start_page, page_size ≤ 100)
 *                 get   /alibaba/order/get (e_trade_id)
 *   Fulfillments: /order/logistics/query per order, over pages of the order list
 *   Inventory:    /icbu/product/inventory/get per product, over pages of the product list
 *   Collections:  list  /alibaba/icbu/category/get/v2 (first-level categories)
 *                 get   /icbu/product/category/get (cat_id)
 *   Customers:    refused — no buyer list is documented
 *   Locations:    a synthetic default location (unchanged)
 *
 * The write methods this adapter carried named API methods the catalog does
 * not contain and refuse with 501 until they are rebuilt on the documented
 * write APIs.
 */

import {
  DEFAULT_PAGE_LIMIT,
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
  type Credentials,
  type CursorPage,
  type QueryParams,
} from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'

import {
  buildAuthUrl,
  exchangeCode as alibabaExchangeCode,
  refreshCredentials as alibabaRefreshCredentials,
} from './auth'
import { AlibabaClient } from './client'
import {
  INVENTORY_LANGUAGE,
  ORDER_LIST_DEFAULT_PAGE_SIZE,
  ORDER_LIST_MAX_PAGE_SIZE,
  ORDER_ROLE,
  PATH_CATEGORY_GET,
  PATH_CATEGORY_LIST,
  PATH_INVENTORY_GET,
  PATH_LOGISTICS_QUERY,
  PATH_ORDER_GET,
  PATH_ORDER_LIST,
  PATH_PRODUCT_GET,
  PATH_PRODUCT_LIST,
  PLATFORM_SLUG,
  PRODUCT_LIST_MAX_PAGE_SIZE,
} from './constants'
import {
  transformListProduct,
  transformProductInfo,
  type RawAlibabaListProduct,
  type RawAlibabaProductInfo,
} from './transform/product'
import {
  transformOrderDetail,
  transformOrderSummary,
  type RawAlibabaOrderDetail,
  type RawAlibabaOrderSummary,
} from './transform/order'
import {
  parseFulfillmentId,
  transformFulfillment,
  transformFulfillments,
  type RawAlibabaLogistics,
} from './transform/fulfillment'
import { transformInventoryLevel, type RawAlibabaInventoryRow } from './transform/inventory'
import {
  transformCategoryNode,
  transformCategoryRow,
  type RawAlibabaCategoryNode,
  type RawAlibabaCategoryRow,
} from './transform/collection'
import { getDefaultLocation, listDefaultLocations } from './transform/location'

// ── Config ────────────────────────────────────────────────────────────────────

export interface AlibabaAdapterConfig {
  /** Alibaba application key. May also be supplied via credentials.extra.appKey. */
  appKey?: string
  /** Alibaba application secret. May also be supplied via credentials.extra.appSecret. */
  appSecret?: string
  /** OAuth redirect URI registered for the application. */
  redirectUri?: string
}

// ── Documented response bodies ───────────────────────────────────────────────

/** alibaba.icbu.product.list: everything under `result`. */
interface ProductListBody {
  result?: {
    curr_page?: number | string
    total_item?: number | string
    page_size?: number | string
    error_code?: string
    error_msg?: string
    products?: RawAlibabaListProduct[]
  }
}

/** Get Product Information: `product_info`, `success`, `message`, `msg_code`. */
interface ProductGetBody {
  product_info?: RawAlibabaProductInfo
  success?: boolean | string
  message?: string
  msg_code?: string
}

/** alibaba.icbu.product.inventory.get: everything under `result`. */
interface InventoryGetBody {
  result?: {
    data_list?: RawAlibabaInventoryRow[]
    success?: boolean | string
    message_info?: string
    msg_code?: string
  }
}

/** alibaba order list: everything under `value`. */
interface OrderListBody {
  value?: { order_list?: RawAlibabaOrderSummary[]; total_count?: number | string }
}

/** alibaba order get: everything under `value`. */
interface OrderGetBody {
  value?: RawAlibabaOrderDetail
}

/** order logistics info query api: everything under `value`. */
interface LogisticsBody {
  value?: RawAlibabaLogistics
}

/** Get Category Information. */
interface CategoryListBody {
  data?: RawAlibabaCategoryRow[]
  success?: boolean | string
  message?: string
  msg_code?: string
}

/** alibaba.icbu.category.get.new: everything under `result`. */
interface CategoryGetBody {
  result?: {
    result?: RawAlibabaCategoryNode
    success?: boolean | string
    response_code?: string
    response_msg?: string
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** The caller's 1-based page. */
function pageOf(params: QueryParams): number {
  const p = params.page
  return typeof p === 'number' && Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1
}

/**
 * The caller's page size (DEFAULT_PAGE_LIMIT when unset), clamped to `max`.
 * The size sent is known before the request, so a clamp below the ask, the
 * default ask included, is reported here.
 */
function sizeOf(params: QueryParams, max: number): number {
  const l = params.limit
  const asked =
    typeof l === 'number' && Number.isFinite(l) && l >= 1 ? Math.floor(l) : DEFAULT_PAGE_LIMIT
  const size = Math.min(asked, max)
  if (size < asked) reportUpstreamPage(params, { pageSize: size })
  return size
}

function num(v: number | string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/** The documented `success` flag: a boolean, or "true"/"false" in the examples. */
function failed(success: boolean | string | undefined): boolean {
  return success === false || success === 'false'
}

/**
 * `modified_date_start` of /alibaba/order/list: "Modify the time starting from
 * the date_str time zone, which is America/Los_Angeles.", with date_str
 * "format is (yyyy-MM-dd HH:mm:ss)".
 */
export function losAngelesDateStr(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class AlibabaAdapter implements EcommerceAdapter {
  readonly platform = PLATFORM_SLUG
  readonly version = '0.2.0'

  private configAppKey: string | undefined
  private configAppSecret: string | undefined
  private configRedirectUri: string

  constructor(config: AlibabaAdapterConfig = {}) {
    this.configAppKey = config.appKey
    this.configAppSecret = config.appSecret
    this.configRedirectUri = config.redirectUri ?? ''
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    if (!this.configAppKey) {
      throw new Error('Alibaba adapter: appKey is required to build the auth URL.')
    }
    return buildAuthUrl(this.configAppKey, this.configRedirectUri, state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.configAppKey || !this.configAppSecret) {
      throw new Error('Alibaba adapter: appKey and appSecret are required for code exchange.')
    }
    return alibabaExchangeCode(code, this.configAppKey, this.configAppSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return alibabaRefreshCredentials(credentials, {
      appKey: this.configAppKey,
      appSecret: this.configAppSecret,
    })
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private appKeyFor(credentials: Credentials): string | undefined {
    return (credentials.extra?.['appKey'] as string | undefined) ?? this.configAppKey
  }

  private clientFor(credentials: Credentials): AlibabaClient {
    const appKey = this.appKeyFor(credentials)
    const appSecret =
      (credentials.extra?.['appSecret'] as string | undefined) ?? this.configAppSecret
    if (!appKey || !appSecret) {
      throw new Error(
        'Alibaba adapter is missing appKey/appSecret — configure them under adapters.alibaba, ' +
          'or supply them via credentials.extra.',
      )
    }
    return new AlibabaClient({ ...credentials, extra: { ...credentials.extra, appKey, appSecret } })
  }

  /** Row-pager scope for this connection. */
  private scopeFor(credentials: Credentials): string {
    return connectionScope(`alibaba:${this.appKeyFor(credentials) ?? ''}`, credentials)
  }

  /** One page of alibaba.icbu.product.list. */
  private async productPage(
    client: AlibabaClient,
    currentPage: number,
    pageSize: number,
  ): Promise<{ products: RawAlibabaListProduct[]; total: number }> {
    const body = await client.call<ProductListBody>(PATH_PRODUCT_LIST, {
      current_page: currentPage,
      page_size: pageSize,
    })
    const result = body.result ?? {}
    // error_code / error_msg carry no documented failure semantics: the
    // documented example response fills them ("system error", "please try
    // again later") next to a normal products[] row. A failed call is the
    // gateway `code` the client already checks. What a page cannot do without
    // is total_item ("the total count of the result", required), which ends
    // the walk; without it the page is refused, naming whatever error_* came.
    const total = num(result.total_item)
    if (total === undefined) {
      throw new Error(
        `Alibaba ${PATH_PRODUCT_LIST}: result has no total_item ` +
          `(error_code ${result.error_code ?? '-'}, error_msg ${result.error_msg ?? '-'})`,
      )
    }
    return { products: result.products ?? [], total }
  }

  /** One page of /alibaba/order/list; `startPage` is 0-based. */
  private async orderPage(
    client: AlibabaClient,
    startPage: number,
    pageSize: number,
    updatedAfter: Date | undefined,
  ): Promise<{ orders: RawAlibabaOrderSummary[]; total: number | undefined }> {
    const body = await client.call<OrderListBody>(PATH_ORDER_LIST, {
      role: ORDER_ROLE,
      start_page: startPage,
      page_size: pageSize,
      ...(updatedAfter
        ? { modified_date_start: { date_str: losAngelesDateStr(updatedAfter) } }
        : {}),
    })
    return { orders: body.value?.order_list ?? [], total: num(body.value?.total_count) }
  }

  private async inventoryRows(
    client: AlibabaClient,
    productId: string,
  ): Promise<RawAlibabaInventoryRow[]> {
    const body = await client.call<InventoryGetBody>(PATH_INVENTORY_GET, {
      product_id: productId,
      language: INVENTORY_LANGUAGE,
    })
    const result = body.result ?? {}
    if (failed(result.success)) {
      throw new Error(
        `Alibaba ${PATH_INVENTORY_GET} failed for product ${productId}: ${result.msg_code ?? ''} ${result.message_info ?? ''}`.trim(),
      )
    }
    return result.data_list ?? []
  }

  private async logistics(client: AlibabaClient, tradeId: string): Promise<RawAlibabaLogistics> {
    const body = await client.call<LogisticsBody>(PATH_LOGISTICS_QUERY, {
      trade_id: tradeId,
      // "If logistic_order is provided, it will query the express shipping tracking number."
      data_select: 'logistic_order',
    })
    return body.value ?? {}
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const page = pageOf(params)
    const size = sizeOf(params, PRODUCT_LIST_MAX_PAGE_SIZE)
    const { products, total } = await this.productPage(client, page, size)
    reportUpstreamPage(params, { totalCount: total, hasMore: page * size < total })
    return products.map(transformListProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const body = await client.call<ProductGetBody>(PATH_PRODUCT_GET, { product_id: id })
    if (failed(body.success) || !body.product_info) {
      throw new Error(
        `Alibaba getProduct ${id}: ${body.msg_code ?? 'no product_info'} ${body.message ?? ''}`.trim(),
      )
    }
    return transformProductInfo(body.product_info)
  }

  async createProduct(_credentials: Credentials, _data: Partial<Product>): Promise<Product> {
    throw notSupported(
      'Alibaba createProduct is not supported: it called alibaba.icbu.product.add, which the ' +
        'Open Platform API catalog does not contain.',
    )
  }

  async updateProduct(
    _credentials: Credentials,
    _id: string,
    _data: Partial<Product>,
  ): Promise<Product> {
    throw notSupported(
      'Alibaba updateProduct is not supported: it called alibaba.icbu.product.edit, which the ' +
        'Open Platform API catalog does not contain.',
    )
  }

  async deleteProduct(_credentials: Credentials, _id: string): Promise<void> {
    throw notSupported(
      'Alibaba deleteProduct is not supported: it called alibaba.icbu.product.edit, which the ' +
        'Open Platform API catalog does not contain.',
    )
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const page = pageOf(params)
    const size = sizeOf(params, ORDER_LIST_MAX_PAGE_SIZE)
    // `start_page`: "Default Value:0" — the first page is 0.
    const { orders, total } = await this.orderPage(client, page - 1, size, params.updatedAfter)
    if (total !== undefined) {
      reportUpstreamPage(params, { totalCount: total, hasMore: page * size < total })
    }
    return orders.map(transformOrderSummary)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const body = await client.call<OrderGetBody>(PATH_ORDER_GET, { e_trade_id: id })
    if (!body.value) throw new Error(`Alibaba getOrder ${id}: response has no value`)
    return transformOrderDetail(body.value)
  }

  async cancelOrder(
    _credentials: Credentials,
    _id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    throw notSupported(
      'Alibaba cancelOrder is not supported: it called alibaba.icbu.order.cancel, which the ' +
        'Open Platform API catalog does not contain.',
    )
  }

  // ── Customers ──────────────────────────────────────────────────────────────

  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported(
      'Alibaba cannot list customers: the Open Platform documents no buyer list, and the order ' +
        'list rows carry only "trade_id", "trade_status", "create_date" and "modify_date".',
    )
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported(
      'Alibaba cannot get a customer: the Open Platform documents no buyer lookup; buyer data ' +
        'appears only inside one order ("alibaba order get").',
    )
  }

  // ── Inventory ──────────────────────────────────────────────────────────────

  /**
   * Every SKU's stock, per inventory code: pages of the product list (30, the
   * documented maximum), each product's rows from inventory.get, cut into the
   * caller's pages by the row pager.
   */
  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const client = this.clientFor(credentials)
    const key = cursorPagerKey(this.scopeFor(credentials), 'inventory', {
      upstreamPageSize: PRODUCT_LIST_MAX_PAGE_SIZE,
    })
    const fetch = async (
      cursor: number | undefined,
    ): Promise<CursorPage<InventoryLevel, number>> => {
      const current = cursor ?? 1
      const { products, total } = await this.productPage(
        client,
        current,
        PRODUCT_LIST_MAX_PAGE_SIZE,
      )
      const items: InventoryLevel[] = []
      for (const p of products) {
        if (p.id == null || p.id === '') throw new Error('Alibaba product.list row has no id')
        const productId = String(p.id)
        for (const row of await this.inventoryRows(client, productId)) {
          items.push(transformInventoryLevel(row, productId))
        }
      }
      const more = current * PRODUCT_LIST_MAX_PAGE_SIZE < total
      return { items, next: more ? current + 1 : null }
    }
    const { items } = await pageByRows<InventoryLevel, number>(key, params, fetch)
    return items
  }

  /** `id` is `${sku_id}:${inventory_code}`. */
  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    const at = id.indexOf(':')
    if (at <= 0 || at === id.length - 1) {
      throw new Error(
        `Alibaba getInventoryLevel: id must be "<sku_id>:<inventory_code>", got '${id}'`,
      )
    }
    const skuId = id.slice(0, at)
    const code = id.slice(at + 1)
    const client = this.clientFor(credentials)
    // "get the product information by product id or sku id"
    const body = await client.call<ProductGetBody>(PATH_PRODUCT_GET, { sku_id: skuId })
    const productId = body.product_info?.basic_info?.product_id
    if (failed(body.success) || productId == null || productId === '') {
      throw new Error(`Alibaba getInventoryLevel: no product found for sku_id '${skuId}'`)
    }
    const rows = await this.inventoryRows(client, String(productId))
    const row = rows.find((r) => String(r.sku_id) === skuId && r.inventory_code === code)
    if (!row) throw new Error(`Alibaba getInventoryLevel: no inventory row '${id}'`)
    return transformInventoryLevel(row, String(productId))
  }

  async setInventoryLevel(
    _credentials: Credentials,
    _data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    throw notSupported(
      'Alibaba setInventoryLevel is not supported: it called alibaba.icbu.product.stock.update, ' +
        'which the Open Platform API catalog does not contain.',
    )
  }

  // ── Fulfillments ───────────────────────────────────────────────────────────

  /**
   * Every shipment of every order: pages of the order list (10, its documented
   * default size), one logistics query per order, cut into the caller's pages
   * by the row pager.
   */
  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const client = this.clientFor(credentials)
    const updatedAfter = params.updatedAfter
    const key = cursorPagerKey(this.scopeFor(credentials), 'fulfillments', {
      upstreamPageSize: ORDER_LIST_DEFAULT_PAGE_SIZE,
      updatedAfter,
    })
    const fetch = async (cursor: number | undefined): Promise<CursorPage<Fulfillment, number>> => {
      const start = cursor ?? 0
      const { orders, total } = await this.orderPage(
        client,
        start,
        ORDER_LIST_DEFAULT_PAGE_SIZE,
        updatedAfter,
      )
      const items: Fulfillment[] = []
      for (const o of orders) {
        if (!o.trade_id) throw new Error('Alibaba order.list row has no trade_id')
        items.push(...transformFulfillments(o.trade_id, await this.logistics(client, o.trade_id)))
      }
      if (total === undefined && orders.length > 0) {
        throw new Error(`Alibaba ${PATH_ORDER_LIST}: value has no total_count`)
      }
      const more = total !== undefined && (start + 1) * ORDER_LIST_DEFAULT_PAGE_SIZE < total
      return { items, next: more ? start + 1 : null }
    }
    const { items } = await pageByRows<Fulfillment, number>(key, params, fetch)
    return items
  }

  /** `id` is `${trade_id}:${index}` into the order's shipping_order_list. */
  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const parsed = parseFulfillmentId(id)
    if (!parsed) {
      throw new Error(`Alibaba getFulfillment: id must be "<trade_id>:<index>", got '${id}'`)
    }
    const client = this.clientFor(credentials)
    const logistics = await this.logistics(client, parsed.tradeId)
    const shipment = logistics.shipping_order_list?.[parsed.index]
    if (!shipment) throw new Error(`Alibaba getFulfillment: no shipment '${id}'`)
    return transformFulfillment(parsed.tradeId, parsed.index, shipment, logistics)
  }

  // ── Collections (Alibaba categories) ───────────────────────────────────────

  /**
   * The first-level categories: "If the parent_category_id is empty, it means
   * querying the first-level category." The API has no paging, so the whole
   * list is sliced here.
   */
  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const client = this.clientFor(credentials)
    const body = await client.call<CategoryListBody>(PATH_CATEGORY_LIST, {})
    if (failed(body.success)) {
      throw new Error(
        `Alibaba ${PATH_CATEGORY_LIST} failed: ${body.msg_code ?? ''} ${body.message ?? ''}`.trim(),
      )
    }
    return pageLocally((body.data ?? []).map(transformCategoryRow), params)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.clientFor(credentials)
    const body = await client.call<CategoryGetBody>(PATH_CATEGORY_GET, { cat_id: id })
    const node = body.result?.result
    if (failed(body.result?.success) || !node) {
      throw new Error(
        `Alibaba getCollection ${id}: ${body.result?.response_code ?? ''} ${body.result?.response_msg ?? 'no result'}`.trim(),
      )
    }
    return transformCategoryNode(node)
  }

  // ── Locations (synthetic — unchanged) ──────────────────────────────────────

  async listLocations(_credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    return listDefaultLocations()
  }

  async getLocation(_credentials: Credentials, id: string): Promise<Location> {
    const loc = getDefaultLocation()
    if (id !== loc.id) {
      throw new Error(
        `Alibaba getLocation: unknown locationId '${id}'. Only '${loc.id}' is available.`,
      )
    }
    return loc
  }
}
