/**
 * Hyperswitch adapter — payments vertical.
 *
 * Hyperswitch is an open-source payments orchestrator (by Juspay) that routes
 * a single API across many downstream processors. It models a "charge" as a
 * Payment intent and supports payments, refunds, and customers over a REST API.
 *
 * Auth: secret API key sent in the `api-key` header (no OAuth). The key is
 * collected through the Connect Link form via the shared `simpleApiKey`
 * template.
 *
 * Resources implemented (only what Hyperswitch exposes; the rest auto-501):
 *   - Charges:         list, get, create, capture, cancel  (Payments API)
 *   - Refunds:         list, get, create                    (Refunds API)
 *   - Customers:       list, get                            (Customers API)
 *   - Disputes:        list, get                            (Disputes API)
 *   - Payouts:         list, get                            (Payouts API)
 *   - PaymentMethods:  list (per-customer saved PMs)        (Payment Methods API)
 *
 * Docs: https://api-reference.hyperswitch.io/introduction
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — Hyperswitch exposes no balance-transaction REST API; its internal reconciliation ledger is not publicly addressable.
 * Unavailable: invoice             — Hyperswitch has no native invoices API; billing is delegated to third-party providers (Chargebee, Stripe Billing, etc.).
 * Unavailable: plan                — Hyperswitch has no native plans API; plan management belongs to the connected subscription provider.
 * Unavailable: subscription        — Hyperswitch acts as a payment orchestrator only; subscription lifecycle is owned by the merchant's subscription provider.
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Dispute } from '../../schema/dispute'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { API_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, PAYOUTS_MAX_PAGE_SIZE } from './constants'
import { CREDENTIAL_FORM } from './auth'
import {
  HyperswitchClient,
  type HyperswitchCursorList,
  type HyperswitchOffsetList,
} from './client'
import { verifyHyperswitchWebhook, parseHyperswitchWebhookEvents } from './webhook'

import { transformCharge, type RawHyperswitchPayment } from './transform/charge'
import { transformCustomer, type RawHyperswitchCustomer } from './transform/customer'
import { transformDispute, type RawHyperswitchDispute } from './transform/dispute'
import { transformPaymentMethod, type RawHyperswitchSavedPaymentMethod } from './transform/payment-method'
import { transformPayout, type RawHyperswitchPayout } from './transform/payout'
import { transformRefund, type RawHyperswitchRefund } from './transform/refund'

/**
 * The page size one offset request asks for: the caller's limit, floored,
 * within [1, `max`] (PageSize is rejected, not clamped, outside 1..100).
 * A missing or unusable limit is the adapter's default page. When the limit
 * is clamped the size actually sent is reported, so every short-page
 * judgement uses it.
 */
function offsetPageSize(params: QueryParams, max: number): number {
  const asked = params.limit
  const size =
    typeof asked === 'number' && Number.isFinite(asked) && asked >= 1
      ? Math.min(Math.floor(asked), max)
      : Math.min(DEFAULT_PAGE_SIZE, max)
  if (typeof asked === 'number' && size < asked) reportUpstreamPage(params, { pageSize: size })
  return size
}

/**
 * A short page from an offset endpoint with no count is the end; a full one
 * is undecidable without another request, so nothing is reported for it.
 */
function reportShortPage(params: QueryParams, rows: number, size: number): void {
  if (rows < size) reportUpstreamPage(params, { hasMore: false })
}

/** Pager scope for one connection: the host plus a fingerprint of its key. */
function scope(credentials: Credentials): string {
  return connectionScope(`hyperswitch:${API_BASE_URL}`, credentials)
}

export class HyperswitchAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'hyperswitch'
  readonly version = '0.1.0'

  /**
   * PageSize maximum, shared by payments, refunds and disputes ("maximum:
   * 100", LIST_MAX_LIMIT). Customers take any u16 and are sent at most this.
   * Payouts cap at 20 and charges re-cut fixed upstream pages, both through
   * pageByRows, so each still serves exactly the caller's limit.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('Hyperswitch uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Hyperswitch uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return CREDENTIAL_FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return CREDENTIAL_FORM.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyHyperswitchWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseHyperswitchWebhookEvents(payload)
  }

  private client(credentials: Credentials): HyperswitchClient {
    return new HyperswitchClient(credentials)
  }

  // ── Charges (Payments API) ──────────────────────────────────────────────

  /**
   * GET /payments/list pages by cursor only (the v1 GET has no offset).
   * `ending_before` — "A cursor for use in pagination, fetch the previous
   * list before some object" — walks forward through the newest-first list;
   * `starting_after` would return page 1 again. Storage filters
   * `created_at <= anchor`, so the anchor comes back first and is dropped
   * (with anything tied ahead of it). The size cannot follow the caller's
   * limit (a limit of 100 would need 101 to cover the anchor), so fixed
   * 100-row pages are re-cut into the caller's pages with pageByRows. The
   * response carries no count, and core can drop rows after the DB limit, so
   * the walk ends only on a page with no row past the anchor.
   */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const client = this.client(credentials)
    const key = cursorPagerKey(scope(credentials), 'payments', { limit: MAX_PAGE_SIZE })
    const { items } = await pageByRows<RawHyperswitchPayment, string>(
      key,
      params,
      async (anchor) => {
        const query: Record<string, unknown> = { limit: MAX_PAGE_SIZE }
        if (anchor !== undefined) query.ending_before = anchor
        const res = await client.get<HyperswitchCursorList<RawHyperswitchPayment>>(
          '/payments/list',
          query,
        )
        let rows = res?.data ?? []
        if (anchor !== undefined) {
          const at = rows.findIndex((r) => r.payment_id === anchor)
          if (at >= 0) rows = rows.slice(at + 1)
        }
        const last = rows[rows.length - 1]?.payment_id
        return { items: rows, next: rows.length > 0 && last ? last : undefined }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawHyperswitchPayment>(`/payments/${id}`)
    return transformCharge(res ?? {})
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    if (data.amount === undefined) throw new Error('amount required to create a Hyperswitch payment')
    if (!data.currency) throw new Error('currency required to create a Hyperswitch payment')
    const body: Record<string, unknown> = {
      amount: data.amount,
      currency: data.currency.toUpperCase(),
      confirm: true,
      capture_method: data.captured === false ? 'manual' : 'automatic',
    }
    if (data.customerId) body.customer_id = data.customerId
    if (data.paymentMethodId) body.payment_method_id = data.paymentMethodId
    if (data.description) body.description = data.description
    if (data.statementDescriptor) body.statement_descriptor_name = data.statementDescriptor
    if (data.receiptEmail) body.email = data.receiptEmail
    if (data.metadata) body.metadata = data.metadata
    const res = await this.client(credentials).post<RawHyperswitchPayment>('/payments', body)
    return transformCharge(res ?? {})
  }

  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const body: Record<string, unknown> = {}
    if (data?.amount !== undefined) body.amount_to_capture = data.amount
    const res = await this.client(credentials).post<RawHyperswitchPayment>(
      `/payments/${id}/capture`,
      body,
    )
    return transformCharge(res ?? {})
  }

  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    await this.client(credentials).post<RawHyperswitchPayment>(`/payments/${id}/cancel`, {
      cancellation_reason: 'requested_by_customer',
    })
    return this.getCharge(credentials, id)
  }

  // ── Refunds ─────────────────────────────────────────────────────────────

  /** POST /refunds/list: body `limit` (PageSize, 1..100) + `offset`, with `total_count`. */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const size = offsetPageSize(params, MAX_PAGE_SIZE)
    const offset = pageOffset(params, size)
    const res = await this.client(credentials).post<HyperswitchOffsetList<RawHyperswitchRefund>>(
      '/refunds/list',
      { limit: size, offset },
    )
    const rows = res?.data ?? []
    if (typeof res?.total_count === 'number') {
      reportUpstreamPage(params, {
        totalCount: res.total_count,
        hasMore: offset + rows.length < res.total_count,
      })
    } else {
      reportShortPage(params, rows.length, size)
    }
    return rows.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<RawHyperswitchRefund>(`/refunds/${id}`)
    return transformRefund(res ?? {})
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (payment_id) required for Hyperswitch refund')
    const body: Record<string, unknown> = { payment_id: data.chargeId }
    if (data.amount !== undefined) body.amount = data.amount
    if (data.metadata) body.metadata = data.metadata
    const res = await this.client(credentials).post<RawHyperswitchRefund>('/refunds', body)
    return transformRefund(res ?? {})
  }

  // ── Customers ───────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    // GET /customers/list: query `limit` + `offset` ("Offset for pagination"), bare array.
    const size = offsetPageSize(params, MAX_PAGE_SIZE)
    const res = await this.client(credentials).get<RawHyperswitchCustomer[]>('/customers/list', {
      limit: size,
      offset: pageOffset(params, size),
    })
    const rows = res ?? []
    reportShortPage(params, rows.length, size)
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawHyperswitchCustomer>(`/customers/${id}`)
    return transformCustomer(res ?? {})
  }

  // ── Disputes ────────────────────────────────────────────────────────────

  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    // GET /disputes/list: query `limit` (1..100) + `offset` (DisputeListGetConstraints), bare array.
    const size = offsetPageSize(params, MAX_PAGE_SIZE)
    const res = await this.client(credentials).get<RawHyperswitchDispute[]>('/disputes/list', {
      limit: size,
      offset: pageOffset(params, size),
    })
    const rows = res ?? []
    reportShortPage(params, rows.length, size)
    return rows.map(transformDispute)
  }

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const res = await this.client(credentials).get<RawHyperswitchDispute>(`/disputes/${id}`)
    return transformDispute(res ?? {})
  }

  // ── Payouts ─────────────────────────────────────────────────────────────

  /**
   * POST /payouts/list: body `limit` + `offset`, with `total_count`. The
   * limit is rejected above 20 (PAYOUTS_LIST_MAX_LIMIT_POST), below the
   * adapter's declared 100, so fixed 20-row offset pages are re-cut into the
   * caller's pages with pageByRows.
   */
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const client = this.client(credentials)
    const key = cursorPagerKey(scope(credentials), 'payouts', { limit: PAYOUTS_MAX_PAGE_SIZE })
    const { items } = await pageByRows<RawHyperswitchPayout, number>(
      key,
      params,
      async (cursor) => {
        const offset = cursor ?? 0
        const res = await client.post<HyperswitchOffsetList<RawHyperswitchPayout>>(
          '/payouts/list',
          { limit: PAYOUTS_MAX_PAGE_SIZE, offset },
        )
        const rows = res?.data ?? []
        const end = offset + rows.length
        const more =
          rows.length > 0 &&
          (typeof res?.total_count === 'number'
            ? end < res.total_count
            : rows.length === PAYOUTS_MAX_PAGE_SIZE)
        return { items: rows, next: more ? end : undefined }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<RawHyperswitchPayout>(`/payouts/${id}`)
    return transformPayout(res ?? {})
  }

  // ── Payment Methods (per-customer saved PMs) ─────────────────────────────

  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    // Hyperswitch scopes saved payment methods per customer; without a
    // customer_id we cannot enumerate across all customers in one call.
    // If a customerId filter is supplied in params, use it; otherwise
    // return an empty list to avoid a hard error.
    const customerId = (params as Record<string, unknown>).customerId as string | undefined
    if (!customerId) return []
    const res = await this.client(credentials).get<{
      customer_payment_methods?: RawHyperswitchSavedPaymentMethod[]
    }>(`/customers/${customerId}/payment_methods`)
    return (res?.customer_payment_methods ?? []).map(transformPaymentMethod)
  }
}
