/**
 * Salesforce Commerce Cloud B2C Commerce API (SCAPI) HTTP client.
 *
 * Features:
 *  - `Authorization: Bearer {token}` header on every request.
 *  - Offset-based pagination (`offset` + `limit`). SCAPI wraps list responses
 *    in `{ data: [...], total: N, offset: N, limit: N }`.
 *  - 429 retry with exponential back-off via the shared `withRetry` helper.
 *
 * Base URL template:
 *   https://{shortCode}.api.commercecloud.salesforce.com/{apiFamily}/{apiName}/v1/organizations/{organizationId}
 *
 * `siteId` is passed as a query parameter on every Shopper API request.
 *
 * Docs: https://developer.salesforce.com/docs/commerce/commerce-api/guide/base-url.html
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_VERSION, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { withRetry } from '@opensteward/shared'

export interface ListResult<T> {
  items: T[]
  /** Next page offset, if more items exist. */
  nextOffset?: number
  total?: number
}

/** Raw SCAPI list envelope. Most list endpoints use this shape (e.g. customer orders). */
export interface ScapiListEnvelope<T> {
  data: T[]
  total?: number
  offset?: number
  limit?: number
}

/**
 * SCAPI product-search response envelope.
 * POST /search/shopper-search/v1/.../product-search returns hits array, not data.
 * Reference: https://developer.salesforce.com/docs/commerce/commerce-api/references/shopper-search
 */
export interface ScapiSearchEnvelope<T> {
  hits: T[]
  total?: number
  offset?: number
  limit?: number
}

/**
 * SCAPI Shopper Promotions list envelope.
 * GET /pricing/shopper-promotions/v1/.../promotions returns { count, data, total }.
 */
export interface ScapiPromotionsEnvelope<T> {
  data: T[]
  count?: number
  total?: number
}

export class SalesforceCommerceCloudClient {
  /** Shopper Products API client. */
  private shopperProductsHttp: AxiosInstance
  /** Shopper Search API client. */
  private shopperSearchHttp: AxiosInstance
  /** Shopper Customers API client. */
  private shopperCustomersHttp: AxiosInstance
  /** Shopper Orders API client (GET orders). */
  private shopperOrdersHttp: AxiosInstance
  /** Checkout Orders API client (POST to submit basket as order). apiFamily=checkout */
  private checkoutOrdersHttp: AxiosInstance
  /** Shopper Baskets API client (used internally for order creation). */
  private shopperBasketsHttp: AxiosInstance
  /** Shopper Promotions API client. */
  private shopperPromotionsHttp: AxiosInstance
  /** Shopper Stores API client. */
  private shopperStoresHttp: AxiosInstance

  private readonly organizationId: string
  private readonly siteId: string
  private readonly shortCode: string

  constructor(
    credentials: Credentials,
    shortCode: string,
    organizationId: string,
    siteId: string,
  ) {
    this.organizationId = organizationId
    this.siteId = siteId
    this.shortCode = shortCode

    const baseHost = `https://${shortCode}.api.commercecloud.salesforce.com`
    const orgPath = `/organizations/${organizationId}`
    const defaultHeaders = {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }

    this.shopperProductsHttp = axios.create({
      baseURL: `${baseHost}/product/shopper-products/${API_VERSION}${orgPath}`,
      headers: defaultHeaders,
      timeout: 30_000,
    })

    this.shopperSearchHttp = axios.create({
      baseURL: `${baseHost}/search/shopper-search/${API_VERSION}${orgPath}`,
      headers: defaultHeaders,
      timeout: 30_000,
    })

    this.shopperCustomersHttp = axios.create({
      baseURL: `${baseHost}/customer/shopper-customers/${API_VERSION}${orgPath}`,
      headers: defaultHeaders,
      timeout: 30_000,
    })

    this.shopperOrdersHttp = axios.create({
      baseURL: `${baseHost}/order/shopper-orders/${API_VERSION}${orgPath}`,
      headers: defaultHeaders,
      timeout: 30_000,
    })

    // Order *creation* uses apiFamily=checkout, not apiFamily=order.
    // Reference: POST /checkout/shopper-orders/v1/organizations/{orgId}/orders
    this.checkoutOrdersHttp = axios.create({
      baseURL: `${baseHost}/checkout/shopper-orders/${API_VERSION}${orgPath}`,
      headers: defaultHeaders,
      timeout: 30_000,
    })

    this.shopperBasketsHttp = axios.create({
      baseURL: `${baseHost}/checkout/shopper-baskets/${API_VERSION}${orgPath}`,
      headers: defaultHeaders,
      timeout: 30_000,
    })

    // Shopper Promotions: apiFamily=pricing, apiName=shopper-promotions
    // Reference: GET /pricing/shopper-promotions/v1/organizations/{orgId}/promotions
    this.shopperPromotionsHttp = axios.create({
      baseURL: `${baseHost}/pricing/shopper-promotions/${API_VERSION}${orgPath}`,
      headers: defaultHeaders,
      timeout: 30_000,
    })

    // Shopper Stores: apiFamily=store, apiName=shopper-stores
    // Reference: GET /store/shopper-stores/v1/organizations/{orgId}/stores
    this.shopperStoresHttp = axios.create({
      baseURL: `${baseHost}/store/shopper-stores/${API_VERSION}${orgPath}`,
      headers: defaultHeaders,
      timeout: 30_000,
    })
  }

  // ── Internal request helpers ─────────────────────────────────────────────────

  /** Merge siteId into params unless already supplied. */
  private withSite(params?: Record<string, unknown>): Record<string, unknown> {
    return { siteId: this.siteId, ...params }
  }

  // ── Shopper Products ─────────────────────────────────────────────────────────

  async getProductsPage<T>(
    params: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    return withRetry(async () => {
      const limit = Math.min(
        (params.limit as number) ?? DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE,
      )
      const offset = (params.offset as number) ?? 0
      const merged = this.withSite({ ...params, limit, offset })

      const { data } = await this.shopperProductsHttp.get<ScapiListEnvelope<T>>(
        '/products',
        { params: merged },
      )

      const total = data.total ?? 0
      const nextOffset = offset + limit < total ? offset + limit : undefined
      return { items: data.data ?? [], nextOffset, total }
    })
  }

  async getProduct<T>(productId: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.shopperProductsHttp.get<T>(`/products/${productId}`, {
        params: this.withSite(params),
      })
      return data
    })
  }

  /**
   * POST /search/shopper-search/v1/.../product-search
   * Response envelope uses `hits` array (not `data`).
   */
  async searchProducts<T>(body: Record<string, unknown>): Promise<ListResult<T>> {
    return withRetry(async () => {
      const limit = Math.min(
        (body.limit as number) ?? DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE,
      )
      const offset = (body.offset as number) ?? 0
      const { data } = await this.shopperSearchHttp.post<ScapiSearchEnvelope<T>>(
        '/product-search',
        { ...body, limit, offset },
        { params: this.withSite() },
      )
      const total = data.total ?? 0
      const nextOffset = offset + limit < total ? offset + limit : undefined
      // SCAPI product-search response uses `hits`, not `data`.
      return { items: data.hits ?? [], nextOffset, total }
    })
  }

  /**
   * GET /product/shopper-products/v1/.../categories?ids={ids}
   * The `ids` query parameter is REQUIRED by SCAPI (400 without it).
   */
  async getCategories<T>(ids: string[], params?: Record<string, unknown>): Promise<ListResult<T>> {
    return withRetry(async () => {
      const { data } = await this.shopperProductsHttp.get<ScapiListEnvelope<T>>(
        '/categories',
        { params: this.withSite({ ...params, ids: ids.join(',') }) },
      )
      return { items: data.data ?? [] }
    })
  }

  async getCategory<T>(categoryId: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.shopperProductsHttp.get<T>(`/categories/${categoryId}`, {
        params: this.withSite(params),
      })
      return data
    })
  }

  // ── Shopper Promotions ───────────────────────────────────────────────────────

  /**
   * GET /pricing/shopper-promotions/v1/.../promotions
   * Returns promotions visible to shoppers (active, public-facing).
   * Optional query params: ids (comma-separated), locale.
   */
  async getPromotions<T>(params?: Record<string, unknown>): Promise<ListResult<T>> {
    return withRetry(async () => {
      const { data } = await this.shopperPromotionsHttp.get<ScapiPromotionsEnvelope<T>>(
        '/promotions',
        { params: this.withSite(params) },
      )
      return { items: data.data ?? [], total: data.total }
    })
  }

  /**
   * GET /pricing/shopper-promotions/v1/.../promotions/{promotionId}
   * Returns a single promotion by ID.
   */
  async getPromotion<T>(promotionId: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.shopperPromotionsHttp.get<T>(
        `/promotions/${promotionId}`,
        { params: this.withSite(params) },
      )
      return data
    })
  }

  // ── Shopper Stores ───────────────────────────────────────────────────────────

  /**
   * GET /store/shopper-stores/v1/.../stores
   * Returns stores visible to shoppers.
   * Optional query params: latitude, longitude, distanceUnit, maxDistance, limit, offset.
   */
  async getStores<T>(params?: Record<string, unknown>): Promise<ListResult<T>> {
    return withRetry(async () => {
      const limit = Math.min(
        (params?.limit as number) ?? DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE,
      )
      const offset = (params?.offset as number) ?? 0
      const { data } = await this.shopperStoresHttp.get<ScapiListEnvelope<T>>(
        '/stores',
        { params: this.withSite({ ...params, limit, offset }) },
      )
      const total = data.total ?? 0
      const nextOffset = offset + limit < total ? offset + limit : undefined
      return { items: data.data ?? [], nextOffset, total }
    })
  }

  /**
   * GET /store/shopper-stores/v1/.../stores/{storeId}
   */
  async getStore<T>(storeId: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.shopperStoresHttp.get<T>(`/stores/${storeId}`, {
        params: this.withSite(params),
      })
      return data
    })
  }

  // ── Shopper Customers ────────────────────────────────────────────────────────

  async getCustomer<T>(customerId: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.shopperCustomersHttp.get<T>(`/customers/${customerId}`, {
        params: this.withSite(),
      })
      return data
    })
  }

  async createCustomer<T>(body: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.shopperCustomersHttp.post<T>('/customers', body, {
        params: this.withSite(),
      })
      return data
    })
  }

  async updateCustomer<T>(customerId: string, body: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.shopperCustomersHttp.patch<T>(
        `/customers/${customerId}`,
        body,
        { params: this.withSite() },
      )
      return data
    })
  }

  async getCustomerOrders<T>(
    customerId: string,
    params?: Record<string, unknown>,
  ): Promise<ListResult<T>> {
    return withRetry(async () => {
      const limit = Math.min(
        (params?.limit as number) ?? DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE,
      )
      const offset = (params?.offset as number) ?? 0
      const { data } = await this.shopperCustomersHttp.get<ScapiListEnvelope<T>>(
        `/customers/${customerId}/orders`,
        { params: this.withSite({ ...params, limit, offset }) },
      )
      const total = data.total ?? 0
      const nextOffset = offset + limit < total ? offset + limit : undefined
      return { items: data.data ?? [], nextOffset, total }
    })
  }

  // ── Shopper Orders ───────────────────────────────────────────────────────────

  async getOrder<T>(orderNo: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.shopperOrdersHttp.get<T>(`/orders/${orderNo}`, {
        params: this.withSite(),
      })
      return data
    })
  }

  /**
   * POST /checkout/shopper-orders/v1/.../orders
   * Submit a basket as an order. apiFamily MUST be 'checkout' (not 'order').
   * Reference: https://developer.salesforce.com/docs/commerce/commerce-api/references/shopper-orders
   */
  async createOrder<T>(body: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.checkoutOrdersHttp.post<T>('/orders', body, {
        params: this.withSite(),
      })
      return data
    })
  }

  // ── Shopper Baskets ──────────────────────────────────────────────────────────

  async createBasket<T>(body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.shopperBasketsHttp.post<T>('/baskets', body ?? {}, {
        params: this.withSite(),
      })
      return data
    })
  }

  async addItemToBasket<T>(basketId: string, body: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.shopperBasketsHttp.post<T>(
        `/baskets/${basketId}/items`,
        body,
        { params: this.withSite() },
      )
      return data
    })
  }

  async deleteBasket(basketId: string): Promise<void> {
    return withRetry(async () => {
      await this.shopperBasketsHttp.delete(`/baskets/${basketId}`, {
        params: this.withSite(),
      })
    })
  }
}
