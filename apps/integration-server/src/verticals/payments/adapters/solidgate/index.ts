/**
 * Solidgate adapter — payments vertical.
 *
 * Source of truth: the OpenAPI bundle linked from
 * https://api-docs.solidgate.com/api/get-started ("The complete API schema is
 * available as a single bundled file. It includes all endpoints, request and
 * response structures, and field definitions."), at
 * https://api-docs.solidgate.com/_bundle/api/@v1/index.json?download.
 *
 * Auth: every request carries `merchant` (the Public key) and `signature`
 * (HMAC-SHA512 with the Secret key), see ./client.ts.
 *
 * Reads:
 *   - charges, refunds, disputes and subscriptions come from the Reports API
 *     (POST https://reports.solidgate.com/api/v1/…), which needs a
 *     date_from/date_to window and documents no lookback limit, so an
 *     unfiltered list is refused and a list with `updatedAfter` is served;
 *   - products, prices and plans come from the Subscriptions API
 *     (https://subscriptions.solidgate.com/api/v1/products…);
 *   - customers: no endpoint lists or reads them.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — financial-entries API returns an S3 report URL, not listable records
 * Unavailable: invoice — only accessible as nested objects inside subscription responses; no standalone listing endpoint
 * Unavailable: payment-method — no dedicated CRUD endpoints; tokens are embedded in charge/recurring flows
 * Unavailable: payout — settlements managed via Hub dashboard only; no REST payout endpoint confirmed
 */

import {
  connectionScope,
  pageByRows,
  pageOffset,
  reportUpstreamPage,
  type BaseAdapter,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Dispute } from '../../schema/dispute'
import type { Plan, Price, Product } from '../../schema/plan'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import {
  CATALOG_MAX_LIMIT,
  DEFAULT_PAGE_SIZE,
  PAY_BASE_URL,
  REPORTS_BASE_URL,
  REPORT_MAX_LIMIT,
  SUBSCRIPTIONS_BASE_URL,
} from './constants'
import { SOLIDGATE_CREDENTIAL_FIELDS, buildCredentials } from './auth'
import { SolidgateApiError, SolidgateClient } from './client'
import { verifySolidgateWebhook, parseSolidgateWebhookEvents } from './webhook'

import { transformCharge, type RawSolidgateOrder } from './transform/charge'
import { transformRefund, type RawSolidgateTransaction } from './transform/refund'
import { transformSubscription, type RawSolidgateSubscription } from './transform/subscription'
import { transformDispute, type RawSolidgateChargeback } from './transform/dispute'
import {
  transformPlan,
  transformPrice,
  transformProduct,
  type RawSolidgatePrice,
  type RawSolidgateProduct,
} from './transform/plan'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

const NO_CUSTOMERS =
  'Solidgate cannot list or read customers: its API has no customer resource (no /customers path on any host in the OpenAPI bundle, which "includes all endpoints"); customers appear only as customer_account_id on orders and subscriptions.'

/** Report cursor: `metadata.next_page_iterator`, "If this value is null, it indicates that all available data has been successfully retrieved by the merchant." */
interface ReportMetadata {
  next_page_iterator?: string | null
  count?: number
}

interface CardOrdersReport {
  orders?: Array<
    Omit<RawSolidgateOrder, 'transactions'> & { transactions?: RawSolidgateTransaction[] }
  >
  metadata?: ReportMetadata
}

interface ChargebacksReport {
  orders?: Array<{ order_id: string; chargebacks?: RawSolidgateChargeback[] }>
  metadata?: ReportMetadata
}

interface SubscriptionsReport {
  subscriptions?: Record<string, RawSolidgateSubscription>
  metadata?: ReportMetadata
}

/** GET /products and GET /products/{product_id}/prices: `pagination.total_count`. */
interface CatalogPage<T> {
  data?: T[]
  pagination?: { offset: number; limit: number; total_count: number }
}

/** "YYYY-MM-DD HH:MM:SS", "stated in UTC+0". */
function reportDatetime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * Report windows, newest first, from `lower` to `top`, cut at UTC calendar
 * month starts. Every boundary but `lower` is a UTC calendar boundary, so the
 * windows (and page N of the walk) are the same for every call on one UTC day.
 * A month is also inside the 36 days the Hub's card-orders report allows
 * ("Specify a date range of up to 36 days",
 * https://docs.solidgate.com/reporting/operational-reports/card-orders/); the
 * API reference states no range cap for these reports.
 */
export function reportWindows(lower: number, top: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let end = top
  while (end > lower) {
    const d = new Date(end - 1)
    const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
    const start = Math.max(lower, monthStart)
    out.push([start, end])
    end = start
  }
  return out
}

interface ReportCursor {
  /** Index into `reportWindows`, 0 = newest. */
  w: number
  /** `metadata.next_page_iterator` within that window. */
  it?: string
}

export class SolidgateAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'solidgate'
  readonly version = '0.2.0'

  getAuthUrl(): string {
    throw new Error('Solidgate uses API keys; submit them via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Solidgate uses API keys; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return SOLIDGATE_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySolidgateWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSolidgateWebhookEvents(payload)
  }

  // ── Reports API walk ────────────────────────────────────────────────────

  /**
   * Rows flattened out of one Reports API report, for the caller's page.
   *
   * Every report takes `date_from` and `date_to` (both required, "Start/End
   * datetime for the report stated in UTC+0.", "YYYY-MM-DD HH:MM:SS"),
   * `filter` ([updated_at|created_at]), `limit` ("integer [ 1 .. 2000 ]") and
   * `next_page_iterator`, and documents no lookback limit. So a call without
   * `updatedAfter` is refused before any request. A call with it walks the
   * UTC-month windows from the next UTC midnight back to `updatedAfter`
   * (`reportWindows`), newest first, with `filter: updated_at`, following each
   * window's `metadata.next_page_iterator` through `pageByRows`. The windows
   * are fixed for the UTC day, so page N is stable within it.
   */
  private async reportRows<R, T>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    what: string,
    flatten: (res: R) => T[],
    next: (res: R) => string | null | undefined,
  ): Promise<T[]> {
    if (!params.updatedAfter) {
      throw notSupported(
        `Solidgate cannot list ${what} without updated_after: its only list, POST ${REPORTS_BASE_URL}${path}, ` +
          'requires date_from and date_to ("Start datetime for the report stated in UTC+0.") and documents no ' +
          'lookback limit. Pass updated_after to read the window since then.',
      )
    }
    const lower = Math.floor(new Date(params.updatedAfter).getTime() / 1000) * 1000
    const now = new Date()
    const top = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
    if (!(lower < top)) {
      reportUpstreamPage(params, { hasMore: false })
      return []
    }
    const windows = reportWindows(lower, top)
    const asked = Math.max(Math.floor(params.limit ?? DEFAULT_PAGE_SIZE), 1)
    const upstreamLimit = Math.min(asked, REPORT_MAX_LIMIT)
    const client = new SolidgateClient(credentials, REPORTS_BASE_URL)
    const key =
      `solidgate:${connectionScope('solidgate', credentials)}:${path}` +
      `:${reportDatetime(lower)}:${reportDatetime(top)}:limit=${upstreamLimit}`
    const { items } = await pageByRows<T, ReportCursor>(key, params, async (cursor) => {
      const w = cursor?.w ?? 0
      const [from, to] = windows[w]!
      const res = await client.post<R>(path, {
        filter: 'updated_at',
        date_from: reportDatetime(from),
        date_to: reportDatetime(to),
        limit: upstreamLimit,
        ...(cursor?.it ? { next_page_iterator: cursor.it } : {}),
      })
      const it = next(res)
      return {
        items: flatten(res),
        next: it ? { w, it } : w + 1 < windows.length ? { w: w + 1 } : null,
      }
    })
    return items
  }

  // ── Customers ───────────────────────────────────────────────────────────

  async listCustomers(): Promise<Customer[]> {
    throw notSupported(NO_CUSTOMERS)
  }

  async getCustomer(): Promise<Customer> {
    throw notSupported(NO_CUSTOMERS)
  }

  // ── Charges (card orders) ───────────────────────────────────────────────

  /** POST https://reports.solidgate.com/api/v1/card-orders: `{ orders[], metadata }`. */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    return this.reportRows<CardOrdersReport, Charge>(
      credentials,
      params,
      '/card-orders',
      'charges',
      (res) => (res.orders ?? []).map(transformCharge),
      (res) => res.metadata?.next_page_iterator,
    )
  }

  /** POST https://pay.solidgate.com/api/v1/status with `{ order_id }`: `{ order, … }`. */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    let res: { order?: RawSolidgateOrder }
    try {
      res = await new SolidgateClient(credentials, PAY_BASE_URL).post<{
        order?: RawSolidgateOrder
      }>('/status', { order_id: id })
    } catch (err) {
      // Documented example "Error 2.01 Order not found": messages { order: ["Order not found."] }.
      if (
        err instanceof SolidgateApiError &&
        err.solidgateCode === '2.01' &&
        typeof err.messages === 'object' &&
        err.messages !== null &&
        'order' in err.messages
      ) {
        throw notFound(`Solidgate has no order ${id}`)
      }
      throw err
    }
    if (!res.order) throw notFound(`Solidgate returned no order for ${id}`)
    return transformCharge(res.order)
  }

  // ── Refunds (refund transactions of card orders) ────────────────────────

  /**
   * Solidgate has no refund list. A refund is a transaction with
   * `operation: "refund"` in an order's `transactions[]` in the card-orders
   * report, so refunds are flattened out of its pages.
   */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    return this.reportRows<CardOrdersReport, Refund>(
      credentials,
      params,
      '/card-orders',
      'refunds',
      (res) =>
        (res.orders ?? []).flatMap((o) =>
          (o.transactions ?? [])
            .filter((t) => t.operation === 'refund')
            .map((t) => transformRefund(t, o.order_id)),
        ),
      (res) => res.metadata?.next_page_iterator,
    )
  }

  /** Write path, out of this rebuild's scope: POST /refunds is not documented (the action is POST /refund). */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await new SolidgateClient(credentials, PAY_BASE_URL).post<{
      data?: RawSolidgateTransaction & { order_id?: string }
    }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    if (!res.data) throw new Error('Solidgate returned no refund')
    return transformRefund(res.data, data.chargeId ?? '')
  }

  // ── Subscriptions ───────────────────────────────────────────────────────

  /** POST https://reports.solidgate.com/api/v1/subscriptions: `{ subscriptions: { <id>: … }, metadata }`. */
  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    return this.reportRows<SubscriptionsReport, Subscription>(
      credentials,
      params,
      '/subscriptions',
      'subscriptions',
      (res) => Object.values(res.subscriptions ?? {}).map(transformSubscription),
      (res) => res.metadata?.next_page_iterator,
    )
  }

  // ── Disputes (chargebacks) ──────────────────────────────────────────────

  /** POST https://reports.solidgate.com/api/v1/card-orders/chargebacks: `orders[].chargebacks[]`. */
  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    return this.reportRows<ChargebacksReport, Dispute>(
      credentials,
      params,
      '/card-orders/chargebacks',
      'disputes',
      (res) =>
        (res.orders ?? []).flatMap((o) =>
          (o.chargebacks ?? []).map((cb) => transformDispute(cb, o.order_id)),
        ),
      (res) => res.metadata?.next_page_iterator,
    )
  }

  // ── Products / prices / plans (Subscriptions API) ───────────────────────

  private catalog(credentials: Credentials): SolidgateClient {
    return new SolidgateClient(credentials, SUBSCRIPTIONS_BASE_URL)
  }

  /**
   * GET /products, paged by `pagination[limit]` ("Specify the number of items
   * to return.", 1..100) and `pagination[offset]` ("Specify the number of items
   * to skip before starting to collect the result set."), with
   * `pagination.total_count` ("Total count of the products available.").
   */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const asked = Math.max(Math.floor(params.limit ?? DEFAULT_PAGE_SIZE), 1)
    const size = Math.min(asked, CATALOG_MAX_LIMIT)
    const offset = pageOffset(params, size)
    const res = await this.catalog(credentials).get<CatalogPage<RawSolidgateProduct>>('/products', {
      'pagination[limit]': size,
      'pagination[offset]': offset,
    })
    const rows = res.data ?? []
    const clamp = size < asked ? { pageSize: size } : {}
    const total = res.pagination?.total_count
    if (typeof total === 'number') {
      reportUpstreamPage(params, {
        ...clamp,
        totalCount: total,
        hasMore: offset + rows.length < total,
      })
    } else if (size < asked) {
      reportUpstreamPage(params, clamp)
    }
    return rows.map(transformProduct)
  }

  /** GET /products/{product_id}: the product object. */
  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.catalog(credentials).get<RawSolidgateProduct>(
      `/products/${encodeURIComponent(id)}`,
    )
    return transformProduct(res)
  }

  /** Every price of one product, walking GET /products/{product_id}/prices by offset. */
  private async productPrices(
    client: SolidgateClient,
    productId: string,
  ): Promise<RawSolidgatePrice[]> {
    const out: RawSolidgatePrice[] = []
    for (;;) {
      const res = await client.get<CatalogPage<RawSolidgatePrice>>(
        `/products/${encodeURIComponent(productId)}/prices`,
        { 'pagination[limit]': CATALOG_MAX_LIMIT, 'pagination[offset]': out.length },
      )
      const rows = res.data ?? []
      out.push(...rows)
      const total = res.pagination?.total_count
      if (rows.length === 0 || typeof total !== 'number' || out.length >= total) return out
    }
  }

  /**
   * Rows built from every product's prices, walked over GET /products pages of
   * 100 through `pageByRows`. Prices carry no product id (the bulk
   * POST /products/prices/list returns none), so they are read per product.
   */
  private async catalogRows<T>(
    credentials: Credentials,
    params: QueryParams,
    what: string,
    build: (price: RawSolidgatePrice, product: RawSolidgateProduct) => T | null,
  ): Promise<T[]> {
    const client = this.catalog(credentials)
    const key = `solidgate:${connectionScope('solidgate', credentials)}:${what}:products=${CATALOG_MAX_LIMIT}`
    const { items } = await pageByRows<T, number>(key, params, async (cursor) => {
      const offset = cursor ?? 0
      const res = await client.get<CatalogPage<RawSolidgateProduct>>('/products', {
        'pagination[limit]': CATALOG_MAX_LIMIT,
        'pagination[offset]': offset,
      })
      const products = res.data ?? []
      const rows: T[] = []
      for (const product of products) {
        for (const price of await this.productPrices(client, product.id)) {
          const row = build(price, product)
          if (row) rows.push(row)
        }
      }
      const total = res.pagination?.total_count
      const reached = offset + products.length
      return {
        items: rows,
        next: products.length > 0 && typeof total === 'number' && reached < total ? reached : null,
      }
    })
    return items
  }

  async listPrices(credentials: Credentials, params: QueryParams): Promise<Price[]> {
    return this.catalogRows(credentials, params, 'prices', transformPrice)
  }

  /** Plans are the prices of recurring products (the ones with a `billing_period`). */
  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    return this.catalogRows(credentials, params, 'plans', transformPlan)
  }

  /** Reads back a `<product_id>:<price_id>` id: GET /products/{id}, then its prices. */
  private async readPrice(
    credentials: Credentials,
    id: string,
  ): Promise<{ product: RawSolidgateProduct; price: RawSolidgatePrice }> {
    const sep = id.indexOf(':')
    if (sep <= 0 || sep === id.length - 1) {
      throw notFound(`Solidgate price and plan ids are <product_id>:<price_id>; got ${id}`)
    }
    const productId = id.slice(0, sep)
    const priceId = id.slice(sep + 1)
    const client = this.catalog(credentials)
    const product = await client.get<RawSolidgateProduct>(
      `/products/${encodeURIComponent(productId)}`,
    )
    const price = (await this.productPrices(client, productId)).find((p) => p.id === priceId)
    if (!price) throw notFound(`Solidgate product ${productId} has no price ${priceId}`)
    return { product, price }
  }

  async getPrice(credentials: Credentials, id: string): Promise<Price> {
    const { product, price } = await this.readPrice(credentials, id)
    return transformPrice(price, product)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const { product, price } = await this.readPrice(credentials, id)
    const plan = transformPlan(price, product)
    if (!plan) throw notFound(`Solidgate product ${product.id} is not a recurring product`)
    return plan
  }
}
