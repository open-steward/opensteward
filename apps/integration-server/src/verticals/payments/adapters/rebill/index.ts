/**
 * Rebill adapter — payments vertical.
 *
 * API reference: https://docs.rebill.com/api/reference (index in
 * https://docs.rebill.com/llms.txt). Base https://api.rebill.com/v3; auth is
 * the `x-api-key` header ("Every request to the Rebill API must include an API
 * key in the `x-api-key` header."). List and search endpoints need a secret
 * (`sk_`) key.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * customer      GET  /v3/customers (limit, starting_after; has_more), GET /v3/customers/{customerId}
 * charge        POST /v3/payments/search (pagination {limit, offset}), GET /v3/payments/:id
 * subscription  POST /v3/subscriptions/search, GET /v3/subscriptions/:id
 * plan          POST /v3/plans/search, GET /v3/plans/{planId}
 * refund        no list: the Refunds reference documents only
 *               POST /v3/refunds/{paymentId}, which returns the payment's status.
 * invoice       no API: the reference has no Invoices page; invoices are
 *               dashboard-emailed PDF receipts.
 */

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { Invoice } from '../../schema/invoice'
import type { Plan } from '../../schema/plan'

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { RebillClient } from './client'

import { transformCustomer, type RawRebillCustomer } from './transform/customer'
import { transformCharge, type RawRebillPayment } from './transform/charge'
import { transformRefund, type RawRebillRefund } from './transform/refund'
import { transformSubscription, type RawRebillSubscription } from './transform/subscription'
import { transformPlan, type RawRebillPlan } from './transform/plan'

/** GET /v3/customers: `{ "object": "list", "data": [...], "has_more": true, "url": "/v3/customers" }`. */
interface RebillCursorList<T> {
  data: T[]
  has_more: boolean
}

/** POST /v3/{resource}/search: `201 Created` with `{ records, pagination }`. */
interface RebillSearchPage<T> {
  records: T[]
  pagination: {
    totalItems?: number
    totalPages?: number
    currentPage?: number
    itemsPerPage?: number
    hasNextPage: boolean
    hasPreviousPage?: boolean
  }
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function requestedLimit(params: QueryParams): number {
  const n = Math.floor(Number(params.limit))
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_PAGE_SIZE
}

export class RebillAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'rebill'
  readonly version = '0.1.0'
  /**
   * "Records per page. Defaults to `10`. Max `100`." (List customers); plans
   * and subscriptions search say the same. The payments search states no
   * maximum, so 100 is the one ceiling every list shares.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('Rebill uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Rebill uses an API key; call exchangeCredentials instead.')
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

  private client(credentials: Credentials): RebillClient {
    return new RebillClient(credentials)
  }

  /**
   * One offset page of a documented POST search endpoint. The body object
   * `pagination` is `{ limit, offset, sort, order }`; `hasNextPage` and
   * `totalItems` come back in the response's `pagination`.
   */
  private async searchPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    max: number | undefined,
  ): Promise<T[]> {
    const asked = requestedLimit(params)
    const limit = max === undefined ? asked : Math.min(asked, max)
    const offset = pageOffset(params, limit)
    const res = await this.client(credentials).post<RebillSearchPage<T>>(path, {
      pagination: { limit, offset },
    })
    reportUpstreamPage(params, {
      hasMore: res.pagination.hasNextPage === true,
      ...(typeof res.pagination.totalItems === 'number'
        ? { totalCount: res.pagination.totalItems }
        : {}),
      ...(limit < asked ? { pageSize: limit } : {}),
    })
    return res.records
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  /**
   * GET /v3/customers: "Returns customers in creation order with cursor-based
   * pagination." `starting_after`: "Pass the `id` of the last customer from
   * the previous page to fetch the next page."
   */
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const asked = requestedLimit(params)
    const limit = Math.min(asked, MAX_PAGE_SIZE)
    const client = this.client(credentials)
    const result = await pageByCursor<RawRebillCustomer, string>(
      cursorPagerKey(connectionScope('rebill', credentials), '/customers', { limit }),
      params.page,
      async (cursor) => {
        const res = await client.get<RebillCursorList<RawRebillCustomer>>('/customers', {
          limit,
          ...(cursor ? { starting_after: cursor } : {}),
        })
        const rows = res.data
        const last = rows[rows.length - 1]
        return { items: rows, next: res.has_more === true && last ? last.id : null }
      },
    )
    reportUpstreamPage(params, {
      hasMore: result.hasMore,
      ...(limit < asked ? { pageSize: limit } : {}),
    })
    return result.items.map(transformCustomer)
  }

  /** GET /v3/customers/{customerId}: "`200 OK` with the [customer object](#the-customer-object)." */
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawRebillCustomer>(
      `/customers/${encodeURIComponent(id)}`,
    )
    return transformCustomer(raw)
  }

  // ── Charges (Rebill "payments") ───────────────────────────────────────────

  /**
   * POST /v3/payments/search: "Returns a paginated list of payments matching
   * your filters." `limit`: "Maximum number of results per page. Default:
   * `10`." (no maximum stated); `offset`: "Number of results to skip."
   */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.searchPage<RawRebillPayment>(
      credentials,
      '/payments/search',
      params,
      undefined,
    )
    return rows.map(transformCharge)
  }

  /** GET /v3/payments/:id: "Retrieves the full payment object". */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawRebillPayment>(
      `/payments/${encodeURIComponent(id)}`,
    )
    return transformCharge(raw)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported(
      'Rebill cannot list refunds: the Refunds API reference documents only "Refund a payment" (POST /v3/refunds/{paymentId}), and "The refund endpoint returns the payment\'s new status after the refund attempt."',
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawRebillRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  /**
   * POST /v3/subscriptions/search: "Returns a paginated list of
   * subscriptions." `limit`: "Items per page. Defaults to `10`, max `100`.";
   * `offset`: "Items to skip."; `hasNextPage`: "Whether more pages exist
   * after this one."
   */
  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const rows = await this.searchPage<RawRebillSubscription>(
      credentials,
      '/subscriptions/search',
      params,
      MAX_PAGE_SIZE,
    )
    return rows.map(transformSubscription)
  }

  /** GET /v3/subscriptions/:id: "Retrieves an existing subscription". */
  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const raw = await this.client(credentials).get<RawRebillSubscription>(
      `/subscriptions/${encodeURIComponent(id)}`,
    )
    return transformSubscription(raw)
  }

  async cancelSubscription(
    credentials: Credentials,
    id: string,
    _data?: { atPeriodEnd?: boolean },
  ): Promise<Subscription> {
    await this.client(credentials).delete(`/subscriptions/${id}`)
    return this.getSubscription(credentials, id)
  }

  // ── Invoices ──────────────────────────────────────────────────────────────

  async listInvoices(_credentials: Credentials, _params: QueryParams): Promise<Invoice[]> {
    throw notSupported(
      'Rebill cannot list invoices: its API reference has no Invoices resource; "Rebill generates and emails a PDF invoice to your customer after each successful payment. Enable this from your Dashboard settings."',
    )
  }

  async getInvoice(_credentials: Credentials, _id: string): Promise<Invoice> {
    throw notSupported(
      'Rebill cannot retrieve invoices: its API reference has no Invoices resource; invoices are PDF receipts enabled "from your Dashboard settings."',
    )
  }

  // ── Plans ─────────────────────────────────────────────────────────────────

  /**
   * POST /v3/plans/search: "Paginated search with nested filters." body
   * `pagination`: "`{ limit, offset, sort, order }`. `limit` defaults to `10`
   * (max `100`), `offset` defaults to `0`".
   */
  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const rows = await this.searchPage<RawRebillPlan>(
      credentials,
      '/plans/search',
      params,
      MAX_PAGE_SIZE,
    )
    return rows.map(transformPlan)
  }

  /** GET /v3/plans/{planId}: "Fetches a single plan, including all its prices." */
  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const raw = await this.client(credentials).get<RawRebillPlan>(
      `/plans/${encodeURIComponent(id)}`,
    )
    return transformPlan(raw)
  }
}
