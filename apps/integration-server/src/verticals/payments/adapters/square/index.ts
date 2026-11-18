/**
 * Square adapter — payments vertical.
 *
 * OAuth 2.0 (authorisation-code) against the Square Connect API. Coverage:
 * payments, refunds, customers, cards (payment methods), invoices + line
 * items, subscriptions + plans, payouts, disputes.
 */

import { randomUUID } from 'node:crypto'
import type {
  BaseAdapter,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Customer } from '../../schema/customer'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Invoice, InvoiceLineItem } from '../../schema/invoice'
import type { Subscription } from '../../schema/subscription'
import type { Plan } from '../../schema/plan'
import type { Payout } from '../../schema/payout'
import type { Dispute } from '../../schema/dispute'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { WebhookEvent } from '../../schema/webhook'

import {
  API_BASE_URL,
  CATALOG_MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SCOPES,
  INVOICES_MAX_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './constants'
import {
  buildAuthUrl,
  exchangeCode as squareExchangeCode,
  refreshCredentials as squareRefresh,
} from './auth'
import { SquareClient } from './client'
import { parseSquareWebhookEvents, verifySquareWebhook } from './webhook'

import { transformCustomer, type RawSquareCustomer } from './transform/customer'
import { transformPaymentMethod, type RawSquareCard } from './transform/payment-method'
import { transformCharge, type RawSquarePayment } from './transform/charge'
import { transformRefund, type RawSquareRefund } from './transform/refund'
import { transformInvoice, type RawSquareInvoice } from './transform/invoice'
import {
  transformInvoiceLineItem,
  type RawSquarePaymentRequest,
} from './transform/invoice-line-item'
import { transformSubscription, type RawSquareSubscription } from './transform/subscription'
import { transformPlan, type RawSquareCatalogObject } from './transform/plan'
import { transformPayout, type RawSquarePayout } from './transform/payout'
import { transformDispute, type RawSquareDispute } from './transform/dispute'
import {
  transformBalanceTransaction,
  type RawSquarePayoutEntry,
} from './transform/balance-transaction'

/**
 * Pager scope for ONE connection: the seller's merchant id (from the token
 * exchange) plus a fingerprint of the connection's token.
 */
function scope(credentials: Credentials): string {
  const merchant = credentials.extra?.['merchantId']
  const account = typeof merchant === 'string' && merchant !== '' ? merchant : API_BASE_URL
  return connectionScope(`square:${account}`, credentials)
}

/** The caller's page size, within [1, `max`]. A missing or unusable limit is the default page. */
function upstreamSize(params: QueryParams, max: number): number {
  const asked = Number(params.limit)
  const size = Number.isFinite(asked) && asked >= 1 ? Math.floor(asked) : DEFAULT_PAGE_SIZE
  return Math.min(size, max)
}

/**
 * The `limit` one cursor request sends: the caller's, capped at the
 * endpoint's maximum. When capped, the size actually sent is reported so
 * every short-page judgement uses it.
 */
function cappedSize(params: QueryParams, max: number): number {
  const size = upstreamSize(params, max)
  const asked = Number(params.limit)
  if (Number.isFinite(asked) && size < Math.floor(asked))
    reportUpstreamPage(params, { pageSize: size })
  return size
}

/** A response `cursor`: "If empty, this is the final response." */
function nextCursor(cursor: unknown): string | undefined {
  return typeof cursor === 'string' && cursor !== '' ? cursor : undefined
}

/** `query` plus `cursor` when there is one. */
function withCursor(
  query: Record<string, unknown>,
  cursor: string | undefined,
): Record<string, unknown> {
  return cursor === undefined ? query : { ...query, cursor }
}

/**
 * A position in the balance-transaction stream: either a page of payouts
 * still to fetch, or one payout's entries at an entries cursor, carrying the
 * rest of its payouts page and the cursor of the payouts page after it.
 */
type EntriesCursor =
  | { kind: 'payouts'; cursor?: string }
  | { kind: 'entries'; ids: string[]; i: number; cursor?: string; payoutsNext?: string }

export interface SquareAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class SquareAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'square'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: SquareAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string): Promise<Credentials> {
    return squareExchangeCode(code, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return squareRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySquareWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSquareWebhookEvents(payload)
  }

  private client(credentials: Credentials): SquareClient {
    return new SquareClient(credentials)
  }

  /**
   * One caller page of a cursor-paged GET list whose `limit` sizes the page
   * and never returns more rows than asked: page N is upstream page N of the
   * `cursor` chain, sized min(limit, `max`), and `hasMore` is the presence of
   * the response `cursor` (a short page is not the end: "It is possible to
   * receive fewer results than the specified limit on a given page").
   */
  private async cursorList<R>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    field: string,
    max: number,
    filters: Record<string, unknown> = {},
  ): Promise<R[]> {
    const client = this.client(credentials)
    const size = cappedSize(params, max)
    const key = cursorPagerKey(scope(credentials), path, { ...filters, limit: size })
    const { items, hasMore } = await pageByCursor<R>(key, params.page, async (cursor) => {
      const res = await client.get<Record<string, unknown>>(
        path,
        withCursor({ ...filters, limit: size }, cursor),
      )
      return { items: (res[field] as R[] | undefined) ?? [], next: nextCursor(res['cursor']) }
    })
    reportUpstreamPage(params, { hasMore })
    return items
  }

  // ── Charges ──────────────────────────────────────────────────────────────

  /** GET /v2/payments: `cursor` + `limit` (max 100; over it the default is used). */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.cursorList<RawSquarePayment>(
      credentials,
      params,
      '/payments',
      'payments',
      MAX_PAGE_SIZE,
    )
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<{ payment: RawSquarePayment }>(`/payments/${id}`)
    return transformCharge(res.payment)
  }

  // ── Refunds ──────────────────────────────────────────────────────────────

  /** GET /v2/refunds: `cursor` + `limit` ("greater than 100, no more than 100 results"). */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const rows = await this.cursorList<RawSquareRefund>(
      credentials,
      params,
      '/refunds',
      'refunds',
      MAX_PAGE_SIZE,
    )
    return rows.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<{ refund: RawSquareRefund }>(`/refunds/${id}`)
    return transformRefund(res.refund)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ refund: RawSquareRefund }>('/refunds', {
      idempotency_key: randomUUID(),
      amount_money: { amount: data.amount ?? 0, currency: (data.currency ?? 'USD').toUpperCase() },
      payment_id: data.chargeId,
      reason: data.reason,
    })
    return transformRefund(res.refund)
  }

  // ── Customers ────────────────────────────────────────────────────────────

  /**
   * GET /v2/customers: `cursor` + `limit`. Over 100 is a 400 VALUE_TOO_HIGH,
   * and "This limit is advisory. The response might contain more or fewer
   * results." A page can hold more rows than asked, so fixed 100-row
   * upstream pages (the maximum) are re-cut into the caller's pages with
   * pageByRows, `hasMore` from the cursor.
   */
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const client = this.client(credentials)
    const size = MAX_PAGE_SIZE
    const key = cursorPagerKey(scope(credentials), 'customers', { limit: size })
    const { items } = await pageByRows<RawSquareCustomer>(
      key,
      params,
      async (cursor) => {
        const res = await client.get<{ customers?: RawSquareCustomer[]; cursor?: string }>(
          '/customers',
          withCursor({ limit: size }, cursor),
        )
        return { items: res.customers ?? [], next: nextCursor(res.cursor) }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ customer: RawSquareCustomer }>(`/customers/${id}`)
    return transformCustomer(res.customer)
  }

  // ── Payment methods (cards) ──────────────────────────────────────────────

  /**
   * GET /v2/cards: `cursor` only, no size parameter ("A max of 25 cards will
   * be returned."), so upstream pages are re-cut into the caller's pages with
   * pageByRows, `hasMore` from the cursor.
   */
  async listPaymentMethods(credentials: Credentials, params: QueryParams): Promise<PaymentMethod[]> {
    const customerId = (params['customer_id'] ?? params['customer']) as string | undefined
    const client = this.client(credentials)
    const key = cursorPagerKey(scope(credentials), 'cards', { customer_id: customerId })
    const { items } = await pageByRows<RawSquareCard>(
      key,
      params,
      async (cursor) => {
        const res = await client.get<{ cards?: RawSquareCard[]; cursor?: string }>(
          '/cards',
          withCursor({ customer_id: customerId }, cursor),
        )
        return { items: res.cards ?? [], next: nextCursor(res.cursor) }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items.map(transformPaymentMethod)
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const res = await this.client(credentials).get<{ card: RawSquareCard }>(`/cards/${id}`)
    return transformPaymentMethod(res.card)
  }

  // ── Invoices + line items ────────────────────────────────────────────────

  /** GET /v2/invoices: `location_id` + `cursor` + `limit` ("200 is the maximum `limit`"). */
  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const locationId = (params['location_id'] ?? params['location']) as string | undefined
    const rows = await this.cursorList<RawSquareInvoice>(
      credentials,
      params,
      '/invoices',
      'invoices',
      INVOICES_MAX_PAGE_SIZE,
      { location_id: locationId },
    )
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).get<{ invoice: RawSquareInvoice }>(`/invoices/${id}`)
    return transformInvoice(res.invoice)
  }

  async listInvoiceLineItems(
    credentials: Credentials,
    invoiceId: string,
    _params: QueryParams,
  ): Promise<InvoiceLineItem[]> {
    const res = await this.client(credentials).get<{ invoice: RawSquareInvoice }>(
      `/invoices/${invoiceId}`,
    )
    const reqs: RawSquarePaymentRequest[] = res.invoice.payment_requests ?? []
    return reqs.map((r) => transformInvoiceLineItem(r, invoiceId))
  }

  // ── Subscriptions + plans ────────────────────────────────────────────────

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<{ subscription: RawSquareSubscription }>(
      `/subscriptions/${id}`,
    )
    return transformSubscription(res.subscription)
  }

  async listSubscriptions(_credentials: Credentials, _params: QueryParams): Promise<Subscription[]> {
    // Square requires a `SearchSubscriptions` POST with at least a
    // location_id filter. v1 leaves this to webhook-driven sync.
    return []
  }

  /**
   * POST /v2/catalog/search: body `cursor` + `limit` (max 1,000). "The limit
   * is advisory - the implementation may return more or fewer results", so
   * upstream pages are re-cut into the caller's pages with pageByRows,
   * `hasMore` from the cursor.
   */
  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const client = this.client(credentials)
    const size = upstreamSize(params, CATALOG_MAX_PAGE_SIZE)
    const key = cursorPagerKey(scope(credentials), 'catalog/SUBSCRIPTION_PLAN', { limit: size })
    const { items } = await pageByRows<RawSquareCatalogObject>(
      key,
      params,
      async (cursor) => {
        const res = await client.post<{ objects?: RawSquareCatalogObject[]; cursor?: string }>(
          '/catalog/search',
          withCursor({ object_types: ['SUBSCRIPTION_PLAN'], limit: size }, cursor),
        )
        return { items: res.objects ?? [], next: nextCursor(res.cursor) }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items.map(transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const res = await this.client(credentials).get<{ object: RawSquareCatalogObject }>(
      `/catalog/object/${id}`,
    )
    return transformPlan(res.object)
  }

  // ── Payouts ──────────────────────────────────────────────────────────────

  /** GET /v2/payouts: `cursor` + `limit` (max 100; over it the default is used). */
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const rows = await this.cursorList<RawSquarePayout>(
      credentials,
      params,
      '/payouts',
      'payouts',
      MAX_PAGE_SIZE,
    )
    return rows.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<{ payout: RawSquarePayout }>(`/payouts/${id}`)
    return transformPayout(res.payout)
  }

  // ── Disputes ─────────────────────────────────────────────────────────────

  /**
   * GET /v2/disputes: `cursor` only; no size parameter and no documented page
   * size, so upstream pages are re-cut into the caller's pages with
   * pageByRows, `hasMore` from the cursor.
   */
  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    const client = this.client(credentials)
    const key = cursorPagerKey(scope(credentials), 'disputes', {})
    const { items } = await pageByRows<RawSquareDispute>(
      key,
      params,
      async (cursor) => {
        const res = await client.get<{ disputes?: RawSquareDispute[]; cursor?: string }>(
          '/disputes',
          withCursor({}, cursor),
        )
        return { items: res.disputes ?? [], next: nextCursor(res.cursor) }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items.map(transformDispute)
  }

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const res = await this.client(credentials).get<{ dispute: RawSquareDispute }>(`/disputes/${id}`)
    return transformDispute(res.dispute)
  }

  // ── Balance Transactions (payout entries) ────────────────────────────────

  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    // Square balance transactions are exposed as payout entries: the entries
    // of every payout, in the order GET /v2/payouts lists them, each payout's
    // entries walked by their own `cursor` (GET
    // /v2/payouts/{payout_id}/payout-entries, `limit` max 100). Rows are
    // flattened across parents, so pageByRows cuts the caller's pages.
    const client = this.client(credentials)
    const key = cursorPagerKey(scope(credentials), 'payout-entries', { limit: MAX_PAGE_SIZE })
    const entriesPage = async (
      ids: string[],
      i: number,
      cursor: string | undefined,
      payoutsNext: string | undefined,
    ) => {
      const res = await client.get<{ payout_entries?: RawSquarePayoutEntry[]; cursor?: string }>(
        `/payouts/${ids[i]}/payout-entries`,
        withCursor({ limit: MAX_PAGE_SIZE }, cursor),
      )
      const more = nextCursor(res.cursor)
      let next: EntriesCursor | undefined
      if (more !== undefined) next = { kind: 'entries', ids, i, cursor: more, payoutsNext }
      else if (i + 1 < ids.length) next = { kind: 'entries', ids, i: i + 1, payoutsNext }
      else if (payoutsNext !== undefined) next = { kind: 'payouts', cursor: payoutsNext }
      return { items: res.payout_entries ?? [], next }
    }
    const { items } = await pageByRows<RawSquarePayoutEntry, EntriesCursor>(
      key,
      params,
      async (at) => {
        const pos: EntriesCursor = at ?? { kind: 'payouts' }
        if (pos.kind === 'entries') return entriesPage(pos.ids, pos.i, pos.cursor, pos.payoutsNext)
        const res = await client.get<{ payouts?: RawSquarePayout[]; cursor?: string }>(
          '/payouts',
          withCursor({ limit: MAX_PAGE_SIZE }, pos.cursor),
        )
        const ids = (res.payouts ?? []).flatMap((p) => (p.id ? [p.id] : []))
        const payoutsNext = nextCursor(res.cursor)
        if (ids.length === 0) {
          return {
            items: [],
            next: payoutsNext === undefined ? undefined : { kind: 'payouts', cursor: payoutsNext },
          }
        }
        return entriesPage(ids, 0, undefined, payoutsNext)
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items.map(transformBalanceTransaction)
  }

  async getBalanceTransaction(
    credentials: Credentials,
    id: string,
  ): Promise<BalanceTransaction> {
    // Square does not expose a single payout-entry endpoint; we search across
    // the most recent payout and return the matching entry.
    const payoutsRes = await this.client(credentials).get<{ payouts?: RawSquarePayout[] }>(
      '/payouts',
      { limit: 10 },
    )
    for (const payout of payoutsRes.payouts ?? []) {
      if (!payout.id) continue
      const res = await this.client(credentials).get<{
        payout_entries?: RawSquarePayoutEntry[]
      }>(`/payouts/${payout.id}/payout-entries`, { limit: 200 })
      const found = (res.payout_entries ?? []).find((e) => e.id === id)
      if (found) return transformBalanceTransaction(found)
    }
    throw new Error(`Square balance transaction ${id} not found`)
  }
}
