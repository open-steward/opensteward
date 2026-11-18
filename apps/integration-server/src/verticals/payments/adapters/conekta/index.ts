/**
 * Conekta adapter — payments vertical (LatAm anchor, Mexico-first).
 *
 * Conekta is order-centric: an **Order** carries the amount, currency,
 * customer and payment status, so it maps onto the canonical **Charge**.
 * Customers are a first-class resource. Refunds are taken against an order
 * (`POST /orders/{id}/refunds`); there is no standalone refund list, so only
 * `createRefund` is implemented.
 *
 * Auth: a single private API key sent as a Bearer token. The key itself
 * selects sandbox vs live, so there is no host/mode flag. No OAuth, no
 * refresh. The API version is pinned via the `Accept` vendor media type.
 *
 * Webhooks: RSA-SHA256 signature in the `digest` header, verified with a
 * Conekta-provided RSA public key (see webhook.ts).
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:    charge, customer, refund, balance-transaction, payout, plan
// Unavailable:  subscription — only accessible per-customer at /customers/{id}/subscriptions; no global list endpoint
// Unavailable:  payment-method — only accessible per-customer at /customers/{id}/payment_sources; listPaymentMethods has no customerId
// Unavailable:  dispute — Conekta has no dedicated dispute/chargeback list endpoint; chargebacks are nested in order objects and surfaced via webhooks only
// Unavailable:  invoice — the Conekta invoice endpoint (services.conekta.com/reports/v1/invoices) is a billing-commission report on a separate host and does not map to the canonical Invoice schema

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
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
import type { Payout } from '../../schema/payout'
import type { Plan } from '../../schema/plan'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  ORDERS_PATH,
  CUSTOMERS_PATH,
  TRANSACTIONS_PATH,
  PAYOUT_ORDERS_PATH,
  PLANS_PATH,
  orderRefundsPath,
} from './constants'
import { buildCredentials } from './auth'
import { ConektaClient, type ConektaListResponse } from './client'
import { parseConektaWebhookEvents, verifyConektaWebhook } from './webhook'

import {
  transformBalanceTransaction,
  type RawConektaTransaction,
} from './transform/balance-transaction'
import { transformCustomer, type RawConektaCustomer } from './transform/customer'
import { transformCharge, type RawConektaOrder } from './transform/charge'
import { transformPayout, type RawConektaPayoutOrder } from './transform/payout'
import { transformPlan, type RawConektaPlan } from './transform/plan'
import {
  transformRefund,
  extractRefund,
  type RawConektaRefundedOrder,
} from './transform/refund'

/** The `next` query param of a Conekta `next_page_url`, or undefined. */
function nextCursor(url: string | null | undefined): string | undefined {
  if (typeof url !== 'string' || url === '') return undefined
  try {
    const next = new URL(url, 'https://api.conekta.io').searchParams.get('next')
    return next ? next : undefined
  } catch {
    return undefined
  }
}

export class ConektaAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'conekta'
  readonly version = '0.1.0'

  /** Every list endpoint documents `limit` with "the maximum value is 250". */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('Conekta uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Conekta uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'Private API key',
        type: 'password',
        required: true,
        placeholder: 'key_xxxxxxxxxxxxxxxx',
        helpText:
          'Your Conekta private key (Settings → API Keys). The key itself selects sandbox vs production.',
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
    return verifyConektaWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseConektaWebhookEvents(payload)
  }

  private client(credentials: Credentials): ConektaClient {
    return new ConektaClient(credentials)
  }

  /**
   * One caller page of a Conekta list.
   *
   * Every list endpoint is an opaque cursor walk: `limit` ("The numbers of
   * items to return, the maximum value is 250") plus `next` ("next page"),
   * with `has_more` ("Indicates if there are more pages to be requested") and
   * `next_page_url` (documented as
   * "https://api.conekta.io/resources?limit=10&next=chrg_1") in the envelope.
   * https://developers.conekta.com/reference/getcustomers.md
   *
   * The cursor is read from `next_page_url`'s `next` query param rather than
   * assumed to be the last row's id: the pagination guide's own example
   * carries a `next` that is not. `has_more` false, or a next URL with no
   * cursor in it, ends the walk. The 1-based `page` is mapped onto that chain
   * by {@link pageByCursor}, keyed per connection (the API key never rotates).
   *
   * A caller who passes a raw `next` / `previous` cursor gets that one
   * upstream page as-is, outside the pager.
   */
  private async pageList<R>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
  ): Promise<R[]> {
    const requested = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const asked =
      Number.isFinite(requested) && requested >= 1 ? Math.floor(requested) : DEFAULT_PAGE_SIZE
    const limit = Math.min(MAX_PAGE_SIZE, asked)
    const client = this.client(credentials)
    const fetchPage = async (
      cursor: Record<string, string>,
    ): Promise<{ items: R[]; next?: string }> => {
      const res = await client.get<ConektaListResponse<R>>(path, { limit, ...cursor })
      const next = res.has_more === true ? nextCursor(res.next_page_url) : undefined
      return {
        items: res.data ?? [],
        next: next !== undefined && next !== cursor.next ? next : undefined,
      }
    }

    const raw: Record<string, string> = {}
    if (typeof params.next === 'string') raw.next = params.next
    if (typeof params.previous === 'string') raw.previous = params.previous
    let items: R[]
    let hasMore: boolean
    if (Object.keys(raw).length > 0) {
      const page = await fetchPage(raw)
      items = page.items
      hasMore = page.next !== undefined
    } else {
      const key = cursorPagerKey(connectionScope('conekta', credentials), path, { limit })
      ;({ items, hasMore } = await pageByCursor<R>(key, params.page, (cursor) =>
        fetchPage(cursor === undefined ? {} : { next: cursor }),
      ))
    }
    reportUpstreamPage(params, limit < asked ? { hasMore, pageSize: limit } : { hasMore })
    return items
  }

  // ── Charges (Conekta Orders) ───────────────────────────────────────────────
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.pageList<RawConektaOrder>(credentials, params, ORDERS_PATH)
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawConektaOrder>(`${ORDERS_PATH}/${id}`)
    return transformCharge(res ?? {})
  }

  // ── Customers ───────────────────────────────────────────────────────────────
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await this.pageList<RawConektaCustomer>(credentials, params, CUSTOMERS_PATH)
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawConektaCustomer>(`${CUSTOMERS_PATH}/${id}`)
    return transformCustomer(res ?? {})
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const res = await this.client(credentials).post<RawConektaCustomer>(CUSTOMERS_PATH, {
      name: data.name,
      email: data.email,
      phone: data.phone,
      metadata: data.metadata,
    })
    return transformCustomer(res ?? {})
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).post<RawConektaCustomer>(
      `${CUSTOMERS_PATH}/${id}`,
      {
        name: data.name,
        email: data.email,
        phone: data.phone,
        metadata: data.metadata,
      },
    )
    return transformCustomer(res ?? {})
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    // Conekta DELETE /customers/{id} returns the deleted customer; we discard it.
    await this.client(credentials).delete<RawConektaCustomer>(`${CUSTOMERS_PATH}/${id}`)
  }

  // ── Balance transactions (GET /transactions) ──────────────────────────────
  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    const rows = await this.pageList<RawConektaTransaction>(credentials, params, TRANSACTIONS_PATH)
    return rows.map(transformBalanceTransaction)
  }

  async getBalanceTransaction(credentials: Credentials, id: string): Promise<BalanceTransaction> {
    const res = await this.client(credentials).get<RawConektaTransaction>(
      `${TRANSACTIONS_PATH}/${id}`,
    )
    return transformBalanceTransaction(res ?? {})
  }

  // ── Payouts (GET /payout_orders) ──────────────────────────────────────────
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const rows = await this.pageList<RawConektaPayoutOrder>(credentials, params, PAYOUT_ORDERS_PATH)
    return rows.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<RawConektaPayoutOrder>(
      `${PAYOUT_ORDERS_PATH}/${id}`,
    )
    return transformPayout(res ?? {})
  }

  // ── Plans (GET /plans) ────────────────────────────────────────────────────
  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const rows = await this.pageList<RawConektaPlan>(credentials, params, PLANS_PATH)
    return rows.map(transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const res = await this.client(credentials).get<RawConektaPlan>(`${PLANS_PATH}/${id}`)
    return transformPlan(res ?? {})
  }

  // ── Refunds (POST /orders/{id}/refunds) ──────────────────────────────────────
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const orderId = data.chargeId
    if (!orderId) throw new Error('chargeId (Conekta order id) is required for a refund')
    const res = await this.client(credentials).post<RawConektaRefundedOrder>(
      orderRefundsPath(orderId),
      {
        amount: data.amount,
        reason: data.reason,
      },
    )
    const extracted = extractRefund(res ?? {})
    if (extracted) {
      return transformRefund(extracted.refund, extracted.orderId, extracted.orderCurrency)
    }
    // Fall back to a synthetic refund keyed on the order when the response
    // omits the refund line (never throw out of the resource method).
    return transformRefund(
      { amount: data.amount, currency: data.currency, status: 'pending', reason: data.reason },
      orderId,
      data.currency,
    )
  }
}
