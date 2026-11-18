/**
 * Stripe adapter — reference implementation for the payments vertical.
 *
 * Wires Stripe Connect OAuth, the cursor-paginated Stripe REST API, and the
 * webhook signature scheme to the canonical payments schema. Covers Tier-1
 * (customers, payment methods, charges, refunds, subscriptions, invoices +
 * line items, payouts, disputes) and Tier-2 (plans, prices, products,
 * balance transactions) resources.
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
  simpleApiKey,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Customer } from '../../schema/customer'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { Invoice, InvoiceLineItem } from '../../schema/invoice'
import type { Payout } from '../../schema/payout'
import type { Dispute } from '../../schema/dispute'
import type { Plan, Price, Product } from '../../schema/plan'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as stripeExchangeCode, refreshCredentials as stripeRefresh } from './auth'
import { StripeClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, MAX_PAGE_SIZE } from './constants'
import { verifyStripeWebhook, parseStripeWebhookEvents } from './webhook'

import { transformCustomer, untransformCustomer, type RawStripeCustomer } from './transform/customer'
import { transformPaymentMethod, type RawStripePaymentMethod } from './transform/payment-method'
import { transformCharge, untransformCharge, type RawStripeCharge } from './transform/charge'
import { transformRefund, untransformRefund, type RawStripeRefund } from './transform/refund'
import {
  transformSubscription,
  untransformSubscription,
  type RawStripeSubscription,
} from './transform/subscription'
import { transformInvoice, untransformInvoice, type RawStripeInvoice } from './transform/invoice'
import {
  transformInvoiceLineItem,
  type RawStripeInvoiceLineItem,
} from './transform/invoice-line-item'
import { transformPayout, type RawStripePayout } from './transform/payout'
import { transformDispute, type RawStripeDispute } from './transform/dispute'
import { transformPlan, type RawStripePlan } from './transform/plan'
import { transformPrice, type RawStripePrice } from './transform/price'
import { transformProduct, type RawStripeProduct } from './transform/product'
import {
  transformBalanceTransaction,
  type RawStripeBalanceTransaction,
} from './transform/balance-transaction'

export interface StripeAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/**
 * Static secret-key connect. Stripe Connect OAuth is for *other people's*
 * accounts; your own account — and every test-mode account — is reached with
 * a fixed `sk_…` / `rk_…` key and no OAuth ceremony. The key is the bearer
 * token `StripeClient` already sends, so the exchange is a straight store.
 */
const SECRET_KEY_FORM = simpleApiKey({
  fieldName: 'apiKey',
  label: 'Secret key',
  placeholder: 'sk_test_… / sk_live_… / rk_…',
  helpText:
    'Stripe Dashboard → Developers → API keys. A test-mode key (sk_test_…) connects a test account; a restricted key (rk_…) with read access is enough for sync.',
})

export class StripeAdapter implements PaymentsAdapter {
  // Connect Link support — single secret-key form, alongside Connect OAuth.
  credentialFields = SECRET_KEY_FORM.credentialFields
  exchangeCredentials = SECRET_KEY_FORM.exchangeCredentials

  readonly platform = 'stripe'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: StripeAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return stripeExchangeCode(code, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return stripeRefresh(credentials, this.clientSecret)
  }

  /** Stripe connected-account id (`acct_…`) captured at OAuth, matched against
   *  the `account` field on inbound Connect webhook events. */
  externalAccountId(credentials: Credentials): string | undefined {
    const id = credentials.extra?.['stripeUserId']
    return typeof id === 'string' && id ? id : undefined
  }

  /** Register a Stripe webhook endpoint for this connection. Stripe returns
   *  the per-endpoint signing secret (`whsec_…`) once, on creation — the
   *  caller persists it as the connection's webhookSecret. */
  async registerWebhook(
    credentials: Credentials,
    callbackUrl: string,
  ): Promise<{ id?: string; secret?: string }> {
    const res = await this.client(credentials).post<{ id: string; secret?: string }>(
      '/webhook_endpoints',
      { url: callbackUrl, enabled_events: ['*'] },
    )
    return { id: res.id, secret: res.secret }
  }

  /** Delete a previously-registered Stripe webhook endpoint. */
  async unregisterWebhook(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/webhook_endpoints/${id}`)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyStripeWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseStripeWebhookEvents(payload)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private client(credentials: Credentials): StripeClient {
    return new StripeClient(credentials)
  }

  /**
   * Pager scope for ONE connection: the connected account (`acct_…`) when
   * Connect OAuth captured one, and a fingerprint of this connection's token
   * (`connectionScope`), never the token itself.
   */
  private pagerScope(credentials: Credentials): string {
    return connectionScope(`stripe:${this.externalAccountId(credentials) ?? 'self'}`, credentials)
  }

  /** Filters that apply to every Stripe list call; paging is `listPage`'s. */
  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    if (params['ending_before']) out.ending_before = params['ending_before']
    if (params.updatedAfter instanceof Date) {
      out['created[gte]'] = Math.floor(params.updatedAfter.getTime() / 1000)
    } else if (typeof params['updated_after'] === 'string') {
      out['created[gte]'] = Math.floor(new Date(String(params['updated_after'])).getTime() / 1000)
    }
    return out
  }

  /**
   * One page of a Stripe list, in the `{ page, limit }` terms every caller
   * speaks.
   *
   * Stripe paginates by cursor (`starting_after`), and one request takes at
   * most 100 rows (https://docs.stripe.com/api/pagination: "This specifies a
   * limit on the number of objects to return, ranging between 1 and 100.").
   * The sync worker asks for page 1, 2, 3 … of 500 and stops on the first
   * short page, so one request per page cannot serve it: this helper never
   * sends a limit above 100, and fills a larger page from several requests.
   *
   * A caller that passes `cursor` (the live route's own cursor pagination)
   * gets exactly that Stripe page. Otherwise the requested page is reached by
   * walking from the start: page N of `limit` rows skips (N-1)·limit rows,
   * then collects `limit`, 100 at a time. That is N requests for page N and
   * O(P²) for a full walk — cheap at 100 rows a request, and stateless, which
   * a cursor cache keyed on credentials would not be.
   *
   * `page` and `limit` arrive as strings from the router's query and as
   * numbers from the worker, so both are coerced here.
   */
  private async listPage<T extends { id: string }>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    extra: Record<string, unknown> = {},
  ): Promise<T[]> {
    const client = this.client(credentials)
    const base = { ...this.listParams(params), ...extra }
    const limit = Math.max(1, Math.floor(Number(params.limit)) || DEFAULT_PAGE_SIZE)

    if (params['cursor']) {
      const res = await client.list<T>(path, {
        ...base,
        starting_after: params['cursor'],
        limit: Math.min(limit, MAX_PAGE_SIZE),
      })
      return res.data
    }

    const page = Math.max(1, Math.floor(Number(params.page)) || 1)
    let skip = (page - 1) * limit
    let want = limit
    let startingAfter: string | undefined
    const out: T[] = []
    while (want > 0) {
      const res = await client.list<T>(path, {
        ...base,
        limit: Math.min(MAX_PAGE_SIZE, skip > 0 ? MAX_PAGE_SIZE : want),
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      })
      const rows = res.data
      if (rows.length === 0) break
      startingAfter = rows[rows.length - 1]!.id
      if (skip >= rows.length) {
        skip -= rows.length
      } else {
        const take = rows.slice(skip, skip + want)
        skip = 0
        out.push(...take)
        want -= take.length
      }
      if (!res.has_more) break
    }
    return out
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await this.listPage<RawStripeCustomer>(credentials, '/customers', params)
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawStripeCustomer>(`/customers/${id}`)
    return transformCustomer(raw)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const raw = await this.client(credentials).post<RawStripeCustomer>('/customers', untransformCustomer(data))
    return transformCustomer(raw)
  }

  async updateCustomer(credentials: Credentials, id: string, data: Partial<Customer>): Promise<Customer> {
    const raw = await this.client(credentials).post<RawStripeCustomer>(`/customers/${id}`, untransformCustomer(data))
    return transformCustomer(raw)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/customers/${id}`)
  }

  // ── Payment methods ───────────────────────────────────────────────────────

  async listPaymentMethods(credentials: Credentials, params: QueryParams): Promise<PaymentMethod[]> {
    const customerId = params['customer_id'] ?? params['customer']
    if (customerId) {
      const rows = await this.listPage<RawStripePaymentMethod>(
        credentials,
        `/customers/${customerId}/payment_methods`,
        params,
      )
      return rows.map(transformPaymentMethod)
    }
    // Stripe has no account-wide payment-method list; they hang off customers.
    // The sync worker (and a bare GET /payment_methods) asks for all of them,
    // and used to be refused — so the resource failed every sync. Walk the
    // customers and collect instead. `page`/`limit` apply to the customer
    // walk — a page is the saved methods of one page of customers — which is
    // what lets the worker's short-page stop condition end the walk.
    const customers = await this.listPage<RawStripeCustomer>(credentials, '/customers', params)
    const out: PaymentMethod[] = []
    for (const customer of customers) {
      const rows = await this.listPage<RawStripePaymentMethod>(
        credentials,
        `/customers/${customer.id}/payment_methods`,
        { limit: MAX_PAGE_SIZE },
      )
      out.push(...rows.map(transformPaymentMethod))
    }
    return out
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const raw = await this.client(credentials).get<RawStripePaymentMethod>(`/payment_methods/${id}`)
    return transformPaymentMethod(raw)
  }

  async detachPaymentMethod(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).post(`/payment_methods/${id}/detach`)
  }

  // ── Charges ───────────────────────────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.listPage<RawStripeCharge>(credentials, '/charges', params)
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawStripeCharge>(`/charges/${id}`)
    return transformCharge(raw)
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const raw = await this.client(credentials).post<RawStripeCharge>('/charges', untransformCharge(data))
    return transformCharge(raw)
  }

  async captureCharge(credentials: Credentials, id: string, data?: { amount?: number }): Promise<Charge> {
    const body: Record<string, unknown> = {}
    if (data?.amount !== undefined) body.amount = data.amount
    const raw = await this.client(credentials).post<RawStripeCharge>(`/charges/${id}/capture`, body)
    return transformCharge(raw)
  }

  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    // `id` is a charge id (ch_…); POST /v1/charges/{id} has no `status` field,
    // so it cannot cancel anything. Read the charge to find its PaymentIntent:
    // when one exists, PaymentIntent.cancel is the real cancel operation
    // (POST /payment_intents/{pi}/cancel — it returns a PaymentIntent, not a
    // Charge, hence the re-read below). A legacy charge with no PaymentIntent
    // was captured outright, so "cancel" means refunding it.
    const client = this.client(credentials)
    const charge = await client.get<RawStripeCharge>(`/charges/${id}`)
    if (charge.payment_intent) {
      await client.post(`/payment_intents/${charge.payment_intent}/cancel`)
    } else {
      await client.post('/refunds', { charge: id })
    }
    const raw = await client.get<RawStripeCharge>(`/charges/${id}`)
    return transformCharge(raw)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const rows = await this.listPage<RawStripeRefund>(credentials, '/refunds', params)
    return rows.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const raw = await this.client(credentials).get<RawStripeRefund>(`/refunds/${id}`)
    return transformRefund(raw)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const raw = await this.client(credentials).post<RawStripeRefund>('/refunds', untransformRefund(data))
    return transformRefund(raw)
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const rows = await this.listPage<RawStripeSubscription>(credentials, '/subscriptions', params)
    return rows.map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const raw = await this.client(credentials).get<RawStripeSubscription>(`/subscriptions/${id}`)
    return transformSubscription(raw)
  }

  async createSubscription(credentials: Credentials, data: Partial<Subscription>): Promise<Subscription> {
    const raw = await this.client(credentials).post<RawStripeSubscription>(
      '/subscriptions',
      untransformSubscription(data),
    )
    return transformSubscription(raw)
  }

  async updateSubscription(
    credentials: Credentials,
    id: string,
    data: Partial<Subscription>,
  ): Promise<Subscription> {
    const raw = await this.client(credentials).post<RawStripeSubscription>(
      `/subscriptions/${id}`,
      untransformSubscription(data),
    )
    return transformSubscription(raw)
  }

  async cancelSubscription(
    credentials: Credentials,
    id: string,
    data?: { atPeriodEnd?: boolean },
  ): Promise<Subscription> {
    if (data?.atPeriodEnd) {
      const raw = await this.client(credentials).post<RawStripeSubscription>(`/subscriptions/${id}`, {
        cancel_at_period_end: true,
      })
      return transformSubscription(raw)
    }
    const raw = await this.client(credentials).delete<RawStripeSubscription>(`/subscriptions/${id}`)
    return transformSubscription(raw)
  }

  // ── Invoices ──────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const rows = await this.listPage<RawStripeInvoice>(credentials, '/invoices', params)
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const raw = await this.client(credentials).get<RawStripeInvoice>(`/invoices/${id}`)
    return transformInvoice(raw)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const raw = await this.client(credentials).post<RawStripeInvoice>('/invoices', untransformInvoice(data))
    return transformInvoice(raw)
  }

  async updateInvoice(credentials: Credentials, id: string, data: Partial<Invoice>): Promise<Invoice> {
    const raw = await this.client(credentials).post<RawStripeInvoice>(`/invoices/${id}`, untransformInvoice(data))
    return transformInvoice(raw)
  }

  async voidInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const raw = await this.client(credentials).post<RawStripeInvoice>(`/invoices/${id}/void`)
    return transformInvoice(raw)
  }

  async payInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const raw = await this.client(credentials).post<RawStripeInvoice>(`/invoices/${id}/pay`)
    return transformInvoice(raw)
  }

  /**
   * One page of an invoice's line items: `GET /v1/invoices/{id}/lines`.
   *
   * An id-keyset list (https://docs.stripe.com/api/invoices/invoice_lines):
   * "Limit can range between 1 and 100" and "`starting_after` is an object ID
   * that defines your place in the list"; `has_more` false marks the end.
   * Page N is reached through the shared cursor pager, which remembers the
   * `starting_after` that starts each page, so a sequential walk is one
   * request per page. The page is the caller's limit clamped to 100, and the
   * size sent is reported, so the router's `meta` judges a full page at the
   * size Stripe was asked for, not at a larger `limit`.
   *
   * It does not go through `listPage`: that sends `created[gte]` for
   * `updated_after`, which this endpoint does not document. It sends only
   * `limit` and `starting_after`.
   */
  async listInvoiceLineItems(
    credentials: Credentials,
    invoiceId: string,
    params: QueryParams,
  ): Promise<InvoiceLineItem[]> {
    const client = this.client(credentials)
    const path = `/invoices/${invoiceId}/lines`
    const asked = Math.max(1, Math.floor(Number(params.limit)) || DEFAULT_PAGE_SIZE)
    const limit = Math.min(asked, MAX_PAGE_SIZE)
    reportUpstreamPage(params, { pageSize: limit })
    const page = Math.max(1, Math.floor(Number(params.page)) || 1)
    const result = await pageByCursor<RawStripeInvoiceLineItem, string>(
      cursorPagerKey(this.pagerScope(credentials), path, { limit }),
      page,
      async (startingAfter) => {
        const res = await client.list<RawStripeInvoiceLineItem>(path, {
          limit,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        })
        const last = res.data[res.data.length - 1]
        return { items: res.data, next: res.has_more && last ? last.id : undefined }
      },
    )
    reportUpstreamPage(params, { hasMore: result.hasMore })
    return result.items.map((line) => transformInvoiceLineItem(line, invoiceId))
  }

  // ── Payouts ───────────────────────────────────────────────────────────────

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const rows = await this.listPage<RawStripePayout>(credentials, '/payouts', params)
    return rows.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const raw = await this.client(credentials).get<RawStripePayout>(`/payouts/${id}`)
    return transformPayout(raw)
  }

  // ── Disputes ──────────────────────────────────────────────────────────────

  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    const rows = await this.listPage<RawStripeDispute>(credentials, '/disputes', params)
    return rows.map(transformDispute)
  }

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const raw = await this.client(credentials).get<RawStripeDispute>(`/disputes/${id}`)
    return transformDispute(raw)
  }

  async submitDisputeEvidence(
    credentials: Credentials,
    id: string,
    data: Record<string, unknown>,
  ): Promise<Dispute> {
    const raw = await this.client(credentials).post<RawStripeDispute>(`/disputes/${id}`, { evidence: data })
    return transformDispute(raw)
  }

  // ── Plans / Prices / Products ─────────────────────────────────────────────

  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const rows = await this.listPage<RawStripePlan>(credentials, '/plans', params)
    return rows.map(transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const raw = await this.client(credentials).get<RawStripePlan>(`/plans/${id}`)
    return transformPlan(raw)
  }

  async listPrices(credentials: Credentials, params: QueryParams): Promise<Price[]> {
    const rows = await this.listPage<RawStripePrice>(credentials, '/prices', params)
    return rows.map(transformPrice)
  }

  async getPrice(credentials: Credentials, id: string): Promise<Price> {
    const raw = await this.client(credentials).get<RawStripePrice>(`/prices/${id}`)
    return transformPrice(raw)
  }

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const rows = await this.listPage<RawStripeProduct>(credentials, '/products', params)
    return rows.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawStripeProduct>(`/products/${id}`)
    return transformProduct(raw)
  }

  // ── Balance transactions ──────────────────────────────────────────────────

  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    const rows = await this.listPage<RawStripeBalanceTransaction>(
      credentials,
      '/balance_transactions',
      params,
    )
    return rows.map(transformBalanceTransaction)
  }

  async getBalanceTransaction(credentials: Credentials, id: string): Promise<BalanceTransaction> {
    const raw = await this.client(credentials).get<RawStripeBalanceTransaction>(`/balance_transactions/${id}`)
    return transformBalanceTransaction(raw)
  }
}
