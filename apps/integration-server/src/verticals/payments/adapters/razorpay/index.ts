/**
 * Razorpay adapter — payments vertical.
 *
 * Basic auth (key_id:key_secret base64-encoded). Coverage: payments,
 * refunds, customers, subscriptions, plans, invoices + line items,
 * payouts, settlements (balance transactions), customer tokens (payment
 * methods).
 */

// ── Resource coverage ──────────────────────────────────────────────
// All 10 canonical resources are available for this adapter.

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Customer } from '../../schema/customer'
import type { Subscription } from '../../schema/subscription'
import type { Plan } from '../../schema/plan'
import type { Invoice, InvoiceLineItem } from '../../schema/invoice'
import type { Payout } from '../../schema/payout'
import type { Dispute } from '../../schema/dispute'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { PaymentMethod } from '../../schema/payment-method'
import type { WebhookEvent } from '../../schema/webhook'

import { API_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { RazorpayClient } from './client'
import { parseRazorpayWebhookEvents, verifyRazorpayWebhook } from './webhook'

import { transformCustomer, type RawRazorpayCustomer } from './transform/customer'
import { transformCharge, type RawRazorpayPayment } from './transform/charge'
import { transformRefund, type RawRazorpayRefund } from './transform/refund'
import { transformInvoice, type RawRazorpayInvoice } from './transform/invoice'
import { transformInvoiceLineItem, type RawRazorpayLineItem } from './transform/invoice-line-item'
import { transformSubscription, type RawRazorpaySubscription } from './transform/subscription'
import { transformPlan, type RawRazorpayPlan } from './transform/plan'
import { transformPayout, type RawRazorpayPayout } from './transform/payout'
import {
  transformBalanceTransaction,
  type RawRazorpaySettlement,
} from './transform/balance-transaction'
import { transformDispute, type RawRazorpayDispute } from './transform/dispute'
import { transformPaymentMethod, type RawRazorpayToken } from './transform/payment-method'

interface RazorpayCollection<T> {
  count?: number
  items?: T[]
  entity?: string
}

/**
 * The `count` one offset request asks for: the caller's limit, floored,
 * within [1, MAX_PAGE_SIZE]. A missing or unusable limit is the default page.
 * When the limit is clamped the size actually sent is reported, so every
 * short-page judgement uses it.
 */
function offsetPageSize(params: QueryParams): number {
  const asked = params.limit
  const size =
    typeof asked === 'number' && Number.isFinite(asked) && asked >= 1
      ? Math.min(Math.floor(asked), MAX_PAGE_SIZE)
      : Math.min(DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  if (typeof asked === 'number' && size < asked) reportUpstreamPage(params, { pageSize: size })
  return size
}

/**
 * Customer pages one payment-methods call may walk (each is 1 + up to 100
 * requests). Past it, a sparse account's page throws rather than fanning out
 * without bound.
 */
const PAYMENT_METHOD_CUSTOMER_PAGES = 20

/** Pager scope for one connection: the host plus a fingerprint of its key. */
function scope(credentials: Credentials): string {
  return connectionScope(`razorpay:${API_BASE_URL}`, credentials)
}

export class RazorpayAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'razorpay'
  readonly version = '0.1.0'

  /**
   * `count` maximum (100 on every endpoint page that states one). The offset
   * lists send `count` = limit and `skip`; payment methods re-cut customer
   * pages with pageByRows and invoice line items are sliced locally, so each
   * serves exactly the caller's limit.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('Razorpay uses key_id:key_secret; submit them via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Razorpay uses key_id:key_secret; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      { name: 'keyId', label: 'Key ID', type: 'text', required: true },
      { name: 'keySecret', label: 'Key secret', type: 'password', required: true },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyRazorpayWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseRazorpayWebhookEvents(payload)
  }

  private client(credentials: Credentials): RazorpayClient {
    return new RazorpayClient(credentials)
  }

  /**
   * One caller page of a `count` / `skip` collection ("Number of entities to
   * skip. Default is 0. This can be used for pagination, in combination with
   * `count`.", https://razorpay.com/docs/api/understand/). The response
   * `count` is the items in this response, not a total, and there is no
   * has_more: a short page is the end, a full one is undecidable without
   * another request, so nothing is reported for it.
   */
  private async listOffset<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    extra: Record<string, unknown> = {},
  ): Promise<T[]> {
    const count = offsetPageSize(params)
    const skip = pageOffset(params, count)
    const res = await this.client(credentials).get<RazorpayCollection<T>>(path, {
      ...extra,
      count,
      skip,
    })
    const rows = res?.items ?? []
    if (rows.length < count) reportUpstreamPage(params, { hasMore: false })
    return rows
  }

  // ── Charges ─────────────────────────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.listOffset<RawRazorpayPayment>(credentials, '/payments', params)
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawRazorpayPayment>(`/payments/${id}`)
    return transformCharge(raw)
  }

  // ── Refunds ─────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const rows = await this.listOffset<RawRazorpayRefund>(credentials, '/refunds', params)
    return rows.map(transformRefund)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId required for Razorpay refund')
    const raw = await this.client(credentials).post<RawRazorpayRefund>(
      `/payments/${data.chargeId}/refund`,
      { amount: data.amount },
    )
    return transformRefund({ ...raw, currency: data.currency, payment_id: data.chargeId })
  }

  // ── Customers ───────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await this.listOffset<RawRazorpayCustomer>(credentials, '/customers', params)
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawRazorpayCustomer>(`/customers/${id}`)
    return transformCustomer(raw)
  }

  // ── Subscriptions + plans ───────────────────────────────────────────────

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const rows = await this.listOffset<RawRazorpaySubscription>(
      credentials,
      '/subscriptions',
      params,
    )
    return rows.map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const raw = await this.client(credentials).get<RawRazorpaySubscription>(`/subscriptions/${id}`)
    return transformSubscription(raw)
  }

  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const rows = await this.listOffset<RawRazorpayPlan>(credentials, '/plans', params)
    return rows.map(transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const raw = await this.client(credentials).get<RawRazorpayPlan>(`/plans/${id}`)
    return transformPlan(raw)
  }

  // ── Invoices + line items ───────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const rows = await this.listOffset<RawRazorpayInvoice>(credentials, '/invoices', params)
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const raw = await this.client(credentials).get<RawRazorpayInvoice>(`/invoices/${id}`)
    return transformInvoice(raw)
  }

  /**
   * Line items are embedded whole in the invoice ("Details of the line item
   * that is billed in the invoice. Maximum of 50 line items.",
   * https://razorpay.com/docs/api/payments/invoices/fetch-with-id/), so the
   * caller's page is sliced from the full list.
   */
  async listInvoiceLineItems(
    credentials: Credentials,
    invoiceId: string,
    params: QueryParams,
  ): Promise<InvoiceLineItem[]> {
    const raw = await this.client(credentials).get<RawRazorpayInvoice>(`/invoices/${invoiceId}`)
    const items: RawRazorpayLineItem[] = (raw.line_items as RawRazorpayLineItem[]) ?? []
    return pageLocally(
      items.map((it) => transformInvoiceLineItem(it, invoiceId)),
      params,
    )
  }

  // ── Payouts ─────────────────────────────────────────────────────────────

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const accountId = params['account_id'] as string | undefined
    const rows = await this.listOffset<RawRazorpayPayout>(credentials, '/payouts', params, {
      account_number: accountId,
    })
    return rows.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const raw = await this.client(credentials).get<RawRazorpayPayout>(`/payouts/${id}`)
    return transformPayout(raw)
  }

  // ── Disputes ─────────────────────────────────────────────────────────────

  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    const rows = await this.listOffset<RawRazorpayDispute>(credentials, '/disputes', params)
    return rows.map(transformDispute)
  }

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const raw = await this.client(credentials).get<RawRazorpayDispute>(`/disputes/${id}`)
    return transformDispute(raw)
  }

  // ── Balance transactions (settlements) ──────────────────────────────────

  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    const rows = await this.listOffset<RawRazorpaySettlement>(credentials, '/settlements', params)
    return rows.map(transformBalanceTransaction)
  }

  // ── Payment methods (customer tokens) ───────────────────────────────────
  // Razorpay tokens are scoped to a customer: GET /customers/:id/tokens, which
  // takes no paging parameters and returns the customer's tokens whole.

  /**
   * With `customer_id`, that customer's whole token list, sliced locally.
   * Without it, tokens flattened out of every customer: customer pages are
   * walked by `count` / `skip` at the 100 maximum, and pageByRows cuts the
   * caller's rows out of the flattened stream, so one upstream page is not
   * one caller page and `hasMore` is exact. A customer page costs one request
   * plus one per customer, so a caller page may cross at most
   * {@link PAYMENT_METHOD_CUSTOMER_PAGES} customer pages.
   */
  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const client = this.client(credentials)
    const customerId = params['customer_id'] as string | undefined
    if (customerId) {
      const res = await client.get<RazorpayCollection<RawRazorpayToken>>(
        `/customers/${customerId}/tokens`,
      )
      return pageLocally(
        (res?.items ?? []).map((t) => transformPaymentMethod(t, customerId)),
        params,
      )
    }
    const key = cursorPagerKey(scope(credentials), 'payment_methods', { count: MAX_PAGE_SIZE })
    const { items } = await pageByRows<PaymentMethod, number>(
      key,
      params,
      async (skip) => {
        const from = skip ?? 0
        const customers = await client.get<RazorpayCollection<{ id?: string }>>('/customers', {
          count: MAX_PAGE_SIZE,
          skip: from,
        })
        const page = customers?.items ?? []
        const rows: PaymentMethod[] = []
        for (const cust of page) {
          if (!cust.id) continue
          const res = await client.get<RazorpayCollection<RawRazorpayToken>>(
            `/customers/${cust.id}/tokens`,
          )
          for (const t of res?.items ?? []) rows.push(transformPaymentMethod(t, cust.id))
        }
        return { items: rows, next: page.length < MAX_PAGE_SIZE ? undefined : from + page.length }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE, maxUpstreamPages: PAYMENT_METHOD_CUSTOMER_PAGES },
    )
    return items
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    // Razorpay v1 token fetch: GET /tokens/:id (not customer-scoped)
    const raw = await this.client(credentials).get<RawRazorpayToken>(`/tokens/${id}`)
    return transformPaymentMethod(raw)
  }
}
