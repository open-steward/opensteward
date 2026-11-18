/**
 * HitPay adapter — payments vertical (South-East Asia anchor).
 *
 * Singapore-headquartered gateway covering SG, MY, PH, and surrounding SEA
 * markets. Methods: cards, PayNow / QR, GrabPay, GCash, Apple/Google Pay,
 * bank transfers. The public API is built around Payment Requests — a
 * payment-link object that settles into one or more payments.
 *
 * Supported canonical resources:
 *   - charges       → payment requests (`/payment-requests`)
 *   - refunds       → `/refund`
 *   - customers     → `/v1/customers`
 *   - plans         → `/v1/subscription-plan`
 *   - subscriptions → `/v1/recurring-billing`
 *   - payouts       → `/v1/transfers`
 *
 * Auth: single business API key in the `X-BUSINESS-API-KEY` header.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: dispute          — HitPay has no dispute/chargeback REST API; chargebacks are handled via dashboard only.
 * Unavailable: balance-transaction — HitPay's /v1/balances returns wallet totals per currency, not individual ledger transactions.
 * Unverified:  invoice          — HitPay documents a POST /v1/invoices create endpoint but no confirmed GET list/retrieve endpoint was found in public docs.
 * Unverified:  payment-method   — Saved cards are attached via recurring-billing save_card flow, no standalone /payment-methods list endpoint confirmed in public docs.
 */

import type { BaseAdapter, Credentials, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Payout } from '../../schema/payout'
import type { Plan } from '../../schema/plan'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE, PAYMENT_REQUESTS_MAX_PAGE_SIZE } from './constants'
import { credentialFields, exchangeCredentials, resolveEnvironment } from './auth'
import { HitpayClient } from './client'
import { parseHitpayWebhookEvents, verifyHitpayWebhook } from './webhook'

import { transformCharge, type RawHitpayPaymentRequest } from './transform/charge'
import { transformCustomer, type RawHitpayCustomer } from './transform/customer'
import { transformPlan, type RawHitpaySubscriptionPlan } from './transform/plan'
import { transformPayout, type RawHitpayTransfer } from './transform/payout'
import { transformRefund, type RawHitpayRefund } from './transform/refund'
import { transformSubscription, type RawHitpayRecurringBilling } from './transform/subscription'

/**
 * HitPay list responses typically use `{ data: [...] }` envelopes, though
 * some endpoints return bare arrays. Normalise both.
 */
interface HitpayListEnvelope<T> {
  data?: T[]
  meta?: {
    /** Cursor paginator (customers, transfers): starts the next page; null on the last. */
    next_cursor?: string | null
    /** Length-aware paginator (subscription-plan, payment-requests). */
    current_page?: number
    last_page?: number
    total?: number
    /** Both paginators: the page size the server actually served. */
    per_page?: number
  }
}

/**
 * The page size to report: the smaller of what was sent and what the body
 * says it served (`meta.per_page`), when that is below the caller's limit.
 * A silent server-side cap then reaches the router as the real size.
 */
function servedPageSize(limit: number, sent: number, served: unknown): number | undefined {
  const size = typeof served === 'number' && served >= 1 ? Math.min(sent, served) : sent
  return size < limit ? size : undefined
}

/** The caller's page size, or the default when none was given. */
function requestedLimit(params: QueryParams): number {
  const n = Number(params.limit)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_PAGE_SIZE
}

/** The caller's 1-based page. */
function requestedPage(params: QueryParams): number {
  const n = Number(params.page)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

export class HitpayAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'hitpay'
  readonly version = '0.1.0'

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('HitPay uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('HitPay uses an API key; call exchangeCredentials instead.')
  }

  credentialFields = credentialFields
  exchangeCredentials = exchangeCredentials

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyHitpayWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseHitpayWebhookEvents(payload)
  }

  private client(credentials: Credentials): HitpayClient {
    return new HitpayClient(credentials)
  }

  private toList<T>(res: T[] | HitpayListEnvelope<T>): T[] {
    return Array.isArray(res) ? res : (res.data ?? [])
  }

  /**
   * Report a length-aware paginator's end and total. Reported only when the
   * body carries `meta`; otherwise the router judges from a full page.
   */
  private reportLengthAware<T>(
    params: QueryParams,
    res: T[] | HitpayListEnvelope<T>,
    limit: number,
    sent: number,
  ): void {
    const meta = Array.isArray(res) ? undefined : res.meta
    const pageSize = servedPageSize(limit, sent, meta?.per_page)
    const current = meta?.current_page
    const last = meta?.last_page
    reportUpstreamPage(params, {
      ...(typeof current === 'number' && typeof last === 'number'
        ? { hasMore: current < last }
        : {}),
      ...(typeof meta?.total === 'number' ? { totalCount: meta.total } : {}),
      ...(pageSize !== undefined ? { pageSize } : {}),
    })
  }

  /**
   * One page of a cursor-paginated collection (`meta.next_cursor`, sent back
   * as `cursor`), with `per_page` = the caller's limit. One upstream page is
   * one caller page, so the cursor pager walks to `params.page`.
   */
  private async listByCursor<T>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    collection: string,
  ): Promise<T[]> {
    const limit = requestedLimit(params)
    const client = this.client(credentials)
    const key = cursorPagerKey(
      connectionScope(`hitpay:${resolveEnvironment(credentials)}`, credentials),
      collection,
      { limit },
    )
    let served: unknown
    const { items, hasMore } = await pageByCursor<T>(key, params.page, async (cursor) => {
      const res = await client.get<T[] | HitpayListEnvelope<T>>(path, {
        per_page: limit,
        ...(cursor !== undefined ? { cursor } : {}),
      })
      const next = Array.isArray(res) ? undefined : res.meta?.next_cursor
      served = Array.isArray(res) ? undefined : res.meta?.per_page
      return { items: this.toList(res), next: next || undefined }
    })
    const pageSize = servedPageSize(limit, limit, served)
    reportUpstreamPage(params, { hasMore, ...(pageSize !== undefined ? { pageSize } : {}) })
    return items
  }

  // ── Charges (Payment Requests) ────────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    // `per_page` maximum 100, page number in `current_page` ("not `page`").
    // HitPay's own CLI and MCP server send `page` instead, so both carry the
    // same value: whichever the server reads, the window moves. A limit past
    // the maximum pages at 100 and reports that size.
    const limit = requestedLimit(params)
    const perPage = Math.min(limit, PAYMENT_REQUESTS_MAX_PAGE_SIZE)
    const page = requestedPage(params)
    const res = await this.client(credentials).get<
      RawHitpayPaymentRequest[] | HitpayListEnvelope<RawHitpayPaymentRequest>
    >('/payment-requests', { per_page: perPage, current_page: page, page })
    this.reportLengthAware(params, res, limit, perPage)
    return this.toList(res).map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawHitpayPaymentRequest>(
      `/payment-requests/${id}`,
    )
    return transformCharge(res ?? {})
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    if (data.amount == null)
      throw new Error('amount is required to create a HitPay payment request')
    if (!data.currency) throw new Error('currency is required to create a HitPay payment request')
    // Canonical amounts are minor units; HitPay expects a major-unit decimal.
    const amount = (data.amount / 100).toFixed(2)
    const res = await this.client(credentials).post<RawHitpayPaymentRequest>('/payment-requests', {
      amount,
      currency: data.currency.toLowerCase(),
      email: data.receiptEmail ?? undefined,
      purpose: data.description ?? undefined,
      reference_number: data.metadata?.['reference_number'] ?? undefined,
      redirect_url: data.metadata?.['redirect_url'] ?? undefined,
    })
    return transformCharge(res ?? {})
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (HitPay payment_id) is required for a refund')
    const body: Record<string, unknown> = { payment_id: data.chargeId }
    // HitPay refund amount is a major-unit decimal; omit for a full refund.
    if (data.amount != null) body.amount = (data.amount / 100).toFixed(2)
    const res = await this.client(credentials).post<RawHitpayRefund>('/refund', body)
    return transformRefund(res ?? {})
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await this.listByCursor<RawHitpayCustomer>(
      credentials,
      params,
      '/customers',
      'customers',
    )
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawHitpayCustomer>(`/customers/${id}`)
    return transformCustomer(res ?? {})
  }

  // ── Plans (Subscription Plans) ────────────────────────────────────────────

  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    // Length-aware paginator: `page` ("The page index") and `per_page`.
    const limit = requestedLimit(params)
    const res = await this.client(credentials).get<
      RawHitpaySubscriptionPlan[] | HitpayListEnvelope<RawHitpaySubscriptionPlan>
    >('/subscription-plan', { per_page: limit, page: requestedPage(params) })
    this.reportLengthAware(params, res, limit, limit)
    return this.toList(res).map(transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const res = await this.client(credentials).get<RawHitpaySubscriptionPlan>(
      `/subscription-plan/${id}`,
    )
    return transformPlan(res ?? {})
  }

  // ── Subscriptions (Recurring Billing) ────────────────────────────────────

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const res = await this.client(credentials).get<
      RawHitpayRecurringBilling[] | HitpayListEnvelope<RawHitpayRecurringBilling>
    >('/recurring-billing', { per_page: params.limit ?? DEFAULT_PAGE_SIZE })
    return this.toList(res).map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<RawHitpayRecurringBilling>(
      `/recurring-billing/${id}`,
    )
    return transformSubscription(res ?? {})
  }

  // ── Payouts (Transfers) ───────────────────────────────────────────────────

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const rows = await this.listByCursor<RawHitpayTransfer>(
      credentials,
      params,
      '/transfers',
      'transfers',
    )
    return rows.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<RawHitpayTransfer>(`/transfers/${id}`)
    return transformPayout(res ?? {})
  }
}
