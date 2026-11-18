import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  reportUpstreamPage,
  simpleApiKey,
} from '@opensteward/shared'
/**
 * Coupang WING API adapter for the ecommerce vertical.
 *
 * Coupang is South Korea's dominant marketplace, holding approximately 70%
 * of the domestic ecommerce market. Often described as the "Amazon of Korea",
 * it operates Rocket Delivery (same-day / next-day logistics) and a large
 * third-party marketplace (WING).
 *
 * Slug: `coupang`
 *
 * ── AUTH MODEL ──────────────────────────────────────────────────────────────
 *
 * Coupang uses long-lived API keys (no OAuth flow). Every request is signed
 * via a custom Authorization header:
 *
 *   CEA algorithm=HmacSHA256, access-key={key}, signed-date={yyMMdd'T'HHmmss'Z'}, signature={sig}
 *
 * The signature covers: signed-date + METHOD + path + the query string as sent.
 * See `auth.ts` for the full signing implementation.
 *
 * Credentials layout:
 *   - credentials.accessToken         Coupang access key
 *   - credentials.extra.secretKey     Coupang vendor secret key
 *   - credentials.extra.vendorId      Coupang vendor ID
 *
 * ── COVERAGE ─────────────────────────────────────────────────────────────────
 *
 *   Products:     listProducts, getProduct, createProduct, updateProduct, deleteProduct
 *   Orders:       listOrders (needs updated_after), getOrder, cancelOrder
 *                 A canonical order is one order sheet (shipment box).
 *   Inventory:    listInventoryLevels, getInventoryLevel, setInventoryLevel
 *   Fulfillments: listFulfillments (per order), getFulfillment
 *   Refunds:      listRefunds, getRefund
 *   Locations:    listLocations, getLocation
 *   Discounts:    listDiscounts, getDiscount
 *
 * Refused with 501 NOT_SUPPORTED:
 *   listCustomers / getCustomer: Coupang documents no customer or buyer API.
 *
 * Omitted — registry returns HTTP 501:
 *   Variants (5): Coupang items are managed inside seller products; no
 *     separate variant CRUD API.
 *   adjustInventoryLevel (1): Coupang only supports absolute stock setting.
 *   createCustomer/updateCustomer/deleteCustomer (3): no customer API.
 *   createOrder/updateOrder (2): Buyers create orders.
 *   createFulfillment/updateFulfillment/cancelFulfillment (3): Coupang-managed.
 *   createDiscount/updateDiscount/deleteDiscount (3): Coupon lifecycle requires
 *     a pre-existing WING budget contract; write operations not implemented.
 *   createRefund (1): Returns are initiated by buyers through Coupang's portal.
 *   createTransaction (1): Transactions are settled by Coupang automatically.
 *   Transactions (2): listTransactions/getTransaction — Coupang settlement API
 *     returns monthly aggregate summaries (no per-order transaction records).
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: collection — No seller-managed product collection concept in WING.
 * Unavailable: transaction — Settlement API returns monthly aggregates only; no per-order transaction records.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Order } from '../../schema/order'
import type { Customer } from '../../schema/customer'
import type { InventoryLevel } from '../../schema/inventory'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Location } from '../../schema/location'
import type { Discount } from '../../schema/discount'

import { CoupangClient } from './client'
import {
  COUPON_GET_PATH,
  COUPON_LIST_PATH,
  COUPON_STATUSES,
  DEFAULT_PAGE_SIZE,
  INVENTORY_SET_PATH,
  ORDERSHEET_GET_PATH,
  ORDERSHEET_LIST_PATH,
  ORDERSHEET_MAX_PAGE_SIZE,
  ORDERSHEET_MAX_WINDOW_DAYS,
  ORDERSHEET_STATUSES,
  ORDERSHEET_UTC_OFFSET_HOURS,
  PRODUCT_CREATE_PATH,
  PRODUCT_DELETE_PATH,
  PRODUCT_GET_PATH,
  PRODUCT_LIST_MAX_PAGE_SIZE,
  PRODUCT_LIST_PATH,
  SHIPPING_PLACE_MAX_PAGE_SIZE,
  SHIPPING_PLACE_PATH,
  VENDOR_ITEM_INVENTORY_PATH,
} from './constants'
import { transformProduct, untransformProduct, type RawCoupangProduct } from './transform/product'
import { transformOrder, type RawCoupangOrder } from './transform/order'
import {
  transformInventoryLevel,
  buildStockUpdateBody,
  type RawCoupangStockResponse,
} from './transform/inventory'
import { hasShipped, transformFulfillment } from './transform/fulfillment'
import { transformRefund, type RawCoupangReturnRequest } from './transform/refund'
import { transformLocation, type RawCoupangShippingPlace } from './transform/location'
import { transformDiscount, type RawCoupangCoupon } from './transform/discount'

// ── Response envelope types ───────────────────────────────────────────────────

/**
 * Documented response of the seller-product list: `data` IS the product array
 * and `nextToken` sits at the top level, "Null string if the next page is
 * unavailable" (https://developers.coupang.com/en/api/products/product-list-paging-query).
 */
interface CoupangProductListEnvelope {
  code?: string
  message?: string
  nextToken?: string | null
  data?: RawCoupangProduct[]
}

/**
 * GET seller-products/{sellerProductId}: `data.outboundShippingPlaceCode` and
 * `data.items[].vendorItemId` ("This value will be null if item is temporarily
 * saved") (https://developers.coupang.com/en/api/products/querying-product).
 */
interface CoupangProductDetailEnvelope {
  data?: RawCoupangProduct & { outboundShippingPlaceCode?: number | null }
}

/**
 * PO list (paging by day): `data` is the order sheets, and the top-level
 * `nextToken` "will return null if the current page is the last page".
 */
interface CoupangOrderSheetListEnvelope {
  code?: number
  message?: string
  data?: RawCoupangOrder[]
  nextToken?: string | null
}

/** Single PO query (shipmentBoxId): `data` is one order sheet object. */
interface CoupangOrderSheetEnvelope {
  code?: number
  message?: string
  data?: RawCoupangOrder | null
}

interface CoupangStockEnvelope {
  code?: string
  message?: string
  data?: RawCoupangStockResponse
}

interface CoupangMutationEnvelope {
  code?: string
  message?: string
  data?: Record<string, unknown>
}

interface CoupangReturnRequestListEnvelope {
  data?: RawCoupangReturnRequest[]
  nextToken?: string
}

interface CoupangReturnRequestDetailEnvelope {
  data?: RawCoupangReturnRequest
}

interface CoupangPagination {
  currentPage?: number
  totalPages?: number
  totalElements?: number
  countPerPage?: number
}

/** Shipping locations: `{ content[], pagination{currentPage, totalPages, totalElements, countPerPage} }`. */
interface CoupangShippingPlaceListEnvelope {
  content?: RawCoupangShippingPlace[]
  pagination?: CoupangPagination
}

/**
 * Coupon list: `data{success, content[], Pagination[]}`. The field table
 * names `Pagination` as object[], and the response example shows
 * `"pagination": {...}`, an object; see {@link couponPagination}.
 */
interface CoupangCouponListEnvelope {
  code?: number
  message?: string
  data?: {
    success?: boolean
    content?: RawCoupangCoupon[]
    Pagination?: CoupangPagination[]
    pagination?: CoupangPagination | null
  }
}

/** One coupon: `data{success, content}` with `content` one object. */
interface CoupangCouponDetailEnvelope {
  data?: { success?: boolean; content?: RawCoupangCoupon | null }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

/** The caller's 1-based page: a missing, 0, negative or non-finite page is page 1. */
function pageOf(params: QueryParams): number {
  const p = params.page
  return typeof p === 'number' && Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1
}

/** The caller's page size, as pageByRows reads it. */
function limitOf(params: QueryParams): number {
  const l = params.limit
  return typeof l === 'number' && Number.isFinite(l) && l >= 1 ? Math.floor(l) : DEFAULT_PAGE_SIZE
}

const DAY_MS = 86_400_000
const MARKET_OFFSET_MS = ORDERSHEET_UTC_OFFSET_HOURS * 3_600_000

/** Days since 1970-01-01 on the market's calendar (UTC+9 for South Korea). */
export function marketDay(at: Date): number {
  return Math.floor((at.getTime() + MARKET_OFFSET_MS) / DAY_MS)
}

/**
 * A market day as the documented date parameter, "yyyy-mm-dd%2B0X:00"
 * (sent as `yyyy-mm-dd+09:00`, which the query serialiser encodes as `%2B`).
 */
export function marketDate(day: number): string {
  const offset = String(ORDERSHEET_UTC_OFFSET_HOURS).padStart(2, '0')
  return `${new Date(day * DAY_MS).toISOString().slice(0, 10)}+${offset}:00`
}

/**
 * The PO list's windows are fixed blocks of {@link ORDERSHEET_MAX_WINDOW_DAYS}
 * market days counted from the epoch, so a block's dates never depend on the
 * day a walk starts. Block `b` covers days [b × 31, b × 31 + 30]: from and to
 * are 30 days apart, under "endTime-startTime range should less than31".
 */
function windowBlock(day: number): number {
  return Math.floor(day / ORDERSHEET_MAX_WINDOW_DAYS)
}

/** Position in the order-sheet walk: window block, status index, nextToken within them. */
interface OrderSheetCursor {
  b: number
  s: number
  t?: string
}

/** Position in the inventory walk: product-list nextToken, product index in that page. */
interface InventoryCursor {
  t?: string
  i: number
}

/** Position in the coupon walk: status index, page number within that status. */
interface CouponCursor {
  s: number
  p: number
}

/**
 * The coupon list's paging object. The field table documents
 * "Pagination | object[] | Paging" and the response example on the same page
 * shows `"pagination": { "currentPage": 1, ... }`; both are first-party, so
 * both are read. Neither present is an error: nothing else says where the
 * list ends.
 */
function couponPagination(data: NonNullable<CoupangCouponListEnvelope['data']>): CoupangPagination {
  if (Array.isArray(data.Pagination) && data.Pagination[0]) return data.Pagination[0]
  if (data.pagination && typeof data.pagination === 'object') return data.pagination
  throw new Error('Coupang coupon list response has no Pagination: cannot tell where it ends')
}

// ── Adapter ───────────────────────────────────────────────────────────────────
const SIMPLE_API_KEY_FORM = simpleApiKey()

export class CoupangAdapter implements EcommerceAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'coupang'
  readonly version = '0.1.0'

  // ── Auth ─────────────────────────────────────────────────────────────────────
  // Coupang uses long-lived API keys rather than OAuth. These methods throw
  // descriptive errors to guide integrators toward the correct credential setup.

  getAuthUrl(_state: string): string {
    throw new Error(
      'CoupangAdapter: Coupang does not use OAuth. Obtain API credentials ' +
        '(accessKey + secretKey + vendorId) from the WING seller portal and POST ' +
        'them directly to the /v1/connections endpoint.',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'CoupangAdapter: Coupang does not use OAuth authorization codes. ' +
        'Supply long-lived WING API credentials instead.',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // WING API keys do not expire — return them as-is.
    return credentials
  }

  private vendorIdFor(credentials: Credentials): string {
    const vendorId = credentials.extra?.['vendorId'] as string | undefined
    if (!vendorId) {
      throw new Error(
        'CoupangAdapter requires credentials.extra.vendorId — ' +
          'configure it via the connections endpoint.',
      )
    }
    return vendorId
  }

  // ── Products ────────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = new CoupangClient(credentials)
    const vendorId = this.vendorIdFor(credentials)
    // "Default: 10, Max.:100" for maxPerPage.
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, PRODUCT_LIST_MAX_PAGE_SIZE)

    // nextToken: "Not needed, or enter 1, to call the 1st page". The response's
    // top-level nextToken is a "Null string if the next page is unavailable".
    const fetch = async (
      cursor: string | undefined,
    ): Promise<{ items: RawCoupangProduct[]; next?: string }> => {
      const res = await client.get<CoupangProductListEnvelope>(PRODUCT_LIST_PATH, {
        vendorId,
        maxPerPage: pageSize,
        nextToken: cursor ?? '1',
      })
      const next = res.nextToken ? res.nextToken : undefined
      return { items: res.data ?? [], next }
    }

    const explicit = params['nextToken'] as string | undefined
    if (explicit) {
      const res = await fetch(explicit)
      reportUpstreamPage(params, { hasMore: res.next !== undefined, pageSize })
      return res.items.map(transformProduct)
    }

    const key = cursorPagerKey(connectionScope(vendorId, credentials), 'products', {
      limit: pageSize,
    })
    const { items, hasMore } = await pageByCursor(key, params.page, fetch)
    reportUpstreamPage(params, { hasMore, pageSize })
    return items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = new CoupangClient(credentials)
    const path = PRODUCT_GET_PATH.replace(':productId', id)
    const res = await client.get<CoupangProductDetailEnvelope>(path)
    if (!res.data) {
      throw new Error(`CoupangAdapter getProduct: no product found for id '${id}'`)
    }
    return transformProduct(res.data)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = new CoupangClient(credentials)
    const vendorId = this.vendorIdFor(credentials)
    const body = { ...untransformProduct(data), vendorId }
    const res = await client.post<CoupangMutationEnvelope>(PRODUCT_CREATE_PATH, body)
    if (res.code && res.code !== '200' && res.code !== 'SUCCESS') {
      throw new Error(`CoupangAdapter createProduct failed: ${res.code} — ${res.message}`)
    }
    const productId = res.data?.['sellerProductId'] as number | undefined
    if (!productId) {
      throw new Error('CoupangAdapter createProduct: response did not include sellerProductId')
    }
    return this.getProduct(credentials, String(productId))
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = new CoupangClient(credentials)
    const path = PRODUCT_GET_PATH.replace(':productId', id)
    const body = untransformProduct(data)
    const res = await client.put<CoupangMutationEnvelope>(path, body)
    if (res.code && res.code !== '200' && res.code !== 'SUCCESS') {
      throw new Error(`CoupangAdapter updateProduct failed: ${res.code} — ${res.message}`)
    }
    return this.getProduct(credentials, id)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    const client = new CoupangClient(credentials)
    const path = PRODUCT_DELETE_PATH.replace(':productId', id)
    const res = await client.delete<CoupangMutationEnvelope>(path)
    if (res.code && res.code !== '200' && res.code !== 'SUCCESS') {
      throw new Error(`CoupangAdapter deleteProduct failed: ${res.code} — ${res.message}`)
    }
  }

  // ── Orders (order sheets) ─────────────────────────────────────────────────────

  /**
   * GET /v2/providers/openapi/apis/api/v5/vendors/{vendorId}/ordersheets, the
   * PO list paging by day (https://developers.coupang.com/en/api/shipments/po-list-query-paging-by-day).
   *
   * `createdAtFrom*`, `createdAtTo*` ("You can query up to 31 days") and
   * `status*` are all required, and the docs name no retention limit to start
   * an unfiltered walk from. So an unfiltered call is refused, and a call with
   * `updatedAfter` walks the market days from today back to that day in fixed
   * 31-day blocks, newest first, and every documented status within each
   * block, following each chain's `nextToken`. The window filters on the
   * order date, the only date the list takes.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    if (!(params.updatedAfter instanceof Date) || Number.isNaN(params.updatedAfter.getTime())) {
      throw notSupported(
        'Coupang cannot list orders without a date window: GET .../v5/vendors/{vendorId}/ordersheets ' +
          'requires createdAtFrom and createdAtTo ("You can query up to 31 days") and documents no ' +
          'retention limit to start from. Pass updated_after.',
      )
    }
    const client = new CoupangClient(credentials)
    const vendorId = this.vendorIdFor(credentials)
    const path = ORDERSHEET_LIST_PATH.replace(':vendorId', encodeURIComponent(vendorId))

    const firstDay = marketDay(params.updatedAfter)
    const lastDay = marketDay(new Date())
    if (firstDay > lastDay) {
      reportUpstreamPage(params, { hasMore: false })
      return []
    }
    const newestBlock = windowBlock(lastDay)
    const oldestBlock = windowBlock(firstDay)

    const fetch = async (
      cursor: OrderSheetCursor | undefined,
    ): Promise<{ items: Order[]; next?: OrderSheetCursor }> => {
      const c = cursor ?? { b: newestBlock, s: 0 }
      const from = Math.max(c.b * ORDERSHEET_MAX_WINDOW_DAYS, firstDay)
      const to = Math.min(
        c.b * ORDERSHEET_MAX_WINDOW_DAYS + ORDERSHEET_MAX_WINDOW_DAYS - 1,
        lastDay,
      )
      const query: Record<string, unknown> = {
        createdAtFrom: marketDate(from),
        createdAtTo: marketDate(to),
        status: ORDERSHEET_STATUSES[c.s],
        maxPerPage: ORDERSHEET_MAX_PAGE_SIZE,
      }
      // "This value is not necessary for querying the first page."
      if (c.t !== undefined) query['nextToken'] = c.t
      const res = await client.get<CoupangOrderSheetListEnvelope>(path, query)
      const items = (res.data ?? []).map(transformOrder)
      let next: OrderSheetCursor | undefined
      if (res.nextToken) next = { b: c.b, s: c.s, t: res.nextToken }
      else if (c.s + 1 < ORDERSHEET_STATUSES.length) next = { b: c.b, s: c.s + 1 }
      else if (c.b - 1 >= oldestBlock) next = { b: c.b - 1, s: 0 }
      return { items, next }
    }

    const key = cursorPagerKey(connectionScope(vendorId, credentials), 'ordersheets', {
      firstDay,
      lastDay,
      maxPerPage: ORDERSHEET_MAX_PAGE_SIZE,
    })
    const { items } = await pageByRows(key, params, fetch)
    return items
  }

  /** GET .../v5/vendors/{vendorId}/ordersheets/{shipmentBoxId}: the id listOrders returns. */
  private async getOrderSheet(credentials: Credentials, id: string): Promise<RawCoupangOrder> {
    const client = new CoupangClient(credentials)
    const vendorId = this.vendorIdFor(credentials)
    const path = ORDERSHEET_GET_PATH.replace(':vendorId', encodeURIComponent(vendorId)).replace(
      ':shipmentBoxId',
      encodeURIComponent(id),
    )
    const res = await client.get<CoupangOrderSheetEnvelope>(path)
    if (!res.data) throw notFound(`CoupangAdapter: no order sheet found for shipmentBoxId '${id}'`)
    return res.data
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    return transformOrder(await this.getOrderSheet(credentials, id))
  }

  /**
   * Refused. The old call, POST /v2/providers/seller_api/apis/api/v1/order-items/{orderItemId}/cancel,
   * is undocumented, and the documented order sheet's orderItems[] carry no
   * orderItemId, so it would post nothing and report success. The documented
   * call is POST /v2/providers/openapi/apis/api/v5/vendors/{vendorId}/orders/{orderId}/cancel
   * (https://developers.coupang.com/en/api/shipments/cancel-an-order); it is
   * not implemented here.
   */
  async cancelOrder(
    _credentials: Credentials,
    _id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    throw notSupported(
      'Coupang order cancellation is not implemented: the documented cancel call is POST ' +
        '/v2/providers/openapi/apis/api/v5/vendors/{vendorId}/orders/{orderId}/cancel, and the ' +
        'previous order-item path was undocumented.',
    )
  }

  // ── Customers ────────────────────────────────────────────────────────────────

  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported(
      'Coupang cannot list customers: the API documents no customer or buyer resource, and an ' +
        'order sheet carries only orderer{name, email, safeNumber, ordererNumber}, with email ' +
        'documented as "non-use/empty value("")", so there is no buyer id to list by.',
    )
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported(
      'Coupang cannot read a customer: the API documents no customer or buyer resource.',
    )
  }

  // ── Inventory ────────────────────────────────────────────────────────────────

  /**
   * Stock is per option (vendorItemId), read one at a time from GET
   * .../marketplace/vendor-items/{vendorItemId}/inventories. The options come
   * from each product's detail (GET .../seller-products/{sellerProductId},
   * `data.items[].vendorItemId`), because the product list rows carry no
   * items, and the products from the product list's `nextToken` chain.
   *
   * One upstream "page" for pageByRows is one product's levels, so a caller
   * page costs a product-list read plus one detail read and one stock read
   * per product it spans, not a whole list page of 100 products.
   */
  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const client = new CoupangClient(credentials)
    const vendorId = this.vendorIdFor(credentials)
    const listPages = new Map<string, { rows: RawCoupangProduct[]; next?: string }>()

    const productPage = async (token: string | undefined) => {
      const k = token ?? ''
      const hit = listPages.get(k)
      if (hit) return hit
      const res = await client.get<CoupangProductListEnvelope>(PRODUCT_LIST_PATH, {
        vendorId,
        maxPerPage: PRODUCT_LIST_MAX_PAGE_SIZE,
        nextToken: token ?? '1',
      })
      const page = { rows: res.data ?? [], next: res.nextToken ? res.nextToken : undefined }
      listPages.set(k, page)
      return page
    }

    const fetch = async (
      cursor: InventoryCursor | undefined,
    ): Promise<{ items: InventoryLevel[]; next?: InventoryCursor }> => {
      const c = cursor ?? { i: 0 }
      const page = await productPage(c.t)
      const next: InventoryCursor | undefined =
        c.i + 1 < page.rows.length
          ? { t: c.t, i: c.i + 1 }
          : page.next !== undefined
            ? { t: page.next, i: 0 }
            : undefined
      const product = page.rows[c.i]
      if (!product) return { items: [], next }
      return { items: await this.levelsOfProduct(client, product), next }
    }

    const key = cursorPagerKey(connectionScope(vendorId, credentials), 'inventory-levels', {
      maxPerPage: PRODUCT_LIST_MAX_PAGE_SIZE,
    })
    const { items } = await pageByRows(key, params, fetch)
    return items
  }

  /** Every approved option's stock for one product-list row. */
  private async levelsOfProduct(
    client: CoupangClient,
    product: RawCoupangProduct,
  ): Promise<InventoryLevel[]> {
    if (product.sellerProductId == null)
      throw new Error('Coupang product row has no sellerProductId')
    const detail = await client.get<CoupangProductDetailEnvelope>(
      PRODUCT_GET_PATH.replace(':productId', encodeURIComponent(String(product.sellerProductId))),
    )
    const data = detail.data
    if (!data) throw new Error(`Coupang product ${product.sellerProductId} has no detail`)
    // "vendorItemId: This value will be null if item is temporarily saved. It
    // will be displayed after item is approved." Such an option has no stock
    // to read yet.
    const vendorItemIds = (data.items ?? [])
      .map((item) => item.vendorItemId as unknown)
      .flatMap((v) =>
        typeof v === 'number' || (typeof v === 'string' && v !== '') ? [String(v)] : [],
      )
    if (vendorItemIds.length === 0) return []
    if (data.outboundShippingPlaceCode == null) {
      throw new Error(
        `Coupang product ${product.sellerProductId} has no outboundShippingPlaceCode: ` +
          'its stock has no location to report it at',
      )
    }
    const locationId = String(data.outboundShippingPlaceCode)
    const levels: InventoryLevel[] = []
    for (const vendorItemId of vendorItemIds) {
      levels.push(await this.readLevel(client, vendorItemId, locationId))
    }
    return levels
  }

  private async readLevel(
    client: CoupangClient,
    vendorItemId: string,
    locationId: string,
  ): Promise<InventoryLevel> {
    const res = await client.get<CoupangStockEnvelope>(
      VENDOR_ITEM_INVENTORY_PATH.replace(':vendorItemId', encodeURIComponent(vendorItemId)),
    )
    if (!res.data) throw notFound(`CoupangAdapter: no stock for vendorItemId '${vendorItemId}'`)
    return transformInventoryLevel(res.data, vendorItemId, locationId)
  }

  /** `id` is `${vendorItemId}:${locationId}`, as listInventoryLevels returns it. */
  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    const sep = id.indexOf(':')
    const vendorItemId = sep > 0 ? id.slice(0, sep) : ''
    const locationId = sep > 0 ? id.slice(sep + 1) : ''
    if (!vendorItemId || !locationId) {
      throw Object.assign(
        new Error(
          `CoupangAdapter getInventoryLevel: id '${id}' is not '<vendorItemId>:<locationId>'`,
        ),
        { statusCode: 400, code: 'VALIDATION' },
      )
    }
    return this.readLevel(new CoupangClient(credentials), vendorItemId, locationId)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = new CoupangClient(credentials)

    // variantId is expected to be in format `${productId}:${vendorItemId}`
    // or just `${vendorItemId}` — try to find the product ID.
    const parts = data.variantId.split(':')
    let productId: string
    let vendorItemId: string

    if (parts.length >= 2) {
      productId = parts[0]!
      vendorItemId = parts[1]!
    } else {
      // Fall back: search products
      vendorItemId = data.variantId
      const products = await this.listProducts(credentials, {})
      let found = false
      for (const p of products) {
        const raw = p.metadata as unknown as RawCoupangProduct
        if (raw.items?.some((i) => String(i.vendorItemId) === vendorItemId)) {
          productId = p.id
          found = true
          break
        }
      }
      if (!found) {
        throw new Error(
          `CoupangAdapter setInventoryLevel: could not resolve productId for vendorItemId '${vendorItemId}'`,
        )
      }
      productId = productId!
    }

    const stockPath = INVENTORY_SET_PATH.replace(':productId', productId).replace(
      ':vendorItemId',
      vendorItemId,
    )

    const body = buildStockUpdateBody(data.available)
    await client.put<CoupangMutationEnvelope>(stockPath, body)

    // Re-fetch to return the updated level
    return this.getInventoryLevel(credentials, `${vendorItemId}:${data.locationId}`)
  }

  // ── Fulfillments ─────────────────────────────────────────────────────────────

  /**
   * Coupang documents no shipment list. An order sheet carries its own
   * courier, invoice number and shipping dates, so a shipped box is read back
   * one at a time with getFulfillment (the single PO query, GET
   * .../v5/vendors/{vendorId}/ordersheets/{shipmentBoxId}), but nothing lists
   * them.
   */
  async listFulfillments(_credentials: Credentials, _params: QueryParams): Promise<Fulfillment[]> {
    throw notSupported(
      'Coupang cannot list fulfillments: it documents no shipment list, only the shipping ' +
        'fields (deliveryCompanyName, invoiceNumber, inTrasitDateTime, deliveredDate) of one ' +
        'order sheet. Read one with getFulfillment by its shipmentBoxId.',
    )
  }

  /** `id` is the shipmentBoxId of a shipped order sheet (the id listOrders returns). */
  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const sheet = await this.getOrderSheet(credentials, id)
    if (!hasShipped(sheet)) {
      throw notFound(`CoupangAdapter getFulfillment: order sheet '${id}' has not shipped`)
    }
    return transformFulfillment(sheet)
  }

  // ── Refunds (return requests) ─────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const client = new CoupangClient(credentials)
    const vendorId = this.vendorIdFor(credentials)

    // Default to a 7-day lookback when no date range is provided
    const now = new Date()
    const from = params.updatedAfter ?? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const res = await client.get<CoupangReturnRequestListEnvelope>(
      `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/returnRequests`,
      {
        searchType: 'timeFrame',
        createdAtFrom: (from instanceof Date ? from : new Date(from as string))
          .toISOString()
          .slice(0, 16),
        createdAtTo: now.toISOString().slice(0, 16),
        maxPerPage: params.limit ?? DEFAULT_PAGE_SIZE,
      },
    )

    return (res.data ?? []).map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const client = new CoupangClient(credentials)
    const vendorId = this.vendorIdFor(credentials)
    const res = await client.get<CoupangReturnRequestDetailEnvelope>(
      `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/returnRequests/${id}`,
    )
    if (!res.data) {
      throw new Error(`CoupangAdapter getRefund: no return request found for id '${id}'`)
    }
    return transformRefund(res.data)
  }

  // ── Locations (outbound shipping places) ──────────────────────────────────

  /**
   * GET .../marketplace_openapi/apis/api/v2/vendor/shipping-place/outbound:
   * "To query the list of all shipping locations registered: Input pageNum
   * and pageSize only"; pageSize "Default=10, Max=50"
   * (https://developers.coupang.com/en/api/logistics/query-a-shipping-location).
   */
  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const client = new CoupangClient(credentials)
    const limit = limitOf(params)
    const pageSize = Math.min(limit, SHIPPING_PLACE_MAX_PAGE_SIZE)
    const res = await client.get<CoupangShippingPlaceListEnvelope>(SHIPPING_PLACE_PATH, {
      pageNum: pageOf(params),
      pageSize,
    })
    const p = res.pagination
    reportUpstreamPage(params, {
      ...(typeof p?.currentPage === 'number' && typeof p.totalPages === 'number'
        ? {
            hasMore: p.currentPage < p.totalPages,
            currentPage: p.currentPage,
            totalPages: p.totalPages,
          }
        : {}),
      ...(typeof p?.totalElements === 'number' ? { totalCount: p.totalElements } : {}),
      ...(pageSize < limit ? { pageSize } : {}),
    })
    return (res.content ?? []).map(transformLocation)
  }

  /** "To query only the desired shipping locations: Input placeNames or placeCodes". */
  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const client = new CoupangClient(credentials)
    const res = await client.get<CoupangShippingPlaceListEnvelope>(SHIPPING_PLACE_PATH, {
      placeCodes: id,
    })
    const found = (res.content ?? []).find((p) => String(p.outboundShippingPlaceCode) === id)
    if (!found) throw notFound(`CoupangAdapter getLocation: no shipping place found for id '${id}'`)
    return transformLocation(found)
  }

  // ── Discounts (instant-discount coupons) ─────────────────────────────────

  /**
   * GET /v2/providers/fms/apis/api/v2/vendors/{vendorId}/coupons takes
   * `status*` (one of STANDBY, APPLIED, PAUSED, EXPIRED, DETACHED), `page`
   * and `size`. Every status is walked in turn, each by page until
   * `currentPage` reaches `totalPages`. The docs state no maximum for `size`,
   * so it asks for the caller's page size.
   */
  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = new CoupangClient(credentials)
    const vendorId = this.vendorIdFor(credentials)
    const path = COUPON_LIST_PATH.replace(':vendorId', encodeURIComponent(vendorId))
    const size = limitOf(params)

    const fetch = async (
      cursor: CouponCursor | undefined,
    ): Promise<{ items: Discount[]; next?: CouponCursor }> => {
      const c = cursor ?? { s: 0, p: 1 }
      const res = await client.get<CoupangCouponListEnvelope>(path, {
        status: COUPON_STATUSES[c.s],
        page: c.p,
        size,
      })
      if (typeof res.code === 'number' && res.code !== 200) {
        throw new Error(`Coupang coupon list failed: ${res.code} ${res.message ?? ''}`)
      }
      const content = res.data?.content ?? []
      const items = content.map(transformDiscount)
      const nextStatus: CouponCursor | undefined =
        c.s + 1 < COUPON_STATUSES.length ? { s: c.s + 1, p: 1 } : undefined
      // A status with no coupons ends there. Past a page that has rows, only
      // the documented Pagination says whether another page follows.
      if (content.length === 0) return { items, next: nextStatus }
      const pg = couponPagination(res.data!)
      if (typeof pg.currentPage !== 'number' || typeof pg.totalPages !== 'number') {
        throw new Error('Coupang coupon list Pagination has no currentPage/totalPages')
      }
      const next = pg.currentPage < pg.totalPages ? { s: c.s, p: c.p + 1 } : nextStatus
      return { items, next }
    }

    const key = cursorPagerKey(connectionScope(vendorId, credentials), 'coupons', { size })
    const { items } = await pageByRows(key, params, fetch)
    return items
  }

  /** GET .../vendors/{vendorId}/coupon?couponId=: "This API queries info on one coupon". */
  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = new CoupangClient(credentials)
    const vendorId = this.vendorIdFor(credentials)
    const res = await client.get<CoupangCouponDetailEnvelope>(
      COUPON_GET_PATH.replace(':vendorId', encodeURIComponent(vendorId)),
      { couponId: id },
    )
    const coupon = res.data?.content
    if (!coupon) throw notFound(`CoupangAdapter getDiscount: no coupon found for id '${id}'`)
    return transformDiscount(coupon)
  }
}
