/**
 * TransFi adapter — payments vertical.
 *
 * Auth: HTTP Basic (API username + password) plus a mandatory `MID` header
 * on every request (see auth.ts). Host: https://api.transfi.com, v3 paths.
 *
 * Every transaction is an order ("TransFi uses a single endpoint for all
 * transactions: POST /v3/orders. The orderType parameter selects which flow
 * executes." — https://docs.transfi.com/docs/api-concepts.md). Charges are
 * `payin` orders and payouts are `payout` orders, both read from
 * GET /v3/orders and GET /v3/orders/{orderId}. Customers are TransFi users,
 * split across GET /v3/users/individual and GET /v3/users/business.
 *
 * Paging: "List endpoints support `limit` (default 10, max 100) and `page`
 * (from 1). The response includes a `total` count." Each response carries
 * `pagination: { total, pages, currentPage, limit, hasNext, hasPrev }`.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: refund             — "Refunds are initiated by the TransFi support team through the backend admin dashboard" (docs/refunds.md); no refund API.
// Unavailable: balance-transaction — TransFi exposes only a merchant account balance endpoint (GET /v3/balance), not a per-transaction ledger.
// Unavailable: dispute            — No chargeback/dispute management API; failed orders surface failureCode/failureMessage only.
// Unavailable: invoice            — POST /v3/invoices/upload is for document attachments, not billing invoice management.
// Unavailable: payment-method     — No stored payment method management API; payment details are submitted per-order.
// Unavailable: plan               — Transfer/cross-border payments API only; no subscription plan management.
// Unavailable: subscription       — No subscription management API; platform handles one-time transfer orders only.

import { connectionScope, pageByRows, reportUpstreamPage } from '@opensteward/shared'
import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import {
  BUSINESS_USERS_PATH,
  DEFAULT_PAGE_SIZE,
  INDIVIDUAL_USERS_PATH,
  MAX_PAGE_SIZE,
  ORDERS_PATH,
} from './constants'
import { buildCredentials, requireMid } from './auth'
import { TransfiClient, type TransfiPagination } from './client'
import { verifyTransfiWebhook, parseTransfiWebhookEvents } from './webhook'

import { transformCustomer, type RawTransfiCustomer } from './transform/customer'
import { transformCharge, type RawTransfiOrder } from './transform/charge'
import { transformPayout } from './transform/payout'
import { transformRefund, type RawTransfiRefund } from './transform/refund'

/** GET /v3/orders: `{ status, data: { transfers: [...] }, pagination }`. */
interface OrdersListResponse {
  data?: { transfers?: RawTransfiOrder[] }
  pagination?: TransfiPagination
}

/** GET /v3/orders/{orderId}: `{ status, data: {...} }`. */
interface OrderResponse {
  data?: RawTransfiOrder
}

/** GET /v3/users/{individual,business}: `{ status, data: [...], pagination }`. */
interface UsersListResponse {
  data?: RawTransfiCustomer[]
  pagination?: TransfiPagination
}

type UserKind = 'individual' | 'business'
const USER_PATHS: Record<UserKind, string> = {
  individual: INDIVIDUAL_USERS_PATH,
  business: BUSINESS_USERS_PATH,
}

/** Where one upstream page of users starts: which collection, which page. */
interface UserCursor {
  kind: UserKind
  page: number
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

export class TransfiAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'transfi'
  readonly version = '0.2.0'
  /** "List endpoints support `limit` (default 10, max 100)" — docs/api-concepts.md. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('TransFi uses HTTP Basic credentials; submit them via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('TransFi uses HTTP Basic credentials; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'username',
        label: 'API username',
        type: 'text',
        required: true,
        helpText: 'TransFi dashboard → Settings → API Credentials.',
      },
      {
        name: 'password',
        label: 'API password',
        type: 'password',
        required: true,
      },
      {
        name: 'mid',
        label: 'MID',
        type: 'text',
        required: true,
        helpText: 'Merchant or sub-merchant MID, sent as the required MID header on every request.',
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
    return verifyTransfiWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseTransfiWebhookEvents(payload)
  }

  private client(credentials: Credentials): TransfiClient {
    return new TransfiClient(credentials)
  }

  // ── Orders (charges = payin, payouts = payout) ──────────────────────────────

  /**
   * One page of GET /v3/orders?orderType=… at the caller's page and limit,
   * clamped to 100 ("Number of items per page (max 100)"), with the end
   * signal taken from `pagination.hasNext`.
   */
  private async listOrders(
    credentials: Credentials,
    params: QueryParams,
    orderType: 'payin' | 'payout',
  ): Promise<RawTransfiOrder[]> {
    const client = this.client(credentials)
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    const limit = Math.min(
      Math.max(Math.floor(Number.isFinite(asked) ? asked : 1), 1),
      MAX_PAGE_SIZE,
    )
    const page = Math.max(Math.floor(params.page ?? 1), 1)
    const res = await client.get<OrdersListResponse>(ORDERS_PATH, { orderType, page, limit })
    const p = res.pagination
    reportUpstreamPage(params, {
      ...(typeof p?.hasNext === 'boolean' ? { hasMore: p.hasNext } : {}),
      ...(typeof p?.total === 'number' ? { totalCount: p.total } : {}),
      ...(typeof p?.pages === 'number' ? { totalPages: p.pages } : {}),
      ...(typeof p?.currentPage === 'number' ? { currentPage: p.currentPage } : {}),
      ...(limit < asked ? { pageSize: limit } : {}),
    })
    return res.data?.transfers ?? []
  }

  /** GET /v3/orders/{orderId}, refused as not found when it is another order type. */
  private async getOrder(
    credentials: Credentials,
    id: string,
    orderType: 'payin' | 'payout',
  ): Promise<RawTransfiOrder> {
    const res = await this.client(credentials).get<OrderResponse>(
      `${ORDERS_PATH}/${encodeURIComponent(id)}`,
    )
    const order = res.data
    if (!order?.id) throw notFound(`TransFi order ${id} not found`)
    if (order.type !== orderType) {
      throw notFound(
        `TransFi order ${id} is a ${String(order.type)} order, not a ${orderType} order`,
      )
    }
    return order
  }

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    return (await this.listOrders(credentials, params, 'payin')).map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    return transformCharge(await this.getOrder(credentials, id, 'payin'))
  }

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    return (await this.listOrders(credentials, params, 'payout')).map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    return transformPayout(await this.getOrder(credentials, id, 'payout'))
  }

  // ── Customers (individual users, then business users) ───────────────────────

  /**
   * Individual users then business users, as one list. The two collections
   * page independently, so the caller's pages are cut from upstream pages of
   * 100 by `pageByRows`, walking individual pages until `hasNext` is false
   * and then business pages.
   */
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const client = this.client(credentials)
    const mid = requireMid(credentials)
    const key = `transfi:customers:${MAX_PAGE_SIZE}:${connectionScope(mid, credentials)}`
    const { items } = await pageByRows<RawTransfiCustomer, UserCursor>(
      key,
      params,
      async (cursor) => {
        const at: UserCursor = cursor ?? { kind: 'individual', page: 1 }
        const res = await client.get<UsersListResponse>(USER_PATHS[at.kind], {
          page: at.page,
          limit: MAX_PAGE_SIZE,
        })
        const rows = res.data ?? []
        let next: UserCursor | null = null
        if (res.pagination?.hasNext === true) next = { kind: at.kind, page: at.page + 1 }
        else if (at.kind === 'individual') next = { kind: 'business', page: 1 }
        return { items: rows, next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items.map(transformCustomer)
  }

  /**
   * TransFi documents no get-user-by-id; both List Users endpoints take
   * "userId — Filter by user ID (exact match)", so the id is looked up in
   * individual users, then business users.
   */
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const client = this.client(credentials)
    for (const kind of ['individual', 'business'] as const) {
      const res = await client.get<UsersListResponse>(USER_PATHS[kind], { userId: id })
      const hit = (res.data ?? []).find((u) => u.userId === id)
      if (hit) return transformCustomer(hit)
    }
    throw notFound(`TransFi user ${id} not found`)
  }

  // ── Refunds ─────────────────────────────────────────────────────────────────

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw Object.assign(
      new Error(
        'TransFi cannot list refunds: "Refunds are initiated by the TransFi support team through the backend admin dashboard, based on the customer\'s request." (https://docs.transfi.com/docs/refunds.md); there is no refund API.',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  // Out of scope for the read rebuild: POST /refunds is not a documented TransFi
  // endpoint (see listRefunds). Left for the write-method pass.
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawTransfiRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }
}
