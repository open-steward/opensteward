/**
 * Xendit adapter — payments vertical (Southeast Asia anchor).
 *
 * Xendit is the leading payments infrastructure across Indonesia, the
 * Philippines, Vietnam, Thailand and Malaysia. It exposes Customers,
 * Invoices, Refunds and Payouts (v2) over a single REST host.
 *
 * Auth: secret API key over HTTP Basic auth (key as username, empty
 * password). Live keys start `xnd_production_…`; test keys `xnd_development_…`.
 * Environment is selected by the key prefix, not the URL.
 *
 * Docs: https://docs.xendit.co
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: dispute — Xendit has no REST API for disputes/chargebacks;
//   chargeback handling is an operational dashboard workflow only.
// Note: plan + subscription — only GET /recurring/plans/{id} is documented;
//   there is no list-all endpoint in the public API.

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Invoice } from '../../schema/invoice'
import type { Refund } from '../../schema/refund'
import type { Payout } from '../../schema/payout'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Plan } from '../../schema/plan'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE, INVOICES_MAX_PAGE_SIZE, TRANSACTIONS_MAX_PAGE_SIZE } from './constants'
import { XenditCredentialForm } from './auth'
import { XenditClient } from './client'
import { parseXenditWebhookEvents, verifyXenditWebhook } from './webhook'

import { transformCharge, type RawXenditPaymentRequest } from './transform/charge'
import { transformCustomer, type RawXenditCustomer } from './transform/customer'
import { transformInvoice, type RawXenditInvoice } from './transform/invoice'
import { transformRefund, type RawXenditRefund } from './transform/refund'
import { transformPayout, type RawXenditPayout } from './transform/payout'
import {
  transformBalanceTransaction,
  type RawXenditTransaction,
} from './transform/balance-transaction'
import { transformPaymentMethod, type RawXenditPaymentMethod } from './transform/payment-method'
import { transformPlan, type RawXenditRecurringPlan } from './transform/plan'
import { transformSubscription } from './transform/subscription'

/** Cursor-paginated list envelope used by the after_id-keyset list endpoints. */
interface XenditListEnvelope<T> {
  data?: T[]
  has_more?: boolean
  links?: Array<{ href?: string; rel?: string; method?: string }>
}

export class XenditAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'xendit'
  readonly version = '0.1.0'

  // ── Auth (API key over HTTP Basic — no OAuth) ─────────────────────────────

  getAuthUrl(): string {
    throw new Error('Xendit uses a secret API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Xendit uses a secret API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return XenditCredentialForm.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return XenditCredentialForm.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyXenditWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseXenditWebhookEvents(payload)
  }

  private client(credentials: Credentials): XenditClient {
    return new XenditClient(credentials)
  }

  /**
   * Page an id-keyset list endpoint by the caller's 1-based `page`.
   *
   * Every list Xendit pages is keyset-paged on a row id, never by page or
   * offset: `after_id` with a `{ data, has_more }` envelope on
   * /payment_requests, /refunds, /transactions and /v2/payment_methods ("Indicates whether there
   * are more items to be queried with after_id of the last item from the
   * current result."), and `last_invoice_id` with a bare array on /v2/invoices
   * ("last_invoice_id is an invoice ID that defines your starting point for
   * the list."). The bare array carries no end signal, so a full page is read
   * as "more". The walk is keyed per connection (the API key never rotates).
   *
   * `max` is the endpoint's documented maximum `limit`, or undefined where
   * none is documented; a larger caller limit is clamped and the smaller page
   * size reported.
   */
  private async pageList<R extends { id?: string }>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    opts: { cursorParam: 'after_id' | 'last_invoice_id'; envelope: boolean; max?: number },
  ): Promise<R[]> {
    const requested = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const asked =
      Number.isFinite(requested) && requested >= 1 ? Math.floor(requested) : DEFAULT_PAGE_SIZE
    const limit = opts.max === undefined ? asked : Math.min(opts.max, asked)
    const client = this.client(credentials)
    const fetchPage = async (
      cursor: string | undefined,
    ): Promise<{ items: R[]; next?: string }> => {
      const query: Record<string, unknown> = { limit }
      if (cursor !== undefined) query[opts.cursorParam] = cursor
      let items: R[]
      let more: boolean
      if (opts.envelope) {
        const res = await client.get<XenditListEnvelope<R>>(path, query)
        items = res?.data ?? []
        more = res?.has_more === true
      } else {
        const res = await client.get<R[]>(path, query)
        items = Array.isArray(res) ? res : []
        more = items.length >= limit
      }
      const lastId = items[items.length - 1]?.id
      return { items, next: more && lastId ? lastId : undefined }
    }
    const key = cursorPagerKey(connectionScope('xendit', credentials), path, { limit })
    const { items, hasMore } = await pageByCursor<R>(key, params.page, fetchPage)
    reportUpstreamPage(params, limit < asked ? { hasMore, pageSize: limit } : { hasMore })
    return items
  }

  // ── Payment Requests / Charges (Payment Requests API — v2) ───────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    // Payment Requests uses a cursor-envelope identical to the Refunds API.
    const rows = await this.pageList<RawXenditPaymentRequest>(
      credentials,
      params,
      '/payment_requests',
      { cursorParam: 'after_id', envelope: true },
    )
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawXenditPaymentRequest>(
      `/payment_requests/${id}`,
    )
    return transformCharge(res ?? {})
  }

  // ── Customers (Customers API) ─────────────────────────────────────────────

  /**
   * Refused: Xendit has no list-all for customers. GET /customers "Retrieves
   * an array with a customer object that matches the provided reference_id",
   * and reference_id is its only, Required, query parameter
   * (https://docs.xendit.co/apidocs/get-customers-list). No limit or cursor is
   * documented, so there is nothing to page.
   */
  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw Object.assign(
      new Error(
        'Xendit cannot list customers: GET /customers "Retrieves an array with a customer object that matches the provided reference_id" (reference_id is required)',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawXenditCustomer>(`/customers/${id}`)
    return transformCustomer(res ?? {})
  }

  // ── Invoices (Invoices API — v2) ──────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    // The Invoices API returns a bare JSON array, not an envelope.
    //
    // Cursor base is UNVERIFIED against a live account. The archived reference
    // says: "if you make a list request and receive 10 objects, starting with
    // obj_bar, your subsequent call can include last_invoice_id = obj_bar in
    // order to fetch the previous page of the list." Read literally, that is
    // the first row and a backwards step. We send the LAST row's id, the usual
    // keyset reading, which the parameter's name and the Stripe-style wording
    // this passage was copied from both support. Check against a sandbox.
    const rows = await this.pageList<RawXenditInvoice>(credentials, params, '/v2/invoices', {
      cursorParam: 'last_invoice_id',
      envelope: false,
      max: INVOICES_MAX_PAGE_SIZE,
    })
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).get<RawXenditInvoice>(`/v2/invoices/${id}`)
    return transformInvoice(res ?? {})
  }

  // ── Refunds (Refunds API) ─────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const rows = await this.pageList<RawXenditRefund>(credentials, params, '/refunds', {
      cursorParam: 'after_id',
      envelope: true,
    })
    return rows.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<RawXenditRefund>(`/refunds/${id}`)
    return transformRefund(res ?? {})
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId)
      throw new Error('chargeId (payment_request_id) required for a Xendit refund')
    const res = await this.client(credentials).post<RawXenditRefund>('/refunds', {
      payment_request_id: data.chargeId,
      amount: data.amount,
      currency: data.currency,
      reason: data.reason ? data.reason.toUpperCase() : undefined,
    })
    return transformRefund(res ?? {})
  }

  // ── Payouts (Payouts v2 API) ──────────────────────────────────────────────

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<RawXenditPayout>(`/v2/payouts/${id}`)
    return transformPayout(res ?? {})
  }

  // ── Balance Transactions (Transactions API) ───────────────────────────────

  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    const rows = await this.pageList<RawXenditTransaction>(credentials, params, '/transactions', {
      cursorParam: 'after_id',
      envelope: true,
      max: TRANSACTIONS_MAX_PAGE_SIZE,
    })
    return rows.map(transformBalanceTransaction)
  }

  async getBalanceTransaction(credentials: Credentials, id: string): Promise<BalanceTransaction> {
    const res = await this.client(credentials).get<RawXenditTransaction>(`/transactions/${id}`)
    return transformBalanceTransaction(res ?? {})
  }

  // ── Payment Methods (Payment Methods v2 API) ──────────────────────────────

  /**
   * GET https://api.xendit.co/v2/payment_methods — "This endpoints returns a
   * list of matching Payment Method objects based on the provided query."
   * limit: "Maximum number of resources to be returned in the response. Use
   * after_id and before_id to navigate to other resources. Default: 10" (no
   * maximum documented); has_more: "Indicates whether there are more items to
   * be queried with after_id of the last item from the current result."
   * https://archive.developers.xendit.co/api-reference/payments-api/#list-payment-methods
   *
   * Not the unversioned GET /payment_methods, which is the legacy Direct Debit
   * endpoint that needs a customer_id and returns a different object.
   */
  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const rows = await this.pageList<RawXenditPaymentMethod>(
      credentials,
      params,
      '/v2/payment_methods',
      { cursorParam: 'after_id', envelope: true },
    )
    return rows.map(transformPaymentMethod)
  }

  /** GET https://api.xendit.co/v2/payment_methods/:id — "Get Payment Method by ID". */
  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const res = await this.client(credentials).get<RawXenditPaymentMethod>(
      `/v2/payment_methods/${encodeURIComponent(id)}`,
    )
    return transformPaymentMethod(res)
  }

  // ── Plans (Recurring Plans API — get only, no list endpoint) ─────────────

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const res = await this.client(credentials).get<RawXenditRecurringPlan>(`/recurring/plans/${id}`)
    return transformPlan(res ?? {})
  }

  // ── Subscriptions (derived from Recurring Plans — same endpoint) ──────────
  // In Xendit's model a recurring plan IS the subscription; there is no
  // separate subscription resource. We re-use GET /recurring/plans/{id}.

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<RawXenditRecurringPlan>(`/recurring/plans/${id}`)
    return transformSubscription(res ?? {})
  }
}
