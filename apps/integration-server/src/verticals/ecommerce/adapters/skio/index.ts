/**
 * Skio adapter for the ecommerce vertical.
 *
 * Skio is a Shopify-native subscription management platform. It exposes a
 * read-oriented Public REST API for bulk-exporting subscription, order,
 * storefront-user (customer), and product data.
 *
 * Supported resources (read-only). The spec documents exactly four paths:
 * /orders, /products, /storefront-users and /subscriptions.
 *  - Products       → GET /products
 *  - Customers      → GET /storefront-users
 *  - Orders         → GET /orders
 *
 * Refused with 501 NOT_SUPPORTED before any request:
 *  - listVariants / getVariant: there is no variant endpoint, and the only
 *    documented variant rows (the `ProductVariants` nested in /products)
 *    carry a bare `price` number with no currency.
 *
 * Resources NOT exposed by the Skio REST API (auto-501 via registry):
 *  - Collections, Locations, InventoryLevels
 *  - Fulfillments, Refunds, Transactions, Discounts
 *
 * Authentication: `Authorization: API <key>` (case-sensitive).
 *
 * Pagination: cursor-based `{ first, after }` → `{ data, pageInfo }` envelope.
 *
 * Docs: https://code.skio.com/rest-api/
 *       https://help.skio.com/docs/using-the-skio-api
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
  simpleApiKey,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeCode as skioExchangeCode } from './auth'
import { SkioClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformProduct, type RawSkioProduct } from './transform/product'
import { transformStorefrontUser, type RawSkioStorefrontUser } from './transform/customer'
import { transformOrder, type RawSkioOrder } from './transform/order'

/** A deliberate refusal, thrown before any request is sent. */
function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

// ── Credential form (Connect Link / simpleApiKey) ─────────────────────────────

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'Skio API key',
  placeholder: 'Paste your Skio API key here',
  helpText: 'Find it in the Skio dashboard under API & Integrations → API.',
})

// ── Adapter config ─────────────────────────────────────────────────────────────

export interface SkioAdapterConfig {
  /** Pre-provisioned API key (optional — may come from per-connection credentials). */
  apiKey?: string
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class SkioAdapter implements EcommerceAdapter {
  readonly platform = 'skio'
  readonly version = '0.1.0'

  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  private configApiKey: string | undefined

  constructor(config: SkioAdapterConfig = {}) {
    this.configApiKey = config.apiKey
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Skio has no real OAuth authorize URL — point the user at the dashboard.
    return buildAuthUrl()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // Throws a descriptive error — see ./auth.ts.
    return skioExchangeCode()
  }

  /**
   * Skio API keys are long-lived and do not expire or rotate.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** The API key a connection authenticates with, however it was supplied. */
  private apiKeyFor(credentials: Credentials): string | undefined {
    return (
      (credentials.extra?.['apiKey'] as string | undefined) ??
      (credentials.accessToken && credentials.accessToken !== 'api-key'
        ? credentials.accessToken
        : this.configApiKey)
    )
  }

  private clientFor(credentials: Credentials): SkioClient {
    const apiKey = this.apiKeyFor(credentials)

    if (!apiKey) {
      throw new Error(
        'Skio adapter is missing an API key. ' +
          'Either configure it in the adapter config or POST it to /v1/connections ' +
          'with credentials: { apiKey: "<your-skio-api-key>" }.',
      )
    }

    return new SkioClient({ ...credentials, accessToken: apiKey })
  }

  /**
   * Build the pagination params for a list request.
   * Skio uses `first` (page size) and `after` (endCursor from previous page).
   * Incremental sync sends the documented `updatedAfter`, which every list
   * endpoint describes as "Filter … updated on or after this timestamp (ISO 8601)".
   */
  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      first: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    const cursor = params['cursor'] ?? params['after']
    if (cursor) out['after'] = cursor
    if (params.updatedAfter) {
      out['updatedAfter'] = params.updatedAfter.toISOString()
    }
    return out
  }

  /** `first` for a request: the caller's limit, within the documented 1..1000. */
  private pageSize(params: QueryParams): number {
    const limit = params.limit
    return typeof limit === 'number' && Number.isFinite(limit) && limit >= 1
      ? Math.min(Math.floor(limit), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE
  }

  /**
   * A caller page of a cursor endpoint, where one upstream page is one caller
   * page. Skio documents: "If `hasNextPage` is true, you may fetch the
   * following page by providing the `after` parameter with the `endCursor`
   * value from the previous response." Page N is reached through page N-1's
   * `endCursor`; only `hasNextPage` says whether there is more, since the spec
   * requires `endCursor` on every response, the last included.
   *
   * A caller that already holds an upstream cursor is at a position, not a
   * page number, and gets that one page.
   */
  private async pageCursor<T>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
  ): Promise<T[]> {
    const client = this.clientFor(credentials)
    const size = this.pageSize(params)
    // Filters only: the size and the position are this method's to set.
    const filters = this.listParams(params)
    delete filters['first']
    delete filters['after']
    const fetchPage = async (cursor: string | undefined) => {
      const res = await client.listWithCursor<T>(path, {
        ...filters,
        first: size,
        ...(cursor ? { after: cursor } : {}),
      })
      const next = res.pageInfo.hasNextPage ? res.pageInfo.endCursor : undefined
      return { items: res.items, next: next || undefined }
    }

    const explicit = (params['cursor'] ?? params['after']) as string | undefined
    let items: T[]
    let hasMore: boolean
    if (explicit) {
      const res = await fetchPage(explicit)
      items = res.items
      hasMore = res.next !== undefined
    } else {
      // Keyed by the resolved API key: credentials may carry it in `extra`.
      const scope = connectionScope('skio', { accessToken: this.apiKeyFor(credentials) ?? '' })
      const key = cursorPagerKey(scope, path, { ...filters, first: size })
      ;({ items, hasMore } = await pageByCursor<T>(key, params.page, fetchPage))
    }
    const clamped = typeof params.limit === 'number' && size < params.limit
    reportUpstreamPage(params, { hasMore, ...(clamped ? { pageSize: size } : {}) })
    return items
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const items = await this.pageCursor<RawSkioProduct>(credentials, params, 'products')
    return items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.clientFor(credentials).listWithCursor<RawSkioProduct>('products', {
      id,
      first: 1,
    })
    const product = res.items[0]
    if (!product) throw new Error(`Skio product not found: ${id}`)
    return transformProduct(product)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(_credentials: Credentials, _params: QueryParams): Promise<ProductVariant[]> {
    throw notSupported(
      'Skio cannot list product variants: the Public REST API documents only /orders, /products, ' +
        '/storefront-users and /subscriptions, and the variants nested in /products carry ' +
        '"price": {"type": "number"} with no currency, so a variant price cannot be stated.',
    )
  }

  async getVariant(_credentials: Credentials, _id: string): Promise<ProductVariant> {
    throw notSupported(
      'Skio cannot fetch a product variant: no endpoint takes a variant id (GET /products filters ' +
        'by product "id", "platformId", "ids", "platformIds", "status", "tags", "updatedAfter" and ' +
        '"updatedBefore" only), and variant prices carry no currency.',
    )
  }

  // ── Customers (StorefrontUsers) ───────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const items = await this.pageCursor<RawSkioStorefrontUser>(
      credentials,
      params,
      'storefront-users',
    )
    return items.map(transformStorefrontUser)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.clientFor(credentials).listWithCursor<RawSkioStorefrontUser>(
      'storefront-users',
      { id, first: 1 },
    )
    const user = res.items[0]
    if (!user) throw new Error(`Skio storefront user not found: ${id}`)
    return transformStorefrontUser(user)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const items = await this.pageCursor<RawSkioOrder>(credentials, params, 'orders')
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.clientFor(credentials).listWithCursor<RawSkioOrder>('orders', {
      id,
      first: 1,
    })
    const order = res.items[0]
    if (!order) throw new Error(`Skio order not found: ${id}`)
    return transformOrder(order)
  }
}
