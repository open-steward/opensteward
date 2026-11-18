/**
 * Pin Payments adapter — payments vertical.
 *
 * Auth: API key (Bearer token).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — /balance returns only an aggregate balance; no per-transaction ledger endpoint exists.
 * Unavailable: invoice — Pin Payments has no invoice object; billing flows through Plans + Subscriptions only.
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  CursorPage,
  QueryParams,
} from '@opensteward/shared'
import { connectionScope, cursorPagerKey, pageByRows } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Payout } from '../../schema/payout'
import type { Dispute } from '../../schema/dispute'
import type { Plan } from '../../schema/plan'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { PinPaymentsClient } from './client'
import { verifyPinPaymentsWebhook, parsePinPaymentsWebhookEvents } from './webhook'

import { transformCustomer, type RawPinCustomer } from './transform/customer'
import { transformCharge, type RawPinCharge } from './transform/charge'
import { transformRefund, type RawPinRefund } from './transform/refund'
import { transformPaymentMethod, type RawPinCard } from './transform/payment-method'
import { transformPayout, type RawPinTransfer } from './transform/payout'
import { transformDispute, type RawPinDispute } from './transform/dispute'
import { transformPlan, type RawPinPlan } from './transform/plan'
import { transformSubscription, type RawPinSubscription } from './transform/subscription'

/**
 * Pin's pagination object. Customers, charges, refunds, transfers and disputes
 * document `next` (null on the last page); the plans and subscriptions
 * examples show only `count`, `per_page` and `current`.
 */
interface PinPagination {
  current?: number
  previous?: number | null
  next?: number | null
  per_page?: number
  pages?: number
  count?: number
}

/** A Pin collection body: "Successful responses have a top-level key, response". */
interface PinListBody<T> {
  response?: T[]
  pagination?: PinPagination
}

/**
 * The upstream page after `page`, or undefined at the end. Reads `next` where
 * the pagination object carries it, else `current * per_page < count`. An
 * empty page is the end, so a stale `next` cannot walk forever.
 */
function nextPinPage(
  pagination: PinPagination | undefined,
  page: number,
  rows: number,
): number | undefined {
  if (rows === 0 || !pagination) return undefined
  if ('next' in pagination) {
    const next = pagination.next
    return typeof next === 'number' && next > page ? next : undefined
  }
  const { count, per_page: perPage } = pagination
  if (typeof count !== 'number' || typeof perPage !== 'number' || perPage < 1) return undefined
  const current = typeof pagination.current === 'number' ? pagination.current : page
  return current * perPage < count ? current + 1 : undefined
}

export class PinPaymentsAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'pin-payments'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Pin Payments uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Pin Payments uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'Secret API Key',
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

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPinPaymentsWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePinPaymentsWebhookEvents(payload)
  }

  private client(credentials: Credentials): PinPaymentsClient {
    return new PinPaymentsClient(credentials)
  }

  /**
   * The caller's page of a Pin collection. Pin pages by `page` alone, at a
   * size it chooses and reports as `pagination.per_page`: "To request the
   * next page of a resource collection, pass a page parameter with the
   * incremented page value." No request parameter sets the size, so one Pin
   * page is not one caller page: pageByRows cuts the caller's rows out of
   * Pin's pages and reports `hasMore`.
   */
  private async listPaged<R, T>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    transform: (raw: R) => T,
  ): Promise<T[]> {
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope('pin-payments', credentials), path, {})
    const { items } = await pageByRows<T, number>(
      key,
      params,
      async (cursor): Promise<CursorPage<T, number>> => {
        const page = cursor ?? 1
        const body = await client.get<PinListBody<R>>(path, { page })
        const rows = body.response ?? []
        return { items: rows.map(transform), next: nextPinPage(body.pagination, page, rows.length) }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    return this.listPaged<RawPinCustomer, Customer>(
      credentials,
      params,
      '/customers',
      transformCustomer,
    )
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ data?: RawPinCustomer }>(`/customers/${id}`)
    return transformCustomer(res.data ?? {})
  }

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    return this.listPaged<RawPinCharge, Charge>(credentials, params, '/charges', transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<{ data?: RawPinCharge }>(`/charges/${id}`)
    return transformCharge(res.data ?? {})
  }

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    return this.listPaged<RawPinRefund, Refund>(credentials, params, '/refunds', transformRefund)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawPinRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }

  // ── Payment Methods (cards stored on a customer) ──────────────────────────

  async listPaymentMethods(credentials: Credentials, params: QueryParams): Promise<PaymentMethod[]> {
    const customerId = params['customerId'] ?? params['customer_token']
    if (!customerId) return []
    const res = await this.client(credentials).get<{ data?: RawPinCard[] }>(
      `/customers/${String(customerId)}/cards`,
    )
    return (res.data ?? []).map(transformPaymentMethod)
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    // Pin has no direct GET /cards/{token}; return via the card token from a charge lookup.
    // We return a stub identified by the token.
    const res = await this.client(credentials).get<{ data?: RawPinCard }>(`/cards/${id}`)
    return transformPaymentMethod(res.data ?? { token: id })
  }

  // ── Payouts (bank transfers / recipient payouts) ────────────────────────────

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    return this.listPaged<RawPinTransfer, Payout>(
      credentials,
      params,
      '/transfers',
      transformPayout,
    )
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<{ data?: RawPinTransfer }>(`/transfers/${id}`)
    return transformPayout(res.data ?? {})
  }

  // ── Disputes ────────────────────────────────────────────────────────────────

  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    return this.listPaged<RawPinDispute, Dispute>(
      credentials,
      params,
      '/disputes',
      transformDispute,
    )
  }

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const res = await this.client(credentials).get<{ data?: RawPinDispute }>(`/disputes/${id}`)
    return transformDispute(res.data ?? {})
  }

  // ── Plans ───────────────────────────────────────────────────────────────────

  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    return this.listPaged<RawPinPlan, Plan>(credentials, params, '/plans', transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const res = await this.client(credentials).get<{ data?: RawPinPlan }>(`/plans/${id}`)
    return transformPlan(res.data ?? {})
  }

  // ── Subscriptions ───────────────────────────────────────────────────────────

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    return this.listPaged<RawPinSubscription, Subscription>(
      credentials,
      params,
      '/subscriptions',
      transformSubscription,
    )
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<{ data?: RawPinSubscription }>(
      `/subscriptions/${id}`,
    )
    return transformSubscription(res.data ?? {})
  }
}
