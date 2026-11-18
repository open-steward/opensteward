/**
 * Dukaan adapter for the ecommerce vertical.
 *
 * Maps Dukaan's Public APIs to the canonical ecommerce resources. Every read
 * method below follows Dukaan's published Postman collection
 * ("Dukaan Public APIs"):
 *   https://documenter.getpostman.com/view/25389466/2s9Yynk3f7
 *
 * Auth is the store authentication token ("Visit web.mydukaan.io and select
 * the settings tab / Click on developer settings, you will find an option to
 * generate a store authentication token"), sent as
 * `authorization: Bearer {store_authentication_token}`. The product
 * endpoints also need the store uuid ("Store uuid: Each store for a seller
 * will have a unique id which is required for certain endpoints ... making
 * this key mandatory"), which the docs say is found "under the same
 * settings"; it is an optional connection field, read from
 * `credentials.extra.storeUuid`.
 *
 * Write methods (create/update/delete/cancel) were not part of the list
 * rebuild and still call paths the collection does not document.
 */

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: fulfillment  — Dukaan Seller REST API has no fulfillment/shipment
//                             endpoint; shipping is handled via third-party plugins
//                             (Shippo, Unicommerce) outside the seller API.
// Unavailable: inventory    — No inventory-level endpoint; stock is embedded in
//                             product/variant objects and cannot be queried or
//                             adjusted independently via the public API.
// Unavailable: location     — No location/warehouse endpoint; multi-location
//                             fulfillment is not exposed in the public seller API.
// Unavailable: refund       — No refund endpoint; refund management is handled
//                             through the seller dashboard UI only.
// Unavailable: transaction  — No transaction/payment endpoint; payment data is
//                             managed by integrated gateways, not the seller API.
// ──────────────────────────────────────────────────────────────────────────────

import {
  connectionScope,
  customForm,
  pageByRows,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Discount } from '../../schema/discount'

import { buildAuthUrl, exchangeCode as dukaanExchangeCode } from './auth'
import {
  DukaanClient,
  type DukaanCountedResponse,
  type DukaanDataResponse,
  type DukaanPagedResponse,
} from './client'
import { DEFAULT_PAGE_SIZE, PRODUCT_MAX_PAGE_SIZE } from './constants'

import {
  transformProductDetail,
  transformProductListRow,
  untransformProduct,
  type RawDukaanProductDetail,
  type RawDukaanProductListRow,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawDukaanCategory,
} from './transform/collection'
import {
  transformAudienceRow,
  transformStoreLead,
  untransformCustomer,
  type RawDukaanAudienceRow,
  type RawDukaanStoreLead,
} from './transform/customer'
import {
  transformOrderDetail,
  transformOrderListRow,
  untransformOrder,
  type RawDukaanOrderDetail,
  type RawDukaanOrderListRow,
} from './transform/order'
import { transformDiscount, untransformDiscount, type RawDukaanCoupon } from './transform/discount'

// ── Config ────────────────────────────────────────────────────────────────────

export interface DukaanAdapterConfig {
  /**
   * Store authentication token generated in the Dukaan dashboard.
   * May be omitted here and provided per-connection via `credentials.accessToken`.
   */
  storeToken?: string
}

/**
 * Connect form: the store authentication token, and the store uuid the
 * product endpoints embed in their path. Both are found in the dashboard's
 * settings ("you will find your seller id, and store uuid also under the
 * same settings").
 */
const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'Store authentication token',
      type: 'password',
      helpText:
        'Dukaan dashboard → Settings → Developer settings → generate an authentication token.',
      required: true,
    },
    {
      name: 'storeUuid',
      label: 'Store uuid',
      type: 'text',
      helpText: 'Shown under the same settings. Required to read products.',
      required: false,
    },
  ],
  async exchange(input) {
    const token = (input?.['apiKey'] ?? '').trim()
    if (!token) throw new Error('Store authentication token is required.')
    const storeUuid = (input?.['storeUuid'] ?? '').trim()
    return storeUuid ? { accessToken: token, extra: { storeUuid } } : { accessToken: token }
  },
})

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** The caller's page size, clamped to `max` when the endpoint documents one. */
function pageSize(params: QueryParams, max = Infinity): number {
  return Math.min(params.limit ?? DEFAULT_PAGE_SIZE, max)
}

/** The caller's 1-based page, as Dukaan's `page` parameter takes it. */
function pageNumber(params: QueryParams, size: number): number {
  return pageOffset(params, size) / size + 1
}

function searchTerm(params: QueryParams): string | undefined {
  return typeof params.search === 'string' && params.search.trim() !== ''
    ? params.search
    : undefined
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class DukaanAdapter implements EcommerceAdapter {
  readonly platform = 'dukaan'
  readonly version = '0.2.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it.
   *  listCustomers refuses it itself: the audience list documents no search. */
  readonly capabilities = { search: true }

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private configToken: string | undefined

  constructor(config: DukaanAdapterConfig = {}) {
    this.configToken = config.storeToken
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Dukaan has no OAuth authorize URL; this points the user at the settings page.
    return buildAuthUrl()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // Throws a descriptive error — see ./auth.ts.
    return dukaanExchangeCode()
  }

  /** Store tokens are long-lived and do not rotate. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): DukaanClient {
    const token =
      credentials.accessToken && credentials.accessToken !== 'api-key'
        ? credentials.accessToken
        : this.configToken

    if (!token) {
      throw new Error(
        'Dukaan adapter is missing the store authentication token. ' +
          'Either set `storeToken` in the adapter config or ' +
          'POST it to /v1/connections with credentials: { accessToken: "<store_token>" }.',
      )
    }
    return new DukaanClient({ ...credentials, accessToken: token })
  }

  /** The store uuid the product paths embed, from the connection only. */
  private storeUuid(credentials: Credentials, what: string): string {
    const raw = credentials.extra?.['storeUuid']
    if (typeof raw === 'string' && raw.trim() !== '') return raw.trim()
    throw notSupported(
      `Dukaan cannot ${what} without the store uuid: the product endpoints embed {store_uuid} ` +
        '("required for certain endpoints to get store specific data"). ' +
        'Reconnect with the store uuid from the Dukaan dashboard settings.',
    )
  }

  /**
   * One page of a list whose envelope carries `next` (null on the last page)
   * and `count`: the category, coupon and audience lists.
   */
  private async nextLinkPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    extra: Record<string, unknown>,
  ): Promise<T[]> {
    const size = pageSize(params)
    const res = await this.clientFor(credentials).get<DukaanPagedResponse<T>>(path, {
      ...extra,
      page: pageNumber(params, size),
      page_size: size,
    })
    const rows = res.results ?? []
    reportUpstreamPage(params, {
      hasMore: res.next != null,
      ...(typeof res.count === 'number' ? { totalCount: res.count } : {}),
    })
    return rows
  }

  // ── Products ──────────────────────────────────────────────────────────────

  /**
   * product_list: GET /api/seller-front/{store_uuid}/product-list/
   *   ?ordering=-created_at&page=1&page_size=30&pop_fields=variants_data
   * `page_size` is "1-99 ( max 99 results allowed per page )". The envelope is
   * `{ status_code, count, results }`, so the end comes from `count`.
   */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const store = this.storeUuid(credentials, 'list products')
    const size = pageSize(params, PRODUCT_MAX_PAGE_SIZE)
    const page = pageNumber(params, size)
    const search = searchTerm(params)
    const res = await this.clientFor(credentials).get<
      DukaanCountedResponse<RawDukaanProductListRow>
    >(`/api/seller-front/${encodeURIComponent(store)}/product-list/`, {
      ordering: '-created_at',
      page,
      page_size: size,
      pop_fields: 'variants_data',
      ...(search ? { search } : {}),
    })
    const rows = res.results ?? []
    const clamped =
      typeof params.limit === 'number' && size < params.limit ? { pageSize: size } : {}
    if (typeof res.count === 'number') {
      reportUpstreamPage(params, {
        totalCount: res.count,
        hasMore: (page - 1) * size + rows.length < res.count,
        ...clamped,
      })
    } else {
      reportUpstreamPage(params, clamped)
    }
    return rows.map(transformProductListRow)
  }

  /** product_details: GET /api/product/seller/{store_uuid}/product/{product_uuid}/v2/ */
  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const store = this.storeUuid(credentials, 'read a product')
    const res = await this.clientFor(credentials).get<DukaanDataResponse<RawDukaanProductDetail>>(
      `/api/product/seller/${encodeURIComponent(store)}/product/${encodeURIComponent(id)}/v2/`,
    )
    return transformProductDetail(res.data)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.clientFor(credentials).post<RawDukaanProductDetail>(
      '/v2/seller/products/',
      untransformProduct(data),
    )
    return transformProductDetail(res)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.clientFor(credentials).patch<RawDukaanProductDetail>(
      `/v2/seller/products/${id}/`,
      untransformProduct(data),
    )
    return transformProductDetail(res)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/v2/seller/products/${id}/`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  /**
   * Variants are the `sku_data` of product_details, whose prices carry no
   * currency; the canonical variant price is Money and needs one.
   */
  async listVariants(_credentials: Credentials, _params: QueryParams): Promise<ProductVariant[]> {
    throw notSupported(
      'Dukaan cannot list variants: variants exist only as `sku_data` inside product_details, ' +
        'whose `selling_price`/`original_price` carry no currency, and a variant price requires one.',
    )
  }

  async getVariant(_credentials: Credentials, _id: string): Promise<ProductVariant> {
    throw notSupported(
      'Dukaan cannot read a variant: variants exist only as `sku_data` inside product_details, ' +
        'whose `selling_price`/`original_price` carry no currency, and a variant price requires one.',
    )
  }

  // ── Collections (categories) ──────────────────────────────────────────────

  /** get_category_list: GET /api/product/seller/product-category/?page=1&page_size=30&v2=true */
  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const search = searchTerm(params)
    const rows = await this.nextLinkPage<RawDukaanCategory>(
      credentials,
      '/api/product/seller/product-category/',
      params,
      { v2: true, ...(search ? { search } : {}) },
    )
    return rows.map(transformCollection)
  }

  /**
   * The collection documents no single-category read: get_category_details is
   * the product list filtered by `category`, not a category record.
   */
  async getCollection(_credentials: Credentials, _id: string): Promise<Collection> {
    throw notSupported(
      'Dukaan cannot read a single category: its docs have no category detail endpoint ' +
        '(get_category_details is the product list filtered by category).',
    )
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const res = await this.clientFor(credentials).post<RawDukaanCategory>(
      '/v2/seller/categories/',
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.clientFor(credentials).patch<RawDukaanCategory>(
      `/v2/seller/categories/${id}/`,
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/v2/seller/categories/${id}/`)
  }

  // ── Customers (audience) ──────────────────────────────────────────────────

  /** get_store_audience_list: GET /api/store/seller/store-buyer/?page=1&page_size=30 */
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    if (searchTerm(params)) {
      throw Object.assign(
        new Error(
          "Dukaan's audience list (get_store_audience_list) documents no search parameter. " +
            'It is refused rather than ignored so an unfiltered page is never mistaken for a filtered one.',
        ),
        { statusCode: 400, code: 'SEARCH_UNSUPPORTED' },
      )
    }
    const rows = await this.nextLinkPage<RawDukaanAudienceRow>(
      credentials,
      '/api/store/seller/store-buyer/',
      params,
      {},
    )
    return rows.map(transformAudienceRow)
  }

  /** get_customer_details: GET /api/campaign/seller/store-lead/v2/store-lead-data/{id}/ */
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.clientFor(credentials).get<DukaanDataResponse<RawDukaanStoreLead>>(
      `/api/campaign/seller/store-lead/v2/store-lead-data/${encodeURIComponent(id)}/`,
    )
    return transformStoreLead(res.data)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const res = await this.clientFor(credentials).post<RawDukaanStoreLead>(
      '/v2/seller/customers/',
      untransformCustomer(data),
    )
    return transformStoreLead(res)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.clientFor(credentials).patch<RawDukaanStoreLead>(
      `/v2/seller/customers/${id}/`,
      untransformCustomer(data),
    )
    return transformStoreLead(res)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  /**
   * get order list: GET /api/seller-front/order-list/?ordering=-created_at&page=1
   *
   * Neither documented order-list request carries a page size, so the upstream
   * page is whatever size Dukaan serves. The caller's pages are cut from those
   * upstream pages by `pageByRows`. The envelope is `{ status_code, count,
   * results }`: the chain ends once the rows seen reach `count`, or on an
   * empty page.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const search = searchTerm(params)
    const client = this.clientFor(credentials)
    const key = connectionScope('dukaan:orders', credentials) + `\u0000${search ?? ''}`
    const { items } = await pageByRows<RawDukaanOrderListRow, string>(
      key,
      params,
      async (cursor) => {
        // Cursor "<page>:<rows before it>"; undefined is page 1.
        const [pageStr, seenStr] = (cursor ?? '1:0').split(':')
        const page = Number(pageStr)
        const seen = Number(seenStr)
        const res = await client.get<DukaanCountedResponse<RawDukaanOrderListRow>>(
          '/api/seller-front/order-list/',
          { ordering: '-created_at', page, ...(search ? { search } : {}) },
        )
        const rows = res.results ?? []
        const total = seen + rows.length
        const more = rows.length > 0 && typeof res.count === 'number' && total < res.count
        return { items: rows, next: more ? `${page + 1}:${total}` : undefined }
      },
    )
    return items.map(transformOrderListRow)
  }

  /**
   * get order data: GET /api/order/seller/{order_uuid}/order/. The collection
   * prints it as "https://api.mydukaan.io/api/order/seller{order_uuid}/order/";
   * the slash is restored as in update_order_status
   * ("https://api.mydukaan.io/api/order/seller/28c60586-.../order/").
   */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.clientFor(credentials).get<DukaanDataResponse<RawDukaanOrderDetail>>(
      `/api/order/seller/${encodeURIComponent(id)}/order/`,
    )
    return transformOrderDetail(res.data)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const res = await this.clientFor(credentials).post<RawDukaanOrderDetail>(
      '/v2/seller/orders/',
      untransformOrder(data),
    )
    return transformOrderDetail(res)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const res = await this.clientFor(credentials).patch<RawDukaanOrderDetail>(
      `/v2/seller/orders/${id}/`,
      untransformOrder(data),
    )
    return transformOrderDetail(res)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const res = await this.clientFor(credentials).post<RawDukaanOrderDetail>(
      `/v2/seller/orders/${id}/cancel/`,
    )
    return transformOrderDetail(res)
  }

  // ── Discounts (coupons) ───────────────────────────────────────────────────

  /** get_discounts: GET /api/coupon/seller/coupon/v2/?page_size=30&page=1&search= */
  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const search = searchTerm(params)
    const rows = await this.nextLinkPage<RawDukaanCoupon>(
      credentials,
      '/api/coupon/seller/coupon/v2/',
      params,
      search ? { search } : {},
    )
    return rows.map(transformDiscount)
  }

  /** The collection documents no single-coupon read, only the list and create. */
  async getDiscount(_credentials: Credentials, _id: string): Promise<Discount> {
    throw notSupported(
      'Dukaan cannot read a single coupon: its docs document only the coupon list (get_discounts) and create.',
    )
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const res = await this.clientFor(credentials).post<RawDukaanCoupon>(
      '/v2/seller/discounts/',
      untransformDiscount(data),
    )
    return transformDiscount(res)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.clientFor(credentials).patch<RawDukaanCoupon>(
      `/v2/seller/discounts/${id}/`,
      untransformDiscount(data),
    )
    return transformDiscount(res)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/v2/seller/discounts/${id}/`)
  }
}
