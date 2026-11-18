/**
 * Tap Payments adapter — payments vertical (MENA anchor).
 *
 * Tap is the leading payment gateway across the GCC (UAE, Saudi Arabia,
 * Kuwait, Bahrain, Qatar, Oman, Egypt). Methods: cards (Visa / Mastercard /
 * mada / Amex), Apple Pay, Google Pay, KNET, benefit, Fawry, and local wallets.
 * Settlement currencies are mostly the GCC fils currencies (AED/SAR/KWD/…).
 *
 * Auth: static secret API key (sk_test_… / sk_live_…) sent as a Bearer token;
 * mode is implied by the key prefix. Submitted via the Connect Link form.
 *
 * Resources Tap exposes (and we implement): Customers, Charges, Refunds,
 * Payment Methods (saved cards via /v2/card/{customer_id}), Invoices, Payouts.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — Tap has no balance/ledger transaction API; settlement data is only available via payout report CSV download
 * Unavailable: dispute — Tap exposes disputes only as a sheet inside payout report CSV downloads; no REST list/retrieve endpoint exists
 * Unavailable: subscription — Tap has no dedicated subscriptions endpoint; recurring payments are implemented as standard charges with a payment_agreement param
 * Unavailable: plan — Tap has no plan/price/product catalog API
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  reportUpstreamPage,
  type BaseAdapter,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Invoice } from '../../schema/invoice'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { TAP_CREDENTIAL_FORM } from './auth'
import { TapPaymentsClient } from './client'
import { parseTapPaymentsWebhookEvents, verifyTapPaymentsWebhook } from './webhook'

import { transformCustomer, type RawTapCustomer } from './transform/customer'
import { transformCharge, type RawTapCharge } from './transform/charge'
import { transformInvoice, type RawTapInvoice } from './transform/invoice'
import { transformPaymentMethod, type RawTapCard } from './transform/payment-method'
import { transformPayout, type RawTapPayout } from './transform/payout'
import { transformRefund, type RawTapRefund } from './transform/refund'
import { toMajorUnits } from './transform/shared'

/** Tap list endpoints return a resource-keyed envelope with cursor paging. */
interface TapListEnvelope {
  object?: string
  live_mode?: boolean
  count?: number
  has_more?: boolean
  api_version?: string
}
type TapList<K extends string, T> = TapListEnvelope & { [P in K]?: T[] }

function clampLimit(params: QueryParams): number {
  const requested = params.limit ?? DEFAULT_PAGE_SIZE
  return Math.min(Math.max(1, requested), MAX_PAGE_SIZE)
}

/**
 * The page size sent to Tap, reported when it is below the caller's limit (a
 * direct call past Tap's maximum of 50) so short-page judgements use it.
 */
function sentPageSize(params: QueryParams): number {
  const size = clampLimit(params)
  if (typeof params.limit === 'number' && size < params.limit) {
    reportUpstreamPage(params, { pageSize: size })
  }
  return size
}

const DAY_MS = 86_400_000

/** Epoch ms of the first instant of the UTC month holding `ms`, shifted by `months`. */
function utcMonth(ms: number, months = 0): number {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1)
}

/** Epoch ms of the first instant of the UTC day holding `ms`. */
function utcDay(ms: number): number {
  return ms - (((ms % DAY_MS) + DAY_MS) % DAY_MS)
}

/** The caller's 1-based page. */
function callerPage(params: QueryParams): number {
  const page = Math.floor(Number(params.page))
  return Number.isFinite(page) && page > 1 ? page : 1
}

/**
 * A page-number list's end: `has_more` when the envelope carries it (the
 * customer and invoice references document no response shape), else only a
 * short page is known to be the last.
 */
function reportPageNumberEnd(
  params: QueryParams,
  res: TapListEnvelope,
  rows: number,
  size: number,
): void {
  if (typeof res.has_more === 'boolean') reportUpstreamPage(params, { hasMore: res.has_more })
  else if (rows < size) reportUpstreamPage(params, { hasMore: false })
}

export class TapPaymentsAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'tap-payments'
  readonly version = '0.1.0'

  /** clampLimit caps every list at Tap's maximum of 50; the router and the sync worker ask for no more. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('Tap Payments uses a secret API key; submit it via the Connect Link form.')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Tap Payments uses a secret API key; call exchangeCredentials instead.')
  }

  // api_key model — delegate the form + exchange to the shared simpleApiKey template.
  credentialFields = TAP_CREDENTIAL_FORM.credentialFields
  exchangeCredentials = TAP_CREDENTIAL_FORM.exchangeCredentials

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static key — nothing to refresh.
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyTapPaymentsWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseTapPaymentsWebhookEvents(payload)
  }

  private client(credentials: Credentials): TapPaymentsClient {
    return new TapPaymentsClient(credentials)
  }

  /**
   * One caller page of a cursor list (charges, refunds). Tap documents
   * `starting_after` — "takes a charge ID that determines your position in
   * the list" — and `has_more` on the envelope, so one Tap page is one caller
   * page and the next page starts after the last row's id. A caller that
   * passes `cursor` itself gets exactly that Tap page.
   */
  private async listByCursor<K extends string, R extends { id?: string }>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    key: K,
  ): Promise<R[]> {
    const client = this.client(credentials)
    const limit = sentPageSize(params)
    if (params.cursor) {
      const res = await client.post<TapList<K, R>>(path, { limit, starting_after: params.cursor })
      if (typeof res.has_more === 'boolean') reportUpstreamPage(params, { hasMore: res.has_more })
      return res[key] ?? []
    }
    const { items, hasMore } = await pageByCursor<R>(
      cursorPagerKey(connectionScope('tap-payments', credentials), key, { limit }),
      callerPage(params),
      async (cursor) => {
        const res = await client.post<TapList<K, R>>(path, {
          limit,
          ...(cursor ? { starting_after: cursor } : {}),
        })
        const rows = res[key] ?? []
        const lastId = rows[rows.length - 1]?.id
        return { items: rows, next: res.has_more === true && lastId ? String(lastId) : null }
      },
    )
    reportUpstreamPage(params, { hasMore })
    return items
  }

  // ── Customers ──────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    // The customer-list body documents `page` (default "1", so 1-based) and
    // `limit` beside `starting_after`; the caller's page maps straight across.
    const limit = sentPageSize(params)
    const res = await this.client(credentials).post<TapList<'customers', RawTapCustomer>>(
      '/customers/list',
      params.cursor
        ? { limit, starting_after: params.cursor }
        : { limit, page: callerPage(params) },
    )
    const rows = res.customers ?? []
    reportPageNumberEnd(params, res, rows.length, limit)
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawTapCustomer>(`/customers/${id}`)
    return transformCustomer(res ?? {})
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const [firstName, ...rest] = (data.name ?? '').trim().split(/\s+/).filter(Boolean)
    const res = await this.client(credentials).post<RawTapCustomer>('/customers', {
      first_name: firstName,
      last_name: rest.length ? rest.join(' ') : undefined,
      email: data.email ?? undefined,
      currency: data.currency ?? undefined,
      description: data.description ?? undefined,
    })
    return transformCustomer(res ?? {})
  }

  // ── Charges ────────────────────────────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.listByCursor<'charges', RawTapCharge>(
      credentials,
      params,
      '/charges/list',
      'charges',
    )
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawTapCharge>(`/charges/${id}`)
    return transformCharge(res ?? {})
  }

  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number; currency?: string },
  ): Promise<Charge> {
    // Tap captures an authorization by creating a charge with the authorize id
    // in source.id. Amount (if provided) must be a decimal major-unit value.
    const majorAmount = data?.amount != null ? toMajorUnits(data.amount, data?.currency) : undefined
    const res = await this.client(credentials).post<RawTapCharge>('/charges', {
      source: { id },
      ...(majorAmount != null ? { amount: majorAmount, currency: data?.currency } : {}),
    })
    return transformCharge(res ?? {})
  }

  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    // Tap voids an authorization via a dedicated void sub-resource.
    const res = await this.client(credentials).post<RawTapCharge>(`/authorize/${id}/void`, {})
    return transformCharge(res ?? {})
  }

  // ── Refunds ────────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const rows = await this.listByCursor<'refunds', RawTapRefund>(
      credentials,
      params,
      '/refunds/list',
      'refunds',
    )
    return rows.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<RawTapRefund>(`/refunds/${id}`)
    return transformRefund(res ?? {})
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId is required for a Tap Payments refund.')
    // data.amount is canonical INTEGER minor units; Tap expects DECIMAL major units.
    const majorAmount = toMajorUnits(data.amount, data.currency)
    const res = await this.client(credentials).post<RawTapRefund>('/refunds', {
      charge_id: data.chargeId,
      amount: majorAmount,
      currency: data.currency,
      reason: data.reason ?? 'requested_by_customer',
    })
    return transformRefund(res ?? {})
  }

  // ── Payment Methods (saved cards) ─────────────────────────────────────────
  // Cards are scoped to a customer. GET /v2/card/{customer_id} lists cards;
  // GET /v2/card/{customer_id}/{card_id} retrieves one.

  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    // Tap requires a customer_id to list cards; without it we cannot list globally.
    // When params.customerId is not provided we return an empty list rather than throw.
    const customerId = (params as Record<string, unknown>).customerId as string | undefined
    if (!customerId) return []
    const res = await this.client(credentials).get<{ cards?: RawTapCard[] }>(
      `/card/${customerId}`,
      {
        limit: clampLimit(params),
        ...(params.cursor ? { starting_after: params.cursor } : {}),
      },
    )
    return (res.cards ?? []).map(transformPaymentMethod)
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    // id is expected as "{customer_id}/{card_id}" for single-card retrieval.
    const res = await this.client(credentials).get<RawTapCard>(`/card/${id}`)
    return transformPaymentMethod(res ?? {})
  }

  // ── Invoices ───────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    // The invoice-list body documents `page` (int32, default "0") and `limit`
    // ("Maximum: 50"), and no `starting_after`. A 0 default reads as 0-based,
    // so caller page N is Tap page N-1. Were Tap 1-based, the worst case is a
    // repeated first page; the reverse mapping would silently skip one.
    const limit = sentPageSize(params)
    const res = await this.client(credentials).post<TapList<'invoices', RawTapInvoice>>(
      '/invoices/list',
      params.cursor
        ? { limit, starting_after: params.cursor }
        : { limit, page: callerPage(params) - 1 },
    )
    const rows = res.invoices ?? []
    reportPageNumberEnd(params, res, rows.length, limit)
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).get<RawTapInvoice>(`/invoices/${id}`)
    return transformInvoice(res ?? {})
  }

  // ── Payouts ────────────────────────────────────────────────────────────────

  /**
   * POST /v2/payouts/list, walked in UTC date windows, newest first.
   *
   * The body documents `period.date.from` / `period.date.to` ("Required date
   * range for the payouts list", "Measured in Unix Epoch Timestamp
   * (milliseconds)"), `merchants`, `payouts.payout_id`, `order_by` and
   * `limit` ("The maximum number of payouts to return in a single call.
   * Default: 25; Maximum: 50."), and the response `has_more`. There is no
   * `page` and no `starting_after`, so nothing reaches past the first 50 rows
   * of one window. https://developers.tap.company/reference/list-payouts.md
   *
   * Tap documents no retention or lookback limit to walk back to, so a call
   * without `updatedAfter` is refused. With it, windows run from the current
   * UTC month back to the month holding `updatedAfter`, whose window starts at
   * `updatedAfter` itself ("Specify the date range for this specific month in
   * your request parameters",
   * https://developers.tap.company/docs/reports-concepts.md). A month whose
   * first 50 rows are not all of it (`has_more`) is walked again one UTC day
   * at a time; a day that still overflows throws rather than drop rows. Both
   * window bounds are sent as inclusive epoch ms.
   */
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    if (!params.updatedAfter) {
      throw Object.assign(
        new Error(
          'Tap Payments cannot list payouts without updated_after: POST /v2/payouts/list takes a ' +
            '"Required date range for the payouts list" (period.date.from/to) and Tap documents ' +
            'no retention limit to walk back to. Pass updated_after to bound the walk.',
        ),
        { statusCode: 501, code: 'NOT_SUPPORTED' },
      )
    }
    const floor = params.updatedAfter.getTime()
    const oldestMonth = utcMonth(floor)
    const floorDay = utcDay(floor)
    const newestMonth = utcMonth(Date.now())
    const client = this.client(credentials)
    const window = async (from: number, to: number): Promise<TapList<'payouts', RawTapPayout>> =>
      client.post<TapList<'payouts', RawTapPayout>>('/payouts/list', {
        period: { date: { from: String(Math.max(from, floor)), to: String(to) } },
        limit: MAX_PAGE_SIZE,
      })
    const beforeMonth = (monthStart: number): string | undefined =>
      monthStart > oldestMonth ? `m:${utcMonth(monthStart, -1)}` : undefined
    const { items } = await pageByRows<Payout>(
      cursorPagerKey(connectionScope('tap-payments', credentials), 'payouts', {
        from: floor,
        newest: newestMonth,
      }),
      params,
      async (cursor) => {
        const [kind, text] = (cursor ?? `m:${newestMonth}`).split(':')
        const start = Number(text)
        if (kind === 'm') {
          const end = utcMonth(start, 1) - 1
          const res = await window(start, end)
          // More than one window's worth: walk this month again by UTC day.
          if (res.has_more === true) return { items: [], next: `d:${utcDay(end)}` }
          return { items: (res.payouts ?? []).map(transformPayout), next: beforeMonth(start) }
        }
        const res = await window(start, start + DAY_MS - 1)
        if (res.has_more === true) {
          throw new Error(
            `Tap Payments returned more than ${MAX_PAGE_SIZE} payouts for UTC day ` +
              `${new Date(start).toISOString().slice(0, 10)}, and POST /v2/payouts/list documents ` +
              'no page or cursor parameter to reach the rest.',
          )
        }
        const monthStart = utcMonth(start)
        const next =
          start > monthStart && start > floorDay ? `d:${start - DAY_MS}` : beforeMonth(monthStart)
        return { items: (res.payouts ?? []).map(transformPayout), next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  /**
   * Retrieve a Payout is POST /v2/payouts/list/ with `payouts.payout_id`
   * ("The specific payout ID you want to retrieve"); Tap documents no GET by
   * id. https://developers.tap.company/reference/retrieve-a-payout.md
   */
  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).post<TapList<'payouts', RawTapPayout>>(
      '/payouts/list',
      { payouts: { payout_id: [id] } },
    )
    const row = (res.payouts ?? []).find((p) => p.id === id)
    if (!row) {
      throw Object.assign(new Error(`Tap Payments payout ${id} not found`), { statusCode: 404 })
    }
    return transformPayout(row)
  }
}
