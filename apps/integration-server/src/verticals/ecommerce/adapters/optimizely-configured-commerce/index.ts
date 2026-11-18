import { CONNECT_FORM } from './connect-form'
// ── Resource coverage ──────────────────────────────────────────────
// See ./metadata.ts for the full, cited reasoning. Summary:
// Unavailable: variant — no documented, separately-enumerable variant/SKU entity.
// Unavailable: inventory — the only documented endpoint looks up an explicit list of
//   product ids; it cannot satisfy the sync worker's page/limit-only list contract.
// Unavailable: fulfillment — shipment retrieval is documented as an internal service call, not a public REST contract.
// Unavailable: refund — the only order-adjacent write is an RMA request email, not an API refund.
// Unavailable: transaction — no payment-transaction resource is documented.
// Unavailable: discount — the promotions API applies cart codes; it does not manage promotion definitions.
/**
 * Optimizely Configured Commerce (formerly Insite) adapter for the
 * ecommerce vertical.
 *
 * Maps the Storefront REST API v1 to the canonical ecommerce resources.
 * Auth is a resource-owner password grant against the customer's own
 * instance — see `./auth.ts` and `./connect-form.ts`.
 *
 * Response envelopes below were confirmed one-by-one against the published
 * OpenAPI reference (not inferred by analogy): list endpoints wrap their
 * array in a named property (`products`, `categories`, `warehouses`,
 * `accounts`, `orders` — each confirmed individually); every SINGLE-resource
 * endpoint returns the model bare EXCEPT `GET /api/v1/products/{id}`, which
 * wraps it in a `product` property — an inconsistency in Optimizely's own
 * API, not a guess on this adapter's part. See each transform file's header
 * for the specific reference page confirming its shape.
 *
 * Docs: https://docs.developers.optimizely.com/configured-commerce/reference/getting-started-with-the-b2b-commerce-rest-apis
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { pageLocally, reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'

import {
  buildInfoUrl,
  exchangeCode as optimizelyExchangeCode,
  refreshCredentials as optimizelyRefreshCredentials,
} from './auth'
import { OptimizelyClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { transformProduct, type RawOptimizelyProduct } from './transform/product'
import {
  transformCollection,
  flattenCategories,
  type RawOptimizelyCategory,
} from './transform/collection'
import { transformLocation, type RawOptimizelyWarehouse } from './transform/location'
import {
  transformCustomer,
  untransformCustomer,
  type RawOptimizelyAccount,
} from './transform/customer'
import { transformOrder, untransformOrder, type RawOptimizelyOrder } from './transform/order'

export interface OptimizelyConfiguredCommerceAdapterConfig {
  [key: string]: unknown
}

type Paginated<T> = T & {
  pagination?: { totalItemCount?: number; numberOfPages?: number; currentPage?: number }
}

export class OptimizelyConfiguredCommerceAdapter implements EcommerceAdapter {
  readonly platform = 'optimizely-configured-commerce'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // Connect Link support — see ./connect-form.ts for the fields collected.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  constructor(_config: OptimizelyConfiguredCommerceAdapterConfig = {}) {}

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(): string {
    return buildInfoUrl()
  }

  async exchangeCode(): Promise<Credentials> {
    return optimizelyExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return optimizelyRefreshCredentials(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): OptimizelyClient {
    return new OptimizelyClient(credentials)
  }

  /** Every list method here works from `{page, limit}` alone — no other param is required. */
  private pageParams(params: QueryParams): { page: number; pageSize: number } {
    return {
      page: params.page && params.page > 0 ? params.page : 1,
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  private reportPagination(params: QueryParams, res: Paginated<unknown>): void {
    const p = res.pagination
    if (!p) return
    reportUpstreamPage(params, {
      totalCount: p.totalItemCount,
      currentPage: p.currentPage,
      totalPages: p.numberOfPages,
      hasMore:
        p.currentPage != null && p.numberOfPages != null
          ? p.currentPage < p.numberOfPages
          : undefined,
    })
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { page, pageSize } = this.pageParams(params)
    const res = await this.client(credentials).get<
      Paginated<{ products?: RawOptimizelyProduct[] }>
    >('/api/v1/products', { 'model.page': page, 'model.pageSize': pageSize })
    this.reportPagination(params, res)
    return (res.products ?? []).map(transformProduct)
  }

  /** `GET /api/v1/products/{id}` wraps the product in a `product` property — confirmed. */
  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<{ product: RawOptimizelyProduct }>(
      `/api/v1/products/${encodeURIComponent(id)}`,
    )
    return transformProduct(res.product)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const res = await this.client(credentials).get<{ categories?: RawOptimizelyCategory[] }>(
      '/api/v1/categories',
    )
    // The whole category tree in one response: paged locally, so a caller
    // limit below its size (the adapter declares maxPageSize 100) reaches each.
    return pageLocally(flattenCategories(res.categories).map(transformCollection), params)
  }

  /** `GET /api/v1/categories/{id}` returns the category bare — confirmed. */
  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.client(credentials).get<RawOptimizelyCategory>(
      `/api/v1/categories/${encodeURIComponent(id)}`,
    )
    return transformCollection(res)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const { page, pageSize } = this.pageParams(params)
    const res = await this.client(credentials).get<{ warehouses?: RawOptimizelyWarehouse[] }>(
      '/api/v1/warehouses',
      { 'parameter.page': page, 'parameter.pageSize': pageSize },
    )
    return (res.warehouses ?? []).map(transformLocation)
  }

  /** `GET /api/v1/warehouses/{id}` returns the warehouse bare — confirmed. */
  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<RawOptimizelyWarehouse>(
      `/api/v1/warehouses/${encodeURIComponent(id)}`,
    )
    return transformLocation(res)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const { page, pageSize } = this.pageParams(params)
    const res = await this.client(credentials).get<
      Paginated<{ accounts?: RawOptimizelyAccount[] }>
    >('/api/v1/accounts', {
      'parameter.page': page,
      'parameter.pageSize': pageSize,
    })
    this.reportPagination(params, res)
    return (res.accounts ?? []).map(transformCustomer)
  }

  /** `GET /api/v1/accounts/{id}` returns the account bare — confirmed. */
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawOptimizelyAccount>(
      `/api/v1/accounts/${encodeURIComponent(id)}`,
    )
    return transformCustomer(res)
  }

  /** `PATCH /api/v1/accounts/{id}` returns the updated account bare — confirmed. */
  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).patch<RawOptimizelyAccount>(
      `/api/v1/accounts/${encodeURIComponent(id)}`,
      untransformCustomer(data),
    )
    return transformCustomer(res)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { page, pageSize } = this.pageParams(params)
    const res = await this.client(credentials).get<Paginated<{ orders?: RawOptimizelyOrder[] }>>(
      '/api/v1/orders',
      { 'parameter.page': page, 'parameter.pageSize': pageSize },
    )
    this.reportPagination(params, res)
    return (res.orders ?? []).map(transformOrder)
  }

  /** `GET /api/v1/orders/{id}` returns the order bare — confirmed. */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<RawOptimizelyOrder>(
      `/api/v1/orders/${encodeURIComponent(id)}`,
    )
    return transformOrder(res)
  }

  /** `PATCH /api/v1/orders/{id}` returns the same OrderModel schema, bare. */
  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).patch<RawOptimizelyOrder>(
      `/api/v1/orders/${encodeURIComponent(id)}`,
      untransformOrder(data),
    )
    return transformOrder(res)
  }
}
