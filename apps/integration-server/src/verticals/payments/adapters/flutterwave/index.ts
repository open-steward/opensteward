/**
 * Flutterwave adapter — payments vertical (Africa breadth).
 *
 * 30+ countries, multi-method (cards + mobile money + bank transfers).
 * The same merchant account settles in multiple currencies; consumers
 * should pull `Charge.currency` per row, not assume a single account
 * currency.
 *
 * Auth: Bearer token from a merchant secret key.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: invoice        — Flutterwave invoices are dashboard-only; no /v3/invoices REST endpoint exists.
 * Unavailable: payment-method — No list/retrieve endpoint for stored payment methods; card tokens are embedded in transaction responses only.
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  reportUpstreamPage,
} from '@opensteward/shared'
import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Dispute } from '../../schema/dispute'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'
import type { Plan } from '../../schema/plan'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { FlutterwaveClient } from './client'
import {
  parseFlutterwaveWebhookEvents,
  verifyFlutterwaveWebhook,
} from './webhook'

import { transformBalanceTransaction, type RawFlutterwaveSettlement } from './transform/balance-transaction'
import { transformCharge, type RawFlutterwaveTransaction } from './transform/charge'
import { transformDispute, type RawFlutterwaveChargeback } from './transform/dispute'
import { transformRefund, type RawFlutterwaveRefund } from './transform/refund'
import { transformPayout, type RawFlutterwaveTransfer } from './transform/payout'
import { transformPlan, type RawFlutterwavePlan } from './transform/plan'
import { transformSubscription, type RawFlutterwaveSubscription } from './transform/subscription'

interface FlwEnvelope<T> {
  status?: string
  message?: string
  data?: T
  meta?: { page_info?: { total?: number; current_page?: number; total_pages?: number } }
}

/**
 * Whether upstream page `page` is followed by another, from the documented
 * meta.page_info. Without page_info the page is taken as the last: following
 * a guessed next page on an endpoint that ignored `page` would repeat rows.
 */
function hasNextPage(page: number, meta: FlwEnvelope<unknown>['meta']): boolean {
  const totalPages = meta?.page_info?.total_pages
  return typeof totalPages === 'number' && page < totalPages
}

/**
 * The caller's page of an endpoint that documents `page` but no page size
 * (GET /v3/payment-plans, GET /v3/subscriptions): the upstream serves pages of
 * a size the caller cannot set, so `pageByRows` walks them by page number and
 * cuts exactly the caller's rows out, with `hasMore` exact.
 *
 * Secret keys carry no account id, so the scope is the platform plus the
 * connection's key fingerprint (`connectionScope`).
 */
async function pageFixedSize<Raw, T>(
  client: FlutterwaveClient,
  credentials: Credentials,
  path: string,
  params: QueryParams,
  transform: (raw: Raw) => T,
): Promise<T[]> {
  const key = cursorPagerKey(connectionScope('flutterwave', credentials), path, {})
  const { items } = await pageByRows<T, number>(
    key,
    params,
    async (cursor) => {
      const page = cursor ?? 1
      const res = await client.get<FlwEnvelope<Raw[]>>(path, { page })
      return {
        items: (res.data ?? []).map(transform),
        next: hasNextPage(page, res.meta) ? page + 1 : undefined,
      }
    },
    { defaultLimit: DEFAULT_PAGE_SIZE },
  )
  return items
}

export class FlutterwaveAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'flutterwave'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Flutterwave uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Flutterwave uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'secretKey',
        label: 'Secret key',
        type: 'password',
        required: true,
        helpText: 'FLWSECK_TEST-… for test, FLWSECK-… for live.',
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
    return verifyFlutterwaveWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseFlutterwaveWebhookEvents(payload)
  }

  private client(credentials: Credentials): FlutterwaveClient {
    return new FlutterwaveClient(credentials)
  }

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const res = await this.client(credentials).get<FlwEnvelope<RawFlutterwaveTransaction[]>>(
      '/transactions',
      { page: params.page ?? 1, page_size: params.limit ?? DEFAULT_PAGE_SIZE },
    )
    return (res.data ?? []).map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<FlwEnvelope<RawFlutterwaveTransaction>>(
      `/transactions/${id}/verify`,
    )
    return transformCharge(res.data ?? {})
  }

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const res = await this.client(credentials).get<FlwEnvelope<RawFlutterwaveRefund[]>>('/refunds', {
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
    })
    return (res.data ?? []).map(transformRefund)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId required for Flutterwave refund')
    const res = await this.client(credentials).post<FlwEnvelope<RawFlutterwaveRefund>>(
      `/transactions/${data.chargeId}/refund`,
      { amount: data.amount ? (data.amount / 100).toFixed(2) : undefined },
    )
    return transformRefund({ ...(res.data ?? {}), tx_id: Number(data.chargeId) })
  }

  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    // Flutterwave doesn't expose a top-level list-customers endpoint —
    // customers are derived from transactions. v1 returns empty.
    return []
  }

  // ── Balance Transactions (Settlements) ─────────────────────────────────────

  async listBalanceTransactions(credentials: Credentials, params: QueryParams): Promise<BalanceTransaction[]> {
    const res = await this.client(credentials).get<FlwEnvelope<RawFlutterwaveSettlement[]>>(
      '/settlements',
      { page: params.page ?? 1, page_size: params.limit ?? DEFAULT_PAGE_SIZE },
    )
    return (res.data ?? []).map(transformBalanceTransaction)
  }

  async getBalanceTransaction(credentials: Credentials, id: string): Promise<BalanceTransaction> {
    const res = await this.client(credentials).get<FlwEnvelope<RawFlutterwaveSettlement>>(
      `/settlements/${id}`,
    )
    return transformBalanceTransaction(res.data ?? {})
  }

  // ── Disputes (Chargebacks) ─────────────────────────────────────────────────

  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    const res = await this.client(credentials).get<FlwEnvelope<RawFlutterwaveChargeback[]>>(
      '/chargebacks',
      { page: params.page ?? 1, page_size: params.limit ?? DEFAULT_PAGE_SIZE },
    )
    return (res.data ?? []).map(transformDispute)
  }

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const res = await this.client(credentials).get<FlwEnvelope<RawFlutterwaveChargeback>>(
      `/chargebacks/${id}`,
    )
    return transformDispute(res.data ?? {})
  }

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    // GET /v3/transfers documents both `page` and `page_size`, so one
    // upstream page is one caller page.
    const page = Number(params.page ?? 1)
    const res = await this.client(credentials).get<FlwEnvelope<RawFlutterwaveTransfer[]>>(
      '/transfers',
      { page, page_size: params.limit ?? DEFAULT_PAGE_SIZE },
    )
    const info = res.meta?.page_info
    if (typeof info?.total_pages === 'number') {
      reportUpstreamPage(params, {
        hasMore: hasNextPage(page, res.meta),
        totalPages: info.total_pages,
        ...(typeof info.total === 'number' ? { totalCount: info.total } : {}),
      })
    }
    return (res.data ?? []).map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<FlwEnvelope<RawFlutterwaveTransfer>>(
      `/transfers/${id}`,
    )
    return transformPayout(res.data ?? {})
  }

  // ── Plans (Payment Plans) ───────────────────────────────────────────────

  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    return pageFixedSize(
      this.client(credentials),
      credentials,
      '/payment-plans',
      params,
      (raw: RawFlutterwavePlan) => transformPlan(raw),
    )
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const res = await this.client(credentials).get<FlwEnvelope<RawFlutterwavePlan>>(
      `/payment-plans/${id}`,
    )
    return transformPlan(res.data ?? {})
  }

  // ── Subscriptions ───────────────────────────────────────────────────────

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    return pageFixedSize(
      this.client(credentials),
      credentials,
      '/subscriptions',
      params,
      (raw: RawFlutterwaveSubscription) => transformSubscription(raw),
    )
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<FlwEnvelope<RawFlutterwaveSubscription>>(
      `/subscriptions/${id}`,
    )
    return transformSubscription(res.data ?? {})
  }
}
