/**
 * IZBERG adapter for the ecommerce vertical.
 *
 * Maps the IZBERG (iceberg.technology) Merchant REST API to the canonical
 * ecommerce resources. IZBERG is a SaaS marketplace platform; merchants
 * authenticate with a seller authorization token sent as a Bearer token.
 * There is no OAuth code-exchange flow.
 *
 * Supported resources:
 *  - Products      → GET/PATCH /v1/productoffer/
 *  - Collections   → refused (501): see listCollections
 *  - Customers     → GET /v1/user/  (read-only via order context)
 *  - Orders        → GET/POST /v1/merchant_order/
 *  - Refunds       → GET/POST /v1/refund/
 *  - Transactions  → GET /v1/transaction/  (marketplace financial settlements)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: fulfillment — IZBERG has no dedicated fulfillment resource; shipping is managed via merchant_order status transitions (confirm/send/cancel sub-actions).
 * Unavailable: inventory — No dedicated inventory level resource exists; stock is a field on productoffer/variation, not a separate queryable resource.
 * Unavailable: location — IZBERG is a cloud marketplace with no warehouse/location management concepts in the merchant API.
 * Unverified:  discount — Endpoint slug /v1/discount/ is confirmed via Python SDK source (UpdateableIcebergObject, endpoint='discount') but the Swagger UI requires a live browser to render; no field-level response shape was accessible to build a safe transform.
 *
 * Pagination: `?limit=N&offset=N`; responses wrapped in `{objects, meta}`.
 * Auth: `Authorization: Bearer {seller token}` (public spec: `"security":
 * [{ "bearerAuth": [] }]`, `bearerAuth: { type: "http", scheme: "bearer" }`)
 *
 * Base URL (prod):    https://api.iceberg.technology/v1/
 * Base URL (sandbox): https://api.sandbox.iceberg.technology/v1/
 *
 * Docs: https://docs-api-merchant.izberg-marketplace.com/
 */

import { customForm, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'

import { exchangeCode as izbergExchangeCode } from './auth'
import { IzbergClient } from './client'
import { DEFAULT_PAGE_SIZE, RESOURCE_MAX_PAGE_SIZE, type IzbergListPath } from './constants'

import { transformProduct, untransformProduct, type RawIzbergProduct } from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawIzbergCategory,
} from './transform/collection'
import { transformCustomer, type RawIzbergUser } from './transform/customer'
import { transformOrder, untransformOrder, type RawIzbergMerchantOrder } from './transform/order'
import { transformRefund, untransformRefund, type RawIzbergRefund } from './transform/refund'
import { transformTransaction, type RawIzbergTransaction } from './transform/transaction'

// ── Credential form ───────────────────────────────────────────────────────────

/**
 * The seller authorization token, sent as `Authorization: Bearer {token}`.
 * The merchant spec (https://docs-api-merchant.izberg-marketplace.com/) lists
 * "Seller(s) authorization token (Bearer)" among its integration
 * prerequisites; the public spec secures every operation with `bearerAuth`.
 * Stored as `credentials.accessToken`.
 */
const IZBERG_FORM = customForm({
  fields: [
    {
      name: 'token',
      label: 'Seller authorization token',
      type: 'password',
      required: true,
      helpText: 'The seller (merchant) Bearer token IZBERG issued for your marketplace.',
    },
  ],
  async exchange(input) {
    const token = (input['token'] ?? '').trim()
    if (!token) throw new Error('Seller authorization token is required.')
    return { accessToken: token }
  },
})

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

// ── Config ────────────────────────────────────────────────────────────────────

export interface IzbergAdapterConfig {
  /**
   * Whether to use the sandbox environment.
   * When `true`, requests go to https://api.sandbox.iceberg.technology/v1/.
   * Defaults to `false` (production).
   */
  sandbox?: boolean
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class IzbergAdapter implements EcommerceAdapter {
  readonly platform = 'izberg'
  readonly version = '0.1.0'

  /** Connect-Link credential form — API key + application namespace. */
  credentialFields = IZBERG_FORM.credentialFields
  exchangeCredentials = IZBERG_FORM.exchangeCredentials

  private sandbox: boolean

  constructor(config: IzbergAdapterConfig = {}) {
    this.sandbox = config.sandbox ?? false
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // IZBERG has no real OAuth authorize URL — point to the seller back-office.
    return 'https://www.izberg-marketplace.com/en/our-platform/'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return izbergExchangeCode()
  }

  /**
   * IZBERG API keys do not expire and are not rotated; `refreshCredentials` is a
   * no-op. The shared `isTokenExpired` helper treats credentials without
   * `expiresAt` as non-expiring, so returning them unchanged is correct.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): IzbergClient {
    return new IzbergClient(credentials, this.sandbox)
  }

  /**
   * One caller page of a Tastypie list: `limit` is the caller's size clamped
   * to the resource's ceiling, `offset` the 1-based `page` strided by that
   * size. The size is reported as `pageSize` when it is below the caller's
   * limit, so the router and the sync worker judge the page at the size it
   * was really asked for, and `hasMore` comes from `meta.next`.
   */
  private async listPage<T>(
    credentials: Credentials,
    path: IzbergListPath,
    params: QueryParams,
    filters: Record<string, unknown> = {},
  ): Promise<T[]> {
    const asked = Math.max(1, Math.floor(params.limit ?? DEFAULT_PAGE_SIZE))
    const size = Math.min(asked, RESOURCE_MAX_PAGE_SIZE[path])
    const query: Record<string, unknown> = {
      limit: size,
      offset: pageOffset(params, size),
      ...filters,
    }
    if (params.updatedAfter) {
      query['updated_at__gte'] = params.updatedAfter.toISOString()
    }
    const res = await this.clientFor(credentials).listWithOffset<T>(path, query)
    reportUpstreamPage(params, {
      ...(res.hasMore !== undefined ? { hasMore: res.hasMore } : {}),
      ...(size < asked ? { pageSize: size } : {}),
    })
    return res.items
  }

  // ── Products ──────────────────────────────────────────────────────────────
  //
  // IZBERG merchants manage `productoffer` objects — these are the sellable
  // items tied to a specific merchant (in contrast to the abstract `product`
  // catalog record). We surface `productoffer` as the canonical Product.

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const rows = await this.listPage<RawIzbergProduct>(credentials, 'productoffer/', params)
    return rows.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.clientFor(credentials).get<RawIzbergProduct>(`productoffer/${id}/`)
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const raw = await this.clientFor(credentials).post<RawIzbergProduct>(
      'productoffer/',
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const raw = await this.clientFor(credentials).patch<RawIzbergProduct>(
      `productoffer/${id}/`,
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`productoffer/${id}/`)
  }

  // ── Collections ───────────────────────────────────────────────────────────
  //
  // Reads are refused. The adapter used to read GET /v1/category/, which is in
  // neither first-party spec and answers 404 live. The documented taxonomy list
  // is GET /v1/application_category/ ("List all application categories", query
  // params `application` and `parents`), but both specs document its
  // response only as `"200": { "description": "" }`, so no field of a
  // category row is documented to map from, and neither spec has a GET on
  // /v1/application_category/{id}/.
  //
  // createCollection / updateCollection / deleteCollection still target the
  // undocumented /v1/category/ path; write methods are out of this change's
  // scope.

  async listCollections(_credentials: Credentials, _params: QueryParams): Promise<Collection[]> {
    throw notSupported(
      'IZBERG cannot list collections: the documented GET /v1/application_category/ ' +
        '("List all application categories") documents no response fields ' +
        '(responses: { "200": { "description": "" } }), and /v1/category/ is not in the API.',
    )
  }

  async getCollection(_credentials: Credentials, _id: string): Promise<Collection> {
    throw notSupported(
      'IZBERG cannot read a collection: neither spec documents GET ' +
        '/v1/application_category/{id}/, and /v1/category/ is not in the API.',
    )
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const raw = await this.clientFor(credentials).post<RawIzbergCategory>(
      'category/',
      untransformCollection(data),
    )
    return transformCollection(raw)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const raw = await this.clientFor(credentials).patch<RawIzbergCategory>(
      `category/${id}/`,
      untransformCollection(data),
    )
    return transformCollection(raw)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`category/${id}/`)
  }

  // ── Customers ─────────────────────────────────────────────────────────────
  //
  // Merchants can look up buyer profiles via GET /v1/user/. Listing all users
  // is supported; creation/deletion is not exposed via the merchant API.

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await this.listPage<RawIzbergUser>(credentials, 'user/', params)
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.clientFor(credentials).get<RawIzbergUser>(`user/${id}/`)
    return transformCustomer(raw)
  }

  // ── Orders ────────────────────────────────────────────────────────────────
  //
  // Merchants interact with `merchant_order` objects — the merchant-scoped
  // slice of a marketplace order. Cancellation is handled via a status change.

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const rows = await this.listPage<RawIzbergMerchantOrder>(credentials, 'merchant_order/', params)
    return rows.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.clientFor(credentials).get<RawIzbergMerchantOrder>(
      `merchant_order/${id}/`,
    )
    return transformOrder(raw)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const raw = await this.clientFor(credentials).patch<RawIzbergMerchantOrder>(
      `merchant_order/${id}/`,
      untransformOrder(data),
    )
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    // IZBERG cancels a merchant_order by calling the `cancel` sub-action.
    const raw = await this.clientFor(credentials).post<RawIzbergMerchantOrder>(
      `merchant_order/${id}/cancel/`,
    )
    return transformOrder(raw)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────
  //
  // Refunds are associated with merchant_orders via GET/POST /v1/refund/.

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const extra: Record<string, unknown> = {}
    const orderId = params['order_id'] ?? params['orderId']
    if (orderId) {
      extra['merchant_order'] = orderId
    }
    const rows = await this.listPage<RawIzbergRefund>(credentials, 'refund/', params, extra)
    return rows.map((r) => transformRefund(r))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const raw = await this.clientFor(credentials).get<RawIzbergRefund>(`refund/${id}/`)
    return transformRefund(raw)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const raw = await this.clientFor(credentials).post<RawIzbergRefund>(
      'refund/',
      untransformRefund(data),
    )
    return transformRefund(raw, data.orderId)
  }

  // ── Transactions ──────────────────────────────────────────────────────────
  //
  // IZBERG exposes financial settlement entries via GET /v1/transaction/.
  // These are marketplace accounting records (sale/refund splits) linked to
  // orders. The `transaction_type` field encodes the kind: 1=sale, 2=refund.

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const extra: Record<string, unknown> = {}
    const orderId = params['order_id'] ?? params['orderId']
    if (orderId) {
      extra['order'] = orderId
    }
    const rows = await this.listPage<RawIzbergTransaction>(
      credentials,
      'transaction/',
      params,
      extra,
    )
    return rows.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const raw = await this.clientFor(credentials).get<RawIzbergTransaction>(`transaction/${id}/`)
    return transformTransaction(raw)
  }
}
