/**
 * Recurly adapter — payments vertical (subscription-billing).
 *
 * Same gateway-indirection pattern as Chargebee: Recurly sits on top of
 * an underlying processor; we surface `Charge.gateway = 'recurly'` with
 * `Charge.metadata.processor` naming the actual money-mover.
 *
 * Auth: HTTP Basic with the API key as username (password blank).
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: balance-transaction — Recurly v3 API has no balance-transaction or ledger-entry endpoint; it is a billing layer on top of payment gateways and does not expose gateway-level settlement data.
// Unavailable: dispute — Recurly v3 API has no /disputes or /chargebacks endpoint; chargeback events are received only via gateway webhooks and managed through the Admin UI.
// Unavailable: payout — Recurly v3 API has no /payouts endpoint; Recurly delegates settlement and fund disbursement to the underlying payment gateway.

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
  reportUpstreamPage,
  type BaseAdapter,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Invoice } from '../../schema/invoice'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Plan } from '../../schema/plan'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import { API_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { RecurlyClient } from './client'
import { parseRecurlyWebhookEvents, verifyRecurlyWebhook } from './webhook'

import { transformCustomer, type RawRecurlyAccount } from './transform/customer'
import { transformSubscription, type RawRecurlySubscription } from './transform/subscription'
import { transformInvoice, type RawRecurlyInvoice } from './transform/invoice'
import { transformCharge, type RawRecurlyTransaction } from './transform/charge'
import { transformRefund, type RawRecurlyRefund } from './transform/refund'
import { transformPlan, type RawRecurlyPlan } from './transform/plan'
import { transformPaymentMethod, type RawRecurlyBillingInfo } from './transform/payment-method'

interface RecurlyList<T> {
  data?: T[]
  has_more?: boolean
  next?: string | null
}

/**
 * The request for a `next` link: its path and query, followed verbatim. The
 * schema calls it a "Path to subsequent page of results" and the Pagination
 * guide shows a full URL, so both are accepted, but an absolute URL must stay
 * on the API origin: the client sends the API key with every request.
 */
function nextPath(next: string): string {
  const url = new URL(next, API_BASE_URL)
  if (url.origin !== new URL(API_BASE_URL).origin) {
    throw new Error(`Recurly returned a next link on another origin: ${url.origin}`)
  }
  // A pathname of "//host/..." is a protocol-relative URL to axios, which
  // would drop the baseURL and send the key to that host.
  if (url.pathname.startsWith('//')) {
    throw new Error(`Recurly returned a next link with a host-like path: ${url.pathname}`)
  }
  return `${url.pathname}${url.search}`
}

export class RecurlyAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'recurly'
  readonly version = '0.1.0'
  /** Every list method pages at the caller's size up to this and reports its end. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('Recurly uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Recurly uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'Private API key',
        type: 'password',
        required: true,
        helpText: 'From Recurly dashboard → Integrations → API Credentials.',
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
    return verifyRecurlyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseRecurlyWebhookEvents(payload)
  }

  private client(credentials: Credentials): RecurlyClient {
    return new RecurlyClient(credentials)
  }

  /**
   * One caller page of a Recurly list endpoint.
   *
   * Every list endpoint takes `limit` ("Limit number of records 1-200.") and
   * no page or offset: "To page through every record, your code should
   * continually call the URL" in `next`, the "Path to subsequent page of
   * results.", while `has_more` "Indicates there are more results on
   * subsequent pages." Page N is reached by walking {@link pageByCursor}; the
   * `next` link already carries the cursor, limit and filters, so it is sent
   * with no params of its own. A direct call past 200 is clamped and reports
   * the page size actually used.
   *
   * The pager key carries the filters, so a /transactions cursor minted for
   * refunds never positions the unfiltered charges walk.
   */
  private async pageList<T>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    filters: Record<string, string> = {},
  ): Promise<T[]> {
    const asked =
      typeof params.limit === 'number' && Number.isFinite(params.limit)
        ? Math.max(1, Math.floor(params.limit))
        : DEFAULT_PAGE_SIZE
    const limit = Math.min(asked, MAX_PAGE_SIZE)
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope('recurly', credentials), path, {
      ...filters,
      limit,
    })
    const { items, hasMore } = await pageByCursor<T>(key, params.page, async (next) => {
      const res =
        next === undefined
          ? await client.get<RecurlyList<T>>(path, { ...filters, limit })
          : await client.get<RecurlyList<T>>(nextPath(next))
      return { items: res.data ?? [], next: res.has_more && res.next ? res.next : undefined }
    })
    reportUpstreamPage(params, limit < asked ? { hasMore, pageSize: limit } : { hasMore })
    return items
  }

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await this.pageList<RawRecurlyAccount>(credentials, params, '/accounts')
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawRecurlyAccount>(`/accounts/${id}`)
    return transformCustomer(raw)
  }

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const rows = await this.pageList<RawRecurlySubscription>(credentials, params, '/subscriptions')
    return rows.map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const raw = await this.client(credentials).get<RawRecurlySubscription>(`/subscriptions/${id}`)
    return transformSubscription(raw)
  }

  async cancelSubscription(
    credentials: Credentials,
    id: string,
    data?: { atPeriodEnd?: boolean },
  ): Promise<Subscription> {
    const path = data?.atPeriodEnd
      ? `/subscriptions/${id}/cancel`
      : `/subscriptions/${id}/terminate`
    const raw = await this.client(credentials).put<RawRecurlySubscription>(path)
    return transformSubscription(raw)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const rows = await this.pageList<RawRecurlyInvoice>(credentials, params, '/invoices')
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const raw = await this.client(credentials).get<RawRecurlyInvoice>(`/invoices/${id}`)
    return transformInvoice(raw)
  }

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.pageList<RawRecurlyTransaction>(credentials, params, '/transactions')
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawRecurlyTransaction>(`/transactions/${id}`)
    return transformCharge(raw)
  }

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const rows = await this.pageList<RawRecurlyRefund>(credentials, params, '/transactions', {
      type: 'refund',
    })
    return rows.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const raw = await this.client(credentials).get<RawRecurlyRefund>(`/transactions/${id}`)
    return transformRefund(raw)
  }

  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const rows = await this.pageList<RawRecurlyPlan>(credentials, params, '/plans')
    return rows.map(transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const raw = await this.client(credentials).get<RawRecurlyPlan>(`/plans/${id}`)
    return transformPlan(raw)
  }

  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    // Recurly billing info is per-account; list across recent accounts
    // The whole collection is at most the account's one billing_info record,
    // so it is paged locally and reports its end.
    const customerId = (params['customerId'] ?? params['customer_id']) as string | undefined
    if (!customerId) return pageLocally([], params)
    const raw = await this.client(credentials).get<RawRecurlyBillingInfo>(
      `/accounts/${customerId}/billing_info`,
    )
    return pageLocally([transformPaymentMethod(raw)], params)
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    // id = account_code (billing info is a singleton per account in Recurly)
    const raw = await this.client(credentials).get<RawRecurlyBillingInfo>(
      `/accounts/${id}/billing_info`,
    )
    return transformPaymentMethod(raw)
  }
}
