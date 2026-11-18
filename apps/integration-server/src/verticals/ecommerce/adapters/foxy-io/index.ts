/**
 * Foxy.io adapter for the ecommerce vertical.
 *
 * Maps the Foxy hAPI (https://api.foxycart.com) to the canonical ecommerce
 * resources. Foxy is a hosted checkout-as-a-service platform — it does NOT
 * have a product catalogue, collections, inventory, or location resources.
 *
 * Supported resources:
 *  - Customers     (fx:customers)
 *  - Orders        (fx:transactions — Foxy's term for placed orders)
 *  - Transactions  (fx:payments — Foxy's payment records scoped to a transaction)
 *  - Discounts     (fx:coupons)
 *  - Fulfillments  (fx:shipments embedded in transactions — no tracking/carrier/status)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: collection — Foxy has no product catalog or storefront collections; fx:item_categories are delivery-behavior groupings only
 * Unavailable: inventory  — Foxy is checkout-as-a-service with no stock management or inventory endpoints
 * Unavailable: location   — Foxy has no physical warehouse or store location concept in its hAPI
 * Unavailable: product    — Foxy has no product catalog; products are inline transaction items (name/price/code) only
 * Unavailable: refund     — Foxy exposes a conditional per-transaction refund action link, not a listable fx:refunds resource
 *
 * Auth: OAuth2 authorization-code grant.
 *   Authorize: https://auth.foxy.io/authorize
 *   Token:     https://api.foxycart.com/token
 *   Access tokens expire after 2 hours; refresh tokens last 10 years.
 *
 * Docs: https://api.foxycart.com/docs
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
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'
import type { Fulfillment } from '../../schema/fulfillment'

import { buildAuthUrl, exchangeCode as foxyExchangeCode, refreshAccessToken } from './auth'
import { FoxyClient, type FoxyCollectionResponse, type ListResult } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, MAX_PAGE_SIZE } from './constants'

import {
  transformCustomer,
  untransformCustomer,
  type RawFoxyCustomer,
} from './transform/customer'
import {
  transformOrder,
  type RawFoxyTransaction,
} from './transform/order'
import {
  transformTransaction,
  type RawFoxyPayment,
} from './transform/transaction'
import {
  transformDiscount,
  untransformDiscount,
  type RawFoxyCoupon,
  type RawFoxyCouponCode,
} from './transform/discount'
import {
  transformFulfillment,
  type RawFoxyShipmentFull,
} from './transform/fulfillment'

// ── Config ────────────────────────────────────────────────────────────────────

export interface FoxyIoAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /**
   * Numeric Foxy store ID. This is found in the Foxy admin URL, e.g.
   * https://admin.foxycart.com/admin.php?ThisAction=ManageStore&store_id=42
   */
  storeId: string
  scopes?: string[]
}

// ── Adapter ────────────────────────────────────────────────────────────────────

export class FoxyIoAdapter implements EcommerceAdapter {
  readonly platform = 'foxy-io'
  readonly version = '0.1.0'
  /**
   * "currently the maximum results per page is 300"
   * (https://api.foxycart.com/docs/cheat-sheet). Every list method pages at
   * the requested size by offset, cuts its rows with pageByRows, or (for
   * listTransactions, one order's embedded payments) pages locally.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private storeId: string
  private scopes: string[]

  constructor(config: FoxyIoAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.storeId = config.storeId
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return foxyExchangeCode(code, redirectUri, this.clientId, this.clientSecret)
  }

  /**
   * Foxy access tokens expire after 2 hours. Refresh using the stored
   * refresh token (valid 10 years) when `credentials.expiresAt` is past.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): FoxyClient {
    return new FoxyClient(credentials, this.storeId)
  }

  /** The page size actually sent: the caller's limit, clamped to Foxy's 300. */
  private pageSize(params: QueryParams): number {
    return Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  }

  /** Filters shared by every list call (everything but limit and offset). */
  private listFilters(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    if (params.updatedAfter) {
      // Foxy supports date filters — use date_modified_after for HAL queries
      out.date_modified_after = params.updatedAfter.toISOString()
    }
    return out
  }

  /**
   * limit + offset for one caller page. Foxy pages by offset ("specify a
   * starting offset for the results with a URL parameter of offset=<offset>"),
   * so a 1-based page starts at (page - 1) × the size actually sent.
   */
  private listParams(params: QueryParams): Record<string, unknown> {
    const limit = this.pageSize(params)
    return { ...this.listFilters(params), limit, offset: pageOffset(params, limit) }
  }

  /** Report what Foxy said about the page it served. */
  private report<T>(params: QueryParams, res: ListResult<T>): void {
    const limit = this.pageSize(params)
    reportUpstreamPage(params, {
      hasMore: res.nextOffset !== undefined,
      ...(res.totalCount !== undefined ? { totalCount: res.totalCount } : {}),
      ...(params.limit !== undefined && limit < params.limit ? { pageSize: limit } : {}),
    })
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).listEmbedded<RawFoxyCustomer>(
      'customers',
      'fx:customers',
      this.listParams(params),
    )
    this.report(params, res)
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawFoxyCustomer>(
      `/customers/${id}`,
      { zoom: 'customer_addresses' },
    )
    return transformCustomer(raw)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.client(credentials)
    const raw = await client.post<RawFoxyCustomer>(
      client.storePath('customers'),
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const raw = await this.client(credentials).patch<RawFoxyCustomer>(
      `/customers/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/customers/${id}`)
  }

  // ── Orders (Foxy Transactions) ────────────────────────────────────────────

  /**
   * List orders. Foxy does not support creating or updating transactions via
   * the API (they are created through the checkout); only listing and reading
   * are available.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.client(credentials).listEmbedded<RawFoxyTransaction>(
      'transactions',
      'fx:transactions',
      { ...this.listParams(params), zoom: 'items,shipments,payments' },
    )
    this.report(params, res)
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.client(credentials).get<RawFoxyTransaction>(
      `/transactions/${id}`,
      { zoom: 'items,shipments,payments' },
    )
    return transformOrder(raw)
  }

  // ── Transactions (Foxy Payments) ──────────────────────────────────────────

  /**
   * List payment records scoped to an order (transaction).
   * Requires `orderId` (or `order_id`) in `params`.
   */
  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const orderId = params['orderId'] ?? params['order_id']
    if (!orderId) {
      throw new Error('listTransactions requires `orderId` in query params')
    }
    // Fetch the parent transaction with payments embedded.
    const raw = await this.client(credentials).get<RawFoxyTransaction>(
      `/transactions/${String(orderId)}`,
      { zoom: 'payments' },
    )
    const payments: RawFoxyPayment[] = raw._embedded?.['fx:payments'] ?? []
    // The zoomed embed is the order's whole payment list, fetched in one
    // request with no offset of its own, so the caller's page is cut locally.
    return pageLocally(payments.map(transformTransaction), params)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = this.client(credentials)
    const raw = await client.get<RawFoxyPayment>(client.storePath(`payments/${id}`))
    return transformTransaction(raw)
  }

  // ── Fulfillments (Foxy Shipments embedded in Transactions) ───────────────

  /**
   * List fulfillments by fetching recent transactions and flattening their
   * embedded shipments. Foxy has no standalone store-level `fx:shipments`
   * collection endpoint — shipments are always accessed via the parent
   * transaction. Note that Foxy shipments do not expose tracking number,
   * carrier, or fulfillment status.
   */
  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    // One transaction holds 0..n shipments, so a page of transactions is not
    // a caller page of fulfillments: cut the flattened rows by position.
    const client = this.client(credentials)
    const filters = this.listFilters(params)
    const limit = this.pageSize(params)
    const key = cursorPagerKey(
      connectionScope(`foxy-io:${this.storeId}`, credentials),
      'fulfillments',
      { ...filters, limit },
    )
    const { items } = await pageByRows<Fulfillment, number>(
      key,
      params,
      async (offset) => {
        const res = await client.listEmbedded<RawFoxyTransaction>(
          'transactions',
          'fx:transactions',
          { ...filters, limit, offset: offset ?? 0, zoom: 'shipments' },
        )
        const rows: Fulfillment[] = []
        for (const txn of res.items) {
          const shipments: RawFoxyShipmentFull[] =
            (txn._embedded?.['fx:shipments'] as RawFoxyShipmentFull[] | undefined) ?? []
          for (const s of shipments) {
            rows.push(transformFulfillment({ ...s, _transactionId: txn.id }))
          }
        }
        return { items: rows, next: res.nextOffset }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Foxy has no standalone shipment fetch by id; the id is store-scoped.
    const raw = await this.client(credentials).get<RawFoxyShipmentFull>(
      `/shipments/${id}`,
    )
    return transformFulfillment(raw)
  }

  // ── Discounts (Foxy Coupons) ──────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.client(credentials)
    const res = await client.listEmbedded<RawFoxyCoupon>(
      'coupons',
      'fx:coupons',
      this.listParams(params),
    )
    this.report(params, res)
    // Fetch the first coupon code for each coupon in parallel.
    const withCodes = await Promise.all(
      res.items.map(async (coupon) => {
        try {
          const codesRes = await client.get<FoxyCollectionResponse<RawFoxyCouponCode>>(
            `/coupons/${coupon.id}/coupon_codes`,
            { limit: 1 },
          )
          const firstCode = codesRes._embedded?.['fx:coupon_codes']?.[0]
          return transformDiscount(coupon, firstCode)
        } catch {
          return transformDiscount(coupon)
        }
      }),
    )
    return withCodes
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.client(credentials)
    const coupon = await client.get<RawFoxyCoupon>(`/coupons/${id}`)
    let code: RawFoxyCouponCode | undefined
    try {
      const codesRes = await client.get<FoxyCollectionResponse<RawFoxyCouponCode>>(
        `/coupons/${id}/coupon_codes`,
        { limit: 1 },
      )
      code = codesRes._embedded?.['fx:coupon_codes']?.[0]
    } catch {
      /* no code — continue */
    }
    return transformDiscount(coupon, code)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.client(credentials)
    const coupon = await client.post<RawFoxyCoupon>(
      client.storePath('coupons'),
      untransformDiscount(data),
    )
    let code: RawFoxyCouponCode | undefined
    if (data.code) {
      code = await client.post<RawFoxyCouponCode>(
        `/coupons/${coupon.id}/coupon_codes`,
        { code: data.code },
      )
    }
    return transformDiscount(coupon, code)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const coupon = await this.client(credentials).patch<RawFoxyCoupon>(
      `/coupons/${id}`,
      untransformDiscount(data),
    )
    return transformDiscount(coupon)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/coupons/${id}`)
  }
}
