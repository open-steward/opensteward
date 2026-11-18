/**
 * Paddle adapter — payments vertical (merchant-of-record SaaS).
 *
 * Paddle is the seller of record: it handles VAT / sales-tax computation,
 * collection, and remittance. `Charge.amount` is **gross-of-tax** (what the
 * customer paid); `Invoice.tax` carries the tax amount remitted by Paddle.
 * Net-to-merchant = total - tax - paddle_fee, computed downstream.
 *
 * Auth: Bearer token from the Paddle dashboard (sandbox + live keys
 * separate).
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: balance-transaction — no /balance-transactions endpoint; payout
//              ledger data is only accessible via the payout_reconciliation
//              report type (GET /reports), not a queryable REST resource.
// Unavailable: payout — no /payouts endpoint; payouts are only accessible via
//              the payout_reconciliation report type, not a queryable REST resource.

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Dispute } from '../../schema/dispute'
import type { Invoice } from '../../schema/invoice'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Plan } from '../../schema/plan'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import {
  ADJUSTMENTS_MAX_PAGE_SIZE,
  DEFAULT_ENVIRONMENT,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  TRANSACTIONS_MAX_PAGE_SIZE,
} from './constants'
import { buildCredentials } from './auth'
import { PaddleClient } from './client'
import { parsePaddleWebhookEvents, verifyPaddleWebhook } from './webhook'

import { transformCustomer, type RawPaddleCustomer } from './transform/customer'
import { transformSubscription, type RawPaddleSubscription } from './transform/subscription'
import { transformCharge, type RawPaddleTransaction } from './transform/charge'
import { transformDispute } from './transform/dispute'
import { transformInvoice, type RawPaddleInvoice } from './transform/invoice'
import { transformPaymentMethod, type RawPaddlePaymentMethod } from './transform/payment-method'
import { transformPlan, type RawPaddlePrice } from './transform/plan'
import { transformRefund, type RawPaddleAdjustment } from './transform/refund'

interface PaddleEnvelope<T> {
  data?: T
  meta?: { request_id?: string }
}

interface PaddleListResponse<T> {
  data?: T[]
  meta?: {
    pagination?: { has_more?: boolean; next?: string; estimated_total?: number }
  }
}

/**
 * The `after` value that starts the page after `res`, or undefined at the end.
 *
 * `meta.pagination.next` is "Always returned, even if `has_more` is `false`"
 * (https://developer.paddle.com/api-reference/about/pagination.md), so only
 * `has_more` says whether there is more. The cursor is the `after` param of
 * `next` — "the Paddle ID" of the last entity — else the last row's id.
 */
function nextAfter(res: PaddleListResponse<{ id?: string }>): string | undefined {
  if (res.meta?.pagination?.has_more !== true) return undefined
  const next = res.meta.pagination.next
  if (next) {
    try {
      const after = new URL(next).searchParams.get('after')
      if (after) return after
    } catch {
      // fall through to the last row's id
    }
  }
  const last = res.data?.[res.data.length - 1]?.id
  return last ? String(last) : undefined
}

/**
 * Pager scope for one connection: the environment plus a fingerprint of the
 * API key (never the key itself).
 */
function pagerScope(credentials: Credentials): string {
  const env =
    ((credentials.extra as Record<string, unknown> | undefined)?.environment as
      string | undefined) ?? DEFAULT_ENVIRONMENT
  return connectionScope(`paddle:${env}`, credentials)
}

export class PaddleAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'paddle'
  readonly version = '0.1.0'
  /**
   * "Most list operations return 50 results by default and a maximum of 200."
   * Every list method walks `after` via listPaged; /transactions (30) and
   * /adjustments (50) clamp lower and report the size sent as pageSize.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('Paddle uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Paddle uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'sandbox', label: 'Sandbox' },
          { value: 'live', label: 'Live' },
        ],
      },
      {
        name: 'apiKey',
        label: 'API key',
        type: 'password',
        required: true,
        helpText: 'From Paddle dashboard → Developer Tools → Authentication.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPaddleWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePaddleWebhookEvents(payload)
  }

  private client(credentials: Credentials): PaddleClient {
    return new PaddleClient(credentials)
  }

  /**
   * One caller page of a Paddle list endpoint, walked on `after`.
   *
   * Every Paddle list pages by keyset: `per_page` (clamped by Paddle to the
   * endpoint's maximum) and `after` ("Return entities after the specified
   * Paddle ID"). One upstream page is one caller page, so `pageByCursor`
   * walks the chain. A limit above the endpoint's maximum is clamped to it
   * and the size sent is reported as `pageSize`, so every short-page
   * judgement uses it. hasMore comes from `has_more` alone.
   */
  private async listPaged<R extends { id?: string }>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    collection: string,
    max: number,
    filters: Record<string, unknown> = {},
  ): Promise<R[]> {
    const client = this.client(credentials)
    const scope = pagerScope(credentials)
    const asked = params.limit
    const limit =
      typeof asked === 'number' && Number.isFinite(asked) && asked >= 1
        ? Math.floor(asked)
        : Math.min(DEFAULT_PAGE_SIZE, max)
    const perPage = Math.min(limit, max)
    let totalCount: number | undefined
    const fetchPage = async (after: string | undefined) => {
      const query: Record<string, unknown> = { ...filters, per_page: perPage }
      if (after !== undefined) query.after = after
      const res = await client.get<PaddleListResponse<R>>(path, query)
      // estimated_total is exact up to 100,000; 100001 means more, -1 skipped.
      const est = res.meta?.pagination?.estimated_total
      totalCount = typeof est === 'number' && est >= 0 && est <= 100_000 ? est : undefined
      return { items: res.data ?? [], next: nextAfter(res) }
    }
    const key = cursorPagerKey(scope, collection, { ...filters, per_page: perPage })
    const { items, hasMore } = await pageByCursor<R, string>(key, params.page, fetchPage)
    reportUpstreamPage(params, {
      hasMore,
      ...(totalCount !== undefined ? { totalCount } : {}),
      ...(perPage < limit ? { pageSize: perPage } : {}),
    })
    return items
  }

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await this.listPaged<RawPaddleCustomer>(
      credentials,
      params,
      '/customers',
      'customers',
      MAX_PAGE_SIZE,
    )
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<PaddleEnvelope<RawPaddleCustomer>>(
      `/customers/${id}`,
    )
    return transformCustomer(res.data ?? {})
  }

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const rows = await this.listPaged<RawPaddleSubscription>(
      credentials,
      params,
      '/subscriptions',
      'subscriptions',
      MAX_PAGE_SIZE,
    )
    return rows.map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<PaddleEnvelope<RawPaddleSubscription>>(
      `/subscriptions/${id}`,
    )
    return transformSubscription(res.data ?? {})
  }

  async cancelSubscription(
    credentials: Credentials,
    id: string,
    data?: { atPeriodEnd?: boolean },
  ): Promise<Subscription> {
    const res = await this.client(credentials).post<PaddleEnvelope<RawPaddleSubscription>>(
      `/subscriptions/${id}/cancel`,
      { effective_from: data?.atPeriodEnd ? 'next_billing_period' : 'immediately' },
    )
    return transformSubscription(res.data ?? {})
  }

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.listPaged<RawPaddleTransaction>(
      credentials,
      params,
      '/transactions',
      'transactions',
      TRANSACTIONS_MAX_PAGE_SIZE,
    )
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<PaddleEnvelope<RawPaddleTransaction>>(
      `/transactions/${id}`,
    )
    return transformCharge(res.data ?? {})
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const rows = await this.listPaged<RawPaddleInvoice>(
      credentials,
      params,
      '/transactions',
      'transactions',
      TRANSACTIONS_MAX_PAGE_SIZE,
    )
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).get<PaddleEnvelope<RawPaddleInvoice>>(
      `/transactions/${id}`,
    )
    return transformInvoice(res.data ?? {})
  }

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const rows = await this.listPaged<RawPaddleAdjustment>(
      credentials,
      params,
      '/adjustments',
      'adjustments',
      ADJUSTMENTS_MAX_PAGE_SIZE,
      { action: 'refund' },
    )
    return rows.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // Paddle has no single-adjustment GET; filter list by id.
    const res = await this.client(credentials).get<PaddleListResponse<RawPaddleAdjustment>>(
      '/adjustments',
      { action: 'refund', id },
    )
    const found = (res.data ?? []).find((r) => r.id === id) ?? {}
    return transformRefund(found)
  }

  // ── Disputes (Chargebacks) ────────────────────────────────────────────────
  // Paddle is merchant-of-record: disputes are raised against Paddle and
  // handled automatically. Chargeback events surface as adjustments at
  // GET /adjustments with action=chargeback or action=chargeback_warning.

  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    const rows = await this.listPaged<RawPaddleAdjustment>(
      credentials,
      params,
      '/adjustments',
      'adjustments',
      ADJUSTMENTS_MAX_PAGE_SIZE,
      { action: 'chargeback' },
    )
    return rows.map(transformDispute)
  }

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    // Paddle has no single-adjustment GET; filter list by id.
    const res = await this.client(credentials).get<PaddleListResponse<RawPaddleAdjustment>>(
      '/adjustments',
      { action: 'chargeback', id },
    )
    const found = (res.data ?? []).find((r) => r.id === id) ?? {}
    return transformDispute(found)
  }

  // ── Payment Methods ───────────────────────────────────────────────────────
  // Payment methods are customer-scoped in Paddle Billing.
  // listPaymentMethods requires params.customer_id to scope the request.
  // getPaymentMethod expects id as "{customer_id}/{payment_method_id}".

  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const customerId = params['customer_id'] as string | undefined
    if (!customerId) {
      throw new Error(
        'Paddle listPaymentMethods requires customer_id — pass it as params.customer_id',
      )
    }
    // Same after/per_page keyset as every Paddle list ("Default: `50`;
    // Maximum: `200`", list-customer-payment-methods.md). The customer is in
    // the path, so it goes in the collection key: one walk per customer.
    const rows = await this.listPaged<RawPaddlePaymentMethod>(
      credentials,
      params,
      `/customers/${customerId}/payment-methods`,
      `customers/${customerId}/payment-methods`,
      MAX_PAGE_SIZE,
    )
    return rows.map(transformPaymentMethod)
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    // id must be "{customer_id}/{payment_method_id}" because the endpoint is
    // customer-scoped: GET /customers/{customer_id}/payment-methods/{payment_method_id}
    const [customerId, paymentMethodId] = id.split('/')
    if (!customerId || !paymentMethodId) {
      throw new Error(
        `Paddle getPaymentMethod: id must be "{customer_id}/{payment_method_id}", got "${id}"`,
      )
    }
    const res = await this.client(credentials).get<PaddleEnvelope<RawPaddlePaymentMethod>>(
      `/customers/${customerId}/payment-methods/${paymentMethodId}`,
    )
    return transformPaymentMethod(res.data ?? {})
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    // Paddle refunds are created via POST /adjustments with action=refund.
    const body: Record<string, unknown> = { action: 'refund' }
    if (data.chargeId) body.transaction_id = data.chargeId
    if (data.amount !== undefined) {
      body.items = [{ type: 'partial', amount: String(data.amount) }]
    }
    if (data.reason) body.reason = data.reason
    const res = await this.client(credentials).post<PaddleEnvelope<RawPaddleAdjustment>>(
      '/adjustments',
      body,
    )
    return transformRefund(res.data ?? {})
  }

  // ── Plans (Paddle Prices) ─────────────────────────────────────────────────
  // Paddle's subscription pricing primitive is called "Price". It maps onto
  // the canonical Plan resource: it carries a billing_cycle (interval +
  // frequency), unit_price (already integer minor units as a string), and a
  // product_id back-reference.

  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const rows = await this.listPaged<RawPaddlePrice>(
      credentials,
      params,
      '/prices',
      'prices',
      MAX_PAGE_SIZE,
    )
    return rows.map(transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const res = await this.client(credentials).get<PaddleEnvelope<RawPaddlePrice>>(`/prices/${id}`)
    return transformPlan(res.data ?? {})
  }
}
