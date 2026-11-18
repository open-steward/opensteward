/**
 * Stax Payments adapter — payments vertical.
 *
 * Auth: API key (Bearer token). "All API requests should be made to the
 * following base URL: https://apiprod.fattlabs.com" and "All requests must
 * include this key in the `Authorization` header as a Bearer Token."
 * (https://docs.staxpayments.com/reference/overview)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — Stax has no balance-transaction ledger
 *   endpoint; reporting is limited to daily-sales, card-processing, and
 *   statement summary endpoints that do not expose per-entry ledger records.
 * Unavailable: plan — Stax has no plan resource. Its catalog items (GET /item)
 *   carry a price but no billing interval and no currency.
 */

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'
import type { Invoice } from '../../schema/invoice'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Subscription } from '../../schema/subscription'
import type { Plan } from '../../schema/plan'
import type { Dispute } from '../../schema/dispute'
import type { Payout } from '../../schema/payout'

import {
  API_BASE_URL,
  DEFAULT_PAGE_SIZE,
  PAYMENT_METHOD_MAX_PER_PAGE,
  TRANSACTION_MAX_PER_PAGE,
} from './constants'
import { buildCredentials } from './auth'
import { StaxPaymentsClient } from './client'

import { transformCustomer, type RawStaxCustomer } from './transform/customer'
import { transformCharge, type RawStaxTransaction } from './transform/charge'
import { transformRefund, type RawStaxRefund } from './transform/refund'
import { transformInvoice, type RawStaxInvoice } from './transform/invoice'
import { transformPaymentMethod, type RawStaxPaymentMethod } from './transform/payment-method'
import { transformSubscription, type RawStaxSubscription } from './transform/subscription'
import { transformDispute, type RawStaxDispute } from './transform/dispute'
import { transformPayout, type RawStaxDeposit } from './transform/payout'

/** The Laravel paginator envelope Stax wraps its lists in. */
interface StaxPage<R> {
  data?: R[]
  current_page?: number
  last_page?: number
  next_page_url?: string | null
  total?: number
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * Whether a Laravel page has a successor: `next_page_url`, else
 * `current_page < last_page`. An envelope with neither signal proves
 * nothing, so it yields `undefined` and no hasMore is reported.
 */
function staxHasMore(res: StaxPage<unknown>, page: number): boolean | undefined {
  if (res.next_page_url !== undefined) return res.next_page_url !== null
  if (typeof res.last_page === 'number') return (res.current_page ?? page) < res.last_page
  return undefined
}

interface StaxPageOptions {
  /** The endpoint's documented per_page ceiling, if it has one. */
  maxPerPage?: number
  /** The documented page-size parameter: `per_page`, or `limit` on /invoice/schedule. */
  sizeParam?: 'per_page' | 'limit'
  /** Documented filters sent with every page (e.g. `type` on /transaction). */
  filters?: Record<string, string>
}

/**
 * One caller page of a Stax page-number list, sent as `page` and the
 * endpoint's documented size parameter. One upstream page is one caller page:
 * the end comes from the envelope's `next_page_url`, the total from `total`.
 *
 * A caller limit above the documented ceiling is sent as the ceiling and
 * reported as `pageSize`, so the router and the sync worker judge (and
 * number) the pages at that size.
 */
async function staxPage<R>(
  client: StaxPaymentsClient,
  path: string,
  params: QueryParams,
  options: StaxPageOptions = {},
): Promise<R[]> {
  const page = params.page ?? 1
  const limit = params.limit ?? DEFAULT_PAGE_SIZE
  const perPage = options.maxPerPage === undefined ? limit : Math.min(limit, options.maxPerPage)
  const res = await client.get<StaxPage<R>>(path, {
    ...options.filters,
    page,
    [options.sizeParam ?? 'per_page']: perPage,
  })
  const hasMore = staxHasMore(res, page)
  reportUpstreamPage(params, {
    ...(hasMore === undefined ? {} : { hasMore }),
    ...(typeof res.total === 'number' ? { totalCount: res.total } : {}),
    ...(perPage < limit ? { pageSize: perPage } : {}),
  })
  return res.data ?? []
}

/**
 * The connected merchant's currency, from GET /self: its `merchant.currency`
 * is an array (`"currency": ["USD"]`,
 * https://docs.staxpayments.com/reference/get-self-and-teams-info).
 * Invoices, disputes and deposits carry no currency of their own, and a
 * transaction's `currency` may be null. A merchant with other than exactly
 * one currency cannot say which one such a record is in, so that throws.
 */
async function merchantCurrency(client: StaxPaymentsClient): Promise<string> {
  const res = await client.get<{ merchant?: { currency?: unknown } }>('/self')
  const list = res.merchant?.currency
  if (!Array.isArray(list) || list.length !== 1 || typeof list[0] !== 'string') {
    throw new Error(
      `Stax Payments: the merchant's currency (GET /self merchant.currency) is not a single code: ${JSON.stringify(list)}`,
    )
  }
  return list[0]
}

/** A transaction's own `currency`, else the merchant's (fetched at most once per call). */
function transactionCurrencies(
  client: StaxPaymentsClient,
): (raw: RawStaxTransaction) => Promise<string> {
  let merchant: Promise<string> | undefined
  return async (raw) => {
    if (typeof raw.currency === 'string' && raw.currency !== '') return raw.currency
    merchant ??= merchantCurrency(client)
    return merchant
  }
}

/** Midnight UTC of the day `d` falls in, as epoch milliseconds. */
function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

const DAY_MS = 86_400_000

/** `YYYY-MM-DD` of a UTC midnight. */
function ymd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export class StaxPaymentsAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'stax-payments'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Stax Payments uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Stax Payments uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): StaxPaymentsClient {
    return new StaxPaymentsClient(credentials)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  /**
   * GET /customer (find-all-customers). The page documents filters and sort
   * only, no page or size parameter, but its response is a paginator
   * ("per_page": 50, next_page_url). So the walk follows the documented
   * `next_page_url` and cuts the caller's rows out with pageByRows. The URL
   * is followed only while it stays on the documented host and path.
   */
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope('stax-payments', credentials), 'customer', {})
    const prefix = `${API_BASE_URL}/customer?`
    const res = await pageByRows<Customer>(
      key,
      params,
      async (cursor) => {
        const page = await client.get<StaxPage<RawStaxCustomer>>(cursor ?? '/customer')
        const next = page.next_page_url
        if (typeof next === 'string' && !next.startsWith(prefix)) {
          throw new Error(`Stax Payments: refusing to follow next_page_url off ${prefix}: ${next}`)
        }
        return {
          items: (page.data ?? []).map(transformCustomer),
          next: typeof next === 'string' ? next : undefined,
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return res.items
  }

  /** GET /customer/{id} returns the customer object itself (get-a-customers-information). */
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawStaxCustomer>(
      `/customer/${encodeURIComponent(id)}`,
    )
    return transformCustomer(res)
  }

  // ── Charges and refunds (transactions) ────────────────────────────────────

  /**
   * GET /transaction?type=charge. "Filter by transaction type (e.g., charge,
   * refund, void)." and "Use `page` and `per_page` to control the pagination
   * of results." per_page: "(min: 1, max: 200)".
   */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const client = this.client(credentials)
    const rows = await staxPage<RawStaxTransaction>(client, '/transaction', params, {
      maxPerPage: TRANSACTION_MAX_PER_PAGE,
      filters: { type: 'charge' },
    })
    const currencyOf = transactionCurrencies(client)
    const out: Charge[] = []
    for (const raw of rows) out.push(transformCharge(raw, await currencyOf(raw)))
    return out
  }

  /** GET /transaction/{id} returns the transaction object itself (get-a-transactions-information). */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const client = this.client(credentials)
    const raw = await client.get<RawStaxTransaction>(`/transaction/${encodeURIComponent(id)}`)
    return transformCharge(raw, await transactionCurrencies(client)(raw))
  }

  /** GET /transaction?type=refund: a refund is a child transaction of type refund. */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const client = this.client(credentials)
    const rows = await staxPage<RawStaxRefund>(client, '/transaction', params, {
      maxPerPage: TRANSACTION_MAX_PER_PAGE,
      filters: { type: 'refund' },
    })
    const currencyOf = transactionCurrencies(client)
    const out: Refund[] = []
    for (const raw of rows) out.push(transformRefund(raw, await currencyOf(raw)))
    return out
  }

  /**
   * Write path, out of scope for the read rebuild: POST /refunds is not in
   * the Stax reference, whose refund call is POST /transaction/{id}/refund.
   */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const client = this.client(credentials)
    const res = await client.post<{ data?: RawStaxRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    const raw = res.data ?? {}
    return transformRefund(raw, await transactionCurrencies(client)(raw))
  }

  // ── Invoices ─────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = this.client(credentials)
    // GET /invoice documents no per_page maximum, so the caller's size is sent as is.
    const rows = await staxPage<RawStaxInvoice>(client, '/invoice', params)
    if (rows.length === 0) return []
    const currency = await merchantCurrency(client)
    return rows.map((r) => transformInvoice(r, currency))
  }

  /** GET /invoice/{id} returns the invoice object itself (get-an-invoice). */
  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = this.client(credentials)
    const raw = await client.get<RawStaxInvoice>(`/invoice/${encodeURIComponent(id)}`)
    return transformInvoice(raw, await merchantCurrency(client))
  }

  // ── Payment Methods ───────────────────────────────────────────────────────

  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    // per_page: "The maximum is 200 and the minimum is 1."
    const rows = await staxPage<RawStaxPaymentMethod>(
      this.client(credentials),
      '/payment-method',
      params,
      { maxPerPage: PAYMENT_METHOD_MAX_PER_PAGE },
    )
    return rows.map(transformPaymentMethod)
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const res = await this.client(credentials).get<{ data?: RawStaxPaymentMethod }>(
      `/payment-method/${id}`,
    )
    return transformPaymentMethod(res.data ?? {})
  }

  // ── Subscriptions (scheduled invoices) ────────────────────────────────────

  /**
   * GET /invoice/schedule (retrieve-all-scheduled-invoices): "Paginate
   * results using the `page` and `limit` parameters." No maximum is documented.
   */
  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const rows = await staxPage<RawStaxSubscription>(
      this.client(credentials),
      '/invoice/schedule',
      params,
      { sizeParam: 'limit' },
    )
    return rows.map(transformSubscription)
  }

  async getSubscription(_credentials: Credentials, _id: string): Promise<Subscription> {
    throw notSupported(
      'Stax Payments cannot read a scheduled invoice by id: the reference documents only PUT and DELETE on /invoice/schedule/{id}.',
    )
  }

  // ── Plans ─────────────────────────────────────────────────────────────────

  async listPlans(_credentials: Credentials, _params: QueryParams): Promise<Plan[]> {
    throw notSupported(
      'Stax Payments cannot list plans: it has no plan resource, and its catalog items (GET /item) carry a price but no billing interval or currency.',
    )
  }

  async getPlan(_credentials: Credentials, _id: string): Promise<Plan> {
    throw notSupported(
      'Stax Payments cannot read a plan: it has no plan resource, and its catalog items (GET /item) carry a price but no billing interval or currency.',
    )
  }

  // ── Disputes ──────────────────────────────────────────────────────────────

  /**
   * GET /underwriting/disputes (list-disputes): "returns paginated data with
   * 10 results per page"; `page`: "Each page returns up to 10 results." The
   * size is fixed, so the caller's rows are cut out with pageByRows.
   */
  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    const client = this.client(credentials)
    let currency: Promise<string> | undefined
    const key = cursorPagerKey(connectionScope('stax-payments', credentials), 'dispute', {})
    const res = await pageByRows<Dispute, number>(
      key,
      params,
      async (cursor) => {
        const page = cursor ?? 1
        const body = await client.get<StaxPage<RawStaxDispute>>('/underwriting/disputes', { page })
        const rows = body.data ?? []
        let items: Dispute[] = []
        if (rows.length > 0) {
          currency ??= merchantCurrency(client)
          const c = await currency
          items = rows.map((r) => transformDispute(r, c))
        }
        return { items, next: staxHasMore(body, page) === true ? page + 1 : undefined }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return res.items
  }

  /** GET /underwriting/disputes?id= — `id`: "Filters results by the dispute id." */
  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const client = this.client(credentials)
    const body = await client.get<StaxPage<RawStaxDispute>>('/underwriting/disputes', { id })
    const raw = (body.data ?? []).find((r) => r.id === id)
    if (!raw) {
      throw Object.assign(new Error(`Stax Payments dispute ${id} not found`), { statusCode: 404 })
    }
    return transformDispute(raw, await merchantCurrency(client))
  }

  // ── Payouts (deposits) ────────────────────────────────────────────────────

  /**
   * GET /query/deposit (get-list-of-deposits) requires `startDate` and
   * `endDate` ("(YYYY-MM-DD HH:mm:ss)") and documents no paging parameter
   * and no retention limit. So an unfiltered list is refused, and a list
   * with `updatedAfter` walks one UTC calendar day per request, newest
   * first, from today back to updatedAfter's day. Stax "defaults to UTC time
   * if no timezone is specified", so no timezone is sent.
   */
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const after = params.updatedAfter
    if (!(after instanceof Date) || Number.isNaN(after.getTime())) {
      throw notSupported(
        'Stax Payments cannot list deposits without a date window: GET /query/deposit requires startDate and endDate, and Stax documents no retention limit to bound it. Pass updatedAfter.',
      )
    }
    const client = this.client(credentials)
    const today = utcDay(new Date())
    const lowest = Math.min(utcDay(after), today)
    let currency: Promise<string> | undefined
    const key = cursorPagerKey(connectionScope('stax-payments', credentials), 'deposit', {
      from: ymd(lowest),
      to: ymd(today),
    })
    const res = await pageByRows<Payout, number>(
      key,
      params,
      async (cursor) => {
        const k = cursor ?? 0
        const day = today - k * DAY_MS
        const body = await client.get<{ data?: RawStaxDeposit[] }>('/query/deposit', {
          startDate: `${ymd(day)} 00:00:00`,
          endDate: `${ymd(day)} 23:59:59`,
        })
        const rows = body.data ?? []
        let items: Payout[] = []
        if (rows.length > 0) {
          currency ??= merchantCurrency(client)
          const c = await currency
          items = rows.map((r) => transformPayout(r, c))
        }
        return { items, next: day > lowest ? k + 1 : undefined }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE, maxUpstreamPages: 10_000 },
    )
    return res.items
  }

  async getPayout(_credentials: Credentials, _id: string): Promise<Payout> {
    throw notSupported(
      'Stax Payments cannot read a deposit by id: GET /query/depositDetail lists the transactions in a batch within a date range, not the deposit itself.',
    )
  }
}
