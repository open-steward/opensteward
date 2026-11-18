/**
 * NuORDER adapter for the ecommerce vertical.
 *
 * NuORDER is a B2B wholesale order-writing platform connecting brands to
 * retail buyers — the connection is a brand's account. Reference (per task
 * instructions, primary): https://assets.nuorder.com/api-docs/index.html.
 * The older https://nuorderapi1.docs.apiary.io/ was not relied on.
 *
 * Auth: OAuth 1.0a, HMAC-SHA1-signed on every request (see oauth1.ts) using
 * four static per-brand values from Brand Admin → Settings → API Management.
 * `credentialFields()`/`exchangeCredentials()` collect them directly — see
 * the class doc comment on auth for why `auth_type` needs a central change.
 *
 * Implemented (see metadata.ts for full per-resource reasons):
 *   product (list/get/create/update; "delete" = set `active: false`, no
 *     documented hard-delete), collection (catalogs; full CRUD), location
 *     (warehouses; read-only — the canonical interface has no write methods
 *     for locations), customer (companies/buyers; list/get/create — no
 *     documented update/delete), fulfillment (shipments; create/update only —
 *     write body limited to the one confirmed field, `tracking_number`; no
 *     documented read/list endpoint).
 *
 * NOT implemented: variant (no variant resource — sizes/pricing are opaque
 *   per-product arrays), order (endpoints are documented but NO request or
 *   response JSON field names are shown anywhere accessible in the public
 *   reference — implementing create/update against an unverified schema
 *   risks silently corrupting a real wholesale order), inventory (no bulk
 *   list endpoint is documented — only single-record GET/POST/DELETE by an
 *   opaque id with no documented way to discover that id), transaction and
 *   refund (Payment endpoints are documented but, like Order, no field names
 *   are shown for the request/response body), discount (price sheets are not
 *   discounts — no discount/promotion resource exists).
 *
 * Webhooks: none documented → no webhook.ts (see rebuild report for the
 * webhooks.ts registry entry that needs to be removed centrally — it does
 * not exist for nuorder, so no action is needed there).
 */

import { customForm } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { cursorPagerKey, pageByCursor, pageLocally, reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { Customer } from '../../schema/customer'
import type { Fulfillment } from '../../schema/fulfillment'

import { buildAuthUrl, exchangeCode as nuorderExchangeCode } from './auth'
import { NuorderClient } from './client'
import type { Oauth1Credentials } from './oauth1'
import {
  CATALOG_API_VERSION,
  DEFAULT_ENVIRONMENT,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  NUORDER_ENVIRONMENTS,
  type NuorderEnvironment,
} from './constants'

import { transformProduct, untransformProduct, type RawNuorderProduct } from './transform/product'
import { transformCollection, untransformCollection, type RawNuorderCatalog } from './transform/collection'
import { transformLocation, type RawNuorderWarehouse } from './transform/location'
import { transformCustomer, untransformCustomer, type RawNuorderCompany } from './transform/customer'
import { transformFulfillment, untransformFulfillment, type RawNuorderShipment } from './transform/fulfillment'

// ── Connect Link form (4 static OAuth 1.0a values + environment) ───────────

const ENVIRONMENT_OPTIONS = Object.keys(NUORDER_ENVIRONMENTS).map((value) => ({
  value,
  label: value,
}))

const NUORDER_FORM = customForm({
  fields: [
    {
      name: 'consumerKey',
      label: 'Consumer Key',
      type: 'text',
      required: true,
      helpText: 'Brand Admin → Settings → API Management.',
    },
    { name: 'consumerSecret', label: 'Consumer Secret', type: 'password', required: true },
    { name: 'token', label: 'Token', type: 'text', required: true },
    { name: 'tokenSecret', label: 'Token Secret', type: 'password', required: true },
    {
      name: 'environment',
      label: 'Environment',
      type: 'select',
      required: true,
      options: ENVIRONMENT_OPTIONS,
      helpText: 'Which NuORDER host to sign requests against.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const consumerKey = (fields['consumerKey'] ?? '').trim()
    const consumerSecret = fields['consumerSecret'] ?? ''
    const token = (fields['token'] ?? '').trim()
    const tokenSecret = fields['tokenSecret'] ?? ''
    const environment = (fields['environment'] ?? DEFAULT_ENVIRONMENT).trim()
    if (!consumerKey || !consumerSecret || !token || !tokenSecret) {
      throw new Error('Consumer Key, Consumer Secret, Token, and Token Secret are all required.')
    }
    if (!(environment in NUORDER_ENVIRONMENTS)) {
      throw new Error(`Unknown NuORDER environment: ${environment}`)
    }
    return {
      // No single "access token" concept for 2-legged OAuth 1.0a — the OAuth
      // token lives in `extra.token` alongside the other three values; every
      // value the client needs is there.
      accessToken: token,
      extra: { consumerKey, consumerSecret, token, tokenSecret, environment },
    }
  },
})

export interface NuorderAdapterConfig {
  environment?: NuorderEnvironment
}

export class NuorderAdapter implements EcommerceAdapter {
  readonly platform = 'nuorder'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  credentialFields = NUORDER_FORM.credentialFields
  exchangeCredentials = NUORDER_FORM.exchangeCredentials

  private configEnvironment: NuorderEnvironment

  constructor(config: NuorderAdapterConfig = {}) {
    this.configEnvironment = config.environment ?? DEFAULT_ENVIRONMENT
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(): string {
    return buildAuthUrl()
  }

  async exchangeCode(): Promise<Credentials> {
    return nuorderExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static, non-expiring per-brand OAuth 1.0a credentials — nothing to refresh.
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): NuorderClient {
    const extra = credentials.extra ?? {}
    const oauth: Oauth1Credentials = {
      consumerKey: String(extra['consumerKey'] ?? ''),
      consumerSecret: String(extra['consumerSecret'] ?? ''),
      // `exchangeCredentials` always stores the OAuth token as BOTH
      // `accessToken` and `extra.token` (the same value, twice) — this reads
      // the one place every other adapter's credential-typed helpers expect
      // a token to live, not a guess between two different upstream fields.
      token: String(extra['token'] ?? ''),
      tokenSecret: String(extra['tokenSecret'] ?? ''),
    }
    if (!oauth.consumerKey || !oauth.consumerSecret || !oauth.token || !oauth.tokenSecret) {
      throw new Error(
        'NuORDER adapter is missing OAuth 1.0a credentials — POST consumerKey, ' +
          'consumerSecret, token, tokenSecret and environment to /v1/connections.',
      )
    }
    const environment = (extra['environment'] as NuorderEnvironment | undefined) ?? this.configEnvironment
    return new NuorderClient(oauth, environment)
  }

  private pagerScope(credentials: Credentials): string {
    const extra = credentials.extra ?? {}
    return `nuorder:${String(extra['consumerKey'] ?? '')}`
  }

  private clampLimit(limit: number | undefined): number {
    return Math.min(Math.max(1, limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
  }

  /**
   * One page of a `__limit`/`__last_id`-cursored list, resolving the worker's
   * numeric `page` through the shared cursor pager (see the Shopify/Nacelle
   * reference adapters for the same pattern applied to their own cursor
   * shapes).
   */
  private async cursorList<T extends { id?: unknown }>(
    credentials: Credentials,
    path: string,
    collectionKey: string,
    params: QueryParams,
    extraQuery: Record<string, unknown> = {},
  ): Promise<T[]> {
    const client = this.client(credentials)
    const limit = this.clampLimit(params.limit)
    const key = cursorPagerKey(this.pagerScope(credentials), collectionKey, { limit, ...extraQuery })
    const result = await pageByCursor<T, string>(key, params.page, async (lastId) => {
      const res = await client.listWithCursor<T>(path, {
        __limit: limit,
        __last_id: lastId,
        ...extraQuery,
      })
      return { items: res.items, next: res.lastId }
    })
    reportUpstreamPage(params, { hasMore: result.hasMore })
    return result.items
  }

  private oldestFirstFilter(params: QueryParams): string {
    // NuORDER's bulk list-by-modified-date filters have no documented
    // "give me everything" form — a very old date is used as "since forever"
    // when the caller has no `updatedAfter` of their own.
    return (params.updatedAfter ?? new Date('1970-01-01T00:00:00Z')).toISOString().slice(0, 10)
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const rows = await this.cursorList<RawNuorderProduct>(credentials, '/api/products', 'products', params)
    return rows.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawNuorderProduct>(`/api/product/${id}`)
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const raw = await this.client(credentials).put<RawNuorderProduct>('/api/product', untransformProduct(data))
    return transformProduct(raw)
  }

  async updateProduct(credentials: Credentials, id: string, data: Partial<Product>): Promise<Product> {
    const raw = await this.client(credentials).post<RawNuorderProduct>(
      `/api/product/${id}`,
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  /** No documented hard-delete — "status change instead of delete" via the confirmed `active` field. */
  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).post(`/api/product/${id}`, { active: false })
  }

  // ── Collections (Catalogs) ───────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const rows = await this.cursorList<RawNuorderCatalog>(
      credentials,
      `/api/${CATALOG_API_VERSION}/catalogs`,
      'catalogs',
      params,
    )
    return rows.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.client(credentials).get<RawNuorderCatalog>(
      `/api/${CATALOG_API_VERSION}/catalogs/${id}`,
    )
    return transformCollection(raw)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const raw = await this.client(credentials).post<RawNuorderCatalog>(
      `/api/${CATALOG_API_VERSION}/catalogs`,
      untransformCollection(data),
    )
    return transformCollection(raw)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const raw = await this.client(credentials).patch<RawNuorderCatalog>(
      `/api/${CATALOG_API_VERSION}/catalogs/${id}`,
      untransformCollection(data),
    )
    return transformCollection(raw)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    // Confirmed verbatim as singular `catalog` (not `catalogs`) for this one path.
    await this.client(credentials).delete(`/api/${CATALOG_API_VERSION}/catalog/${id}`)
  }

  // ── Locations (Warehouses) — read-only, per the canonical interface ──────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const client = this.client(credentials)
    // No documented pagination for the bare warehouse list: one response is
    // every warehouse, paged locally so a caller limit below their count
    // (maxPageSize 100) reaches each one, and page 2 is never page 1 again.
    const raw = await client.get<unknown>('/api/warehouse')
    const items = Array.isArray(raw) ? (raw as RawNuorderWarehouse[]) : []
    return pageLocally(items.map(transformLocation), params)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawNuorderWarehouse>(`/api/warehouse/${id}`)
    return transformLocation(raw)
  }

  // ── Customers (Companies/Buyers) ─────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await this.cursorList<RawNuorderCompany>(credentials, '/api/companies', 'companies', params, {
      modified_filter: this.oldestFirstFilter(params),
    })
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawNuorderCompany>(`/api/company/${id}`)
    return transformCustomer(raw)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const raw = await this.client(credentials).put<RawNuorderCompany>('/api/company', untransformCustomer(data))
    return transformCustomer(raw)
  }

  // ── Fulfillments (Shipments) — write-only, see class doc comment ────────

  async createFulfillment(credentials: Credentials, data: Partial<Fulfillment>): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const raw = await this.client(credentials).put<RawNuorderShipment>(
      `/api/shipment/${data.orderId}`,
      untransformFulfillment(data),
    )
    return transformFulfillment(raw, data.orderId)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    // Composite id `orderId:shipmentId`, matching `POST /api/shipment/{order_id}/{shipment_id}`.
    const [orderId, shipmentId] = id.split(':')
    if (!orderId || !shipmentId) {
      throw new Error('Invalid fulfillment id format: expected `orderId:shipmentId`')
    }
    const raw = await this.client(credentials).post<RawNuorderShipment>(
      `/api/shipment/${orderId}/${shipmentId}`,
      untransformFulfillment(data),
    )
    return transformFulfillment(raw, orderId)
  }
}
