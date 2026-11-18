/**
 * Paydock adapter — payments vertical.
 *
 * Auth: API Secret Key in the `x-user-secret-key` header (see client.ts).
 *
 * API reference: Paydock's Postman collection
 * https://documenter.getpostman.com/view/6912944/Uyr5my5q (JSON at
 * https://documenter.gw.postman.com/api/collections/6912944/Uyr5my5q).
 * Its 111 requests have no balance-transactions, disputes, invoices, payouts
 * or plans list; those methods refuse with 501 before sending anything.
 * Refunds and payment sources are nested in charges and customers and are
 * flattened out of those searches.
 */

import {
  connectionScope,
  pageByRows,
  pageOffset,
  reportUpstreamPage,
  type BaseAdapter,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { Dispute } from '../../schema/dispute'
import type { Invoice } from '../../schema/invoice'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Payout } from '../../schema/payout'
import type { Plan } from '../../schema/plan'
import type { Subscription } from '../../schema/subscription'

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { PaydockClient } from './client'
import { verifyPaydockWebhook, parsePaydockWebhookEvents } from './webhook'

import { transformCustomer, type RawPaydockCustomer } from './transform/customer'
import { transformCharge, type RawPaydockCharge } from './transform/charge'
import { transformRefund, type RawPaydockRefund } from './transform/refund'
import {
  transformRefundTransaction,
  type RawPaydockTransaction,
} from './transform/refund-transaction'
import { transformPaymentMethod, type RawPaydockPaymentSource } from './transform/payment-method'
import { transformSubscription, type RawPaydockSubscription } from './transform/subscription'
import { requireId } from './transform/shared'

/**
 * The `{ status, error, resource }` envelope Paydock's search endpoints answer
 * with; `resource.count` is the number of matching rows across all pages.
 */
interface PaydockSearchResponse<T> {
  resource?: { data?: T[]; count?: number; limit?: number; skip?: number }
}

/**
 * Oldest-first order for every offset walk. customers/search, charges/search
 * and subscriptions/search document "sortkey … Sorting key parameter i.e.
 * created_at" and "sortdirection … ASC or DESC ( DESC by default)". Under the
 * DESC default a row created mid-walk shifts every later offset and repeats a
 * row; ascending creation order keeps earlier offsets stable.
 */
const SORT = { sortkey: 'created_at', sortdirection: 'ASC' } as const

/**
 * One offset page of a Paydock search endpoint (customers, charges,
 * subscriptions): documented `skip` ("skip first n … from list, default = 0")
 * and `limit` ("default = 100 , maximum value = 1000"). The caller's limit is
 * sent as is up to that maximum; a clamped size is reported so every
 * short-page judgement uses it. `resource.count` makes `hasMore` exact.
 */
async function searchPage<T>(
  client: PaydockClient,
  path: string,
  params: QueryParams,
): Promise<T[]> {
  const asked = params.limit
  const size =
    typeof asked === 'number' && Number.isFinite(asked) && asked >= 1
      ? Math.min(Math.floor(asked), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE
  if (typeof asked === 'number' && size < asked) reportUpstreamPage(params, { pageSize: size })
  const skip = pageOffset(params, size)
  const res = await client.get<PaydockSearchResponse<T>>(path, { limit: size, skip, ...SORT })
  const rows = res?.resource?.data ?? []
  const count = res?.resource?.count
  if (typeof count === 'number') {
    reportUpstreamPage(params, { totalCount: count, hasMore: skip + rows.length < count })
  } else if (rows.length < size) {
    reportUpstreamPage(params, { hasMore: false })
  }
  return rows
}

/** One resource from a Paydock get-by-id: `{ status, error, resource: { type, data } }`. */
interface PaydockGetResponse<T> {
  resource?: { data?: T }
}

async function getOne<T>(client: PaydockClient, path: string, what: string): Promise<T> {
  const res = await client.get<PaydockGetResponse<T>>(path)
  const data = res?.resource?.data
  if (!data || typeof data !== 'object')
    throw new Error(`Paydock returned no resource.data for ${what}`)
  return data
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * Parents per upstream page when flattening children (payment sources out of
 * customers, refund transactions out of charges): the documented search
 * default ("default = 100"). Fixed, so the walk's marks do not depend on the
 * caller's limit.
 */
const CHILD_WALK_PAGE = 100

/**
 * Rows flattened out of a Paydock search, paged with pageByRows. The cursor
 * is `skip`; the walk ends on `resource.count`, or on a short or empty page
 * when the count is absent.
 */
async function walkChildren<P, R>(
  client: PaydockClient,
  path: string,
  key: string,
  params: QueryParams,
  extract: (parent: P) => R[],
): Promise<R[]> {
  const size = CHILD_WALK_PAGE
  const { items } = await pageByRows<R, number>(key, params, async (cursor) => {
    const skip = cursor ?? 0
    const res = await client.get<PaydockSearchResponse<P>>(path, { limit: size, skip, ...SORT })
    const parents = res?.resource?.data ?? []
    const count = res?.resource?.count
    const rows = parents.flatMap(extract)
    const reached = skip + parents.length
    const more =
      parents.length > 0 && (typeof count === 'number' ? reached < count : parents.length >= size)
    return { items: rows, next: more ? reached : undefined }
  })
  return items
}

/** A customer's live payment sources: archived ones ("A deleted payment source") are skipped. */
function customerSources(c: RawPaydockCustomer): PaymentMethod[] {
  const customerId = requireId(c['_id'], 'customer')
  const sources = Array.isArray(c['payment_sources'])
    ? (c['payment_sources'] as RawPaydockPaymentSource[])
    : []
  const defaultSourceId = typeof c['default_source'] === 'string' ? c['default_source'] : undefined
  return sources
    .filter((src) => src['status'] !== 'archived')
    .map((src) => transformPaymentMethod(src, { customerId, defaultSourceId }))
}

export class PaydockAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'paydock'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Paydock uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Paydock uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'Secret Key',
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
    return verifyPaydockWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePaydockWebhookEvents(payload)
  }

  private client(credentials: Credentials): PaydockClient {
    return new PaydockClient(credentials)
  }

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await searchPage<RawPaydockCustomer>(
      this.client(credentials),
      '/customers',
      params,
    )
    return rows.map(transformCustomer)
  }

  /** customers/get: GET /v1/customers/:id ("Retrieves data on the customer with specified ID"). */
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    return transformCustomer(
      await getOne<RawPaydockCustomer>(
        this.client(credentials),
        `/customers/${encodeURIComponent(id)}`,
        `customer ${id}`,
      ),
    )
  }

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await searchPage<RawPaydockCharge>(this.client(credentials), '/charges', params)
    return rows.map(transformCharge)
  }

  /** charges/get: GET /v1/charges/:id. */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    return transformCharge(
      await getOne<RawPaydockCharge>(
        this.client(credentials),
        `/charges/${encodeURIComponent(id)}`,
        `charge ${id}`,
      ),
    )
  }

  /**
   * Refund transactions flattened out of charges/search (GET /v1/charges):
   * every charge documents "transactions + array All transactions within the
   * charge", and the Transaction types table lists "refund A refund
   * transaction". chargeId is the parent charge's `_id`.
   */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const key = `paydock:refunds:${CHILD_WALK_PAGE}:${connectionScope('paydock', credentials)}`
    return walkChildren<RawPaydockCharge, Refund>(
      this.client(credentials),
      '/charges',
      key,
      params,
      (charge) => {
        const chargeId = requireId(charge['_id'], 'charge')
        const txs = Array.isArray(charge['transactions'])
          ? (charge['transactions'] as RawPaydockTransaction[])
          : []
        return txs
          .filter((t) => t['type'] === 'refund')
          .map((t) => transformRefundTransaction(t, chargeId))
      },
    )
  }

  /**
   * Write method, out of scope for this rebuild. POST /refunds is not in
   * Paydock's API reference; the documented route is POST /v1/charges/:id/refunds.
   */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawPaydockRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }

  // ── Balance Transactions ───────────────────────────────────────────────────

  async listBalanceTransactions(): Promise<BalanceTransaction[]> {
    throw notSupported(
      'Paydock cannot list balance transactions: its API has no balance or transactions ledger; transactions exist only nested in charges (view_mode "Used for charge decomposition.")',
    )
  }

  async getBalanceTransaction(): Promise<BalanceTransaction> {
    throw notSupported('Paydock cannot read balance transactions: its API has no balance ledger')
  }

  // ── Disputes ───────────────────────────────────────────────────────────────

  async listDisputes(): Promise<Dispute[]> {
    throw notSupported(
      'Paydock cannot list disputes: its API reference documents no disputes resource',
    )
  }

  async getDispute(): Promise<Dispute> {
    throw notSupported(
      'Paydock cannot read disputes: its API reference documents no disputes resource',
    )
  }

  // ── Invoices ───────────────────────────────────────────────────────────────

  async listInvoices(): Promise<Invoice[]> {
    throw notSupported(
      'Paydock cannot list invoices: its API reference documents no invoices resource',
    )
  }

  async getInvoice(): Promise<Invoice> {
    throw notSupported(
      'Paydock cannot read invoices: its API reference documents no invoices resource',
    )
  }

  // ── Payment Methods ────────────────────────────────────────────────────────

  /**
   * Payment sources flattened out of customers/search (GET /v1/customers),
   * whose customer resource documents "payment_sources + Array Collection with
   * payment information". The dedicated customers/get payment sources route
   * takes the API Public Key (`x-user-public-key`), which this connection
   * does not hold. Archived sources ("A deleted payment source") are skipped.
   *
   * Upstream pages are fixed at {@link CHILD_WALK_PAGE} customers (see
   * {@link walkChildren}).
   */
  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const key = `paydock:payment-sources:${CHILD_WALK_PAGE}:${connectionScope('paydock', credentials)}`
    return walkChildren<RawPaydockCustomer, PaymentMethod>(
      this.client(credentials),
      '/customers',
      key,
      params,
      customerSources,
    )
  }

  /**
   * customers/search filtered by the documented `payment_source_id` ("ID of a
   * stored customers payment_source"), then the matching entry of the
   * customer's `payment_sources[]`.
   */
  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const res = await this.client(credentials).get<PaydockSearchResponse<RawPaydockCustomer>>(
      '/customers',
      { payment_source_id: id },
    )
    for (const c of res?.resource?.data ?? []) {
      const found = customerSources(c).find((pm) => pm.id === id)
      if (found) return found
    }
    throw Object.assign(new Error(`Paydock payment source ${id} not found`), { statusCode: 404 })
  }

  // ── Payouts ────────────────────────────────────────────────────────────────

  async listPayouts(): Promise<Payout[]> {
    throw notSupported(
      'Paydock cannot list payouts: its API reference has no payouts resource. Transfers (transfers/search) carry a nested payouts[] array; whether those map to canonical payouts is an open decision, so this refuses until it is made',
    )
  }

  async getPayout(): Promise<Payout> {
    throw notSupported('Paydock cannot read payouts: its API reference has no payouts resource')
  }

  // ── Plans ──────────────────────────────────────────────────────────────────

  async listPlans(): Promise<Plan[]> {
    throw notSupported(
      'Paydock cannot list plans: its API reference has no plans resource; a subscription carries its schedule inline',
    )
  }

  async getPlan(): Promise<Plan> {
    throw notSupported('Paydock cannot read plans: its API reference has no plans resource')
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const rows = await searchPage<RawPaydockSubscription>(
      this.client(credentials),
      '/subscriptions',
      params,
    )
    return rows.map(transformSubscription)
  }

  /** subscriptions/get: GET /v1/subscriptions/:id. */
  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    return transformSubscription(
      await getOne<RawPaydockSubscription>(
        this.client(credentials),
        `/subscriptions/${encodeURIComponent(id)}`,
        `subscription ${id}`,
      ),
    )
  }
}
