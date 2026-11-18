/**
 * PayPal adapter — payments vertical.
 *
 * REST API behind an OAuth2 client-credentials flow. Coverage: payments
 * (captures), refunds, invoices + line items, subscriptions, plans,
 * disputes, payouts, payment-methods (Vault), balance-transactions (Reporting).
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import { pageLocally, reportUpstreamPage } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'
import type { Invoice, InvoiceLineItem } from '../../schema/invoice'
import type { Subscription } from '../../schema/subscription'
import type { Plan } from '../../schema/plan'
import type { Dispute } from '../../schema/dispute'
import type { Payout } from '../../schema/payout'
import type { PaymentMethod } from '../../schema/payment-method'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { WebhookEvent } from '../../schema/webhook'

import { type PayPalEnvironment } from './constants'
import { fetchToken } from './auth'
import { PayPalClient } from './client'
import { parsePayPalWebhookEvents, verifyPayPalWebhook } from './webhook'

import { transformCharge, type RawPayPalCapture } from './transform/charge'
import { transformRefund, type RawPayPalRefund } from './transform/refund'
import { transformCustomer, type RawPayPalPayer } from './transform/customer'
import { transformInvoice, type RawPayPalInvoice } from './transform/invoice'
import {
  transformInvoiceLineItem,
  type RawPayPalInvoiceItem,
} from './transform/invoice-line-item'
import {
  transformSubscription,
  type RawPayPalSubscription,
} from './transform/subscription'
import { transformPlan, type RawPayPalPlan } from './transform/plan'
import { transformDispute, type RawPayPalDispute } from './transform/dispute'
import { transformPayout, type RawPayPalPayoutItem } from './transform/payout'
import {
  transformPaymentMethod,
  type RawPayPalVaultToken,
} from './transform/payment-method'
import {
  transformBalanceTransaction,
  type RawPayPalReportingTransaction,
} from './transform/balance-transaction'

/**
 * Every PayPal list endpoint pages by a 1-based `page` plus `page_size`, and
 * each has its own documented ceiling on both (invoices 100 per page and page
 * ≤ 1000, plans 20, disputes 50 and page ≤ 50, vault tokens 5 and page ≤ 10,
 * reporting 500). No single `capabilities.maxPageSize` fits them all, so each
 * method clamps to its own ceiling and reports the size it sent.
 */
interface PageWindow {
  page: number
  size: number
}

/**
 * The page and page size to send for `params`: the caller's limit clamped to
 * the endpoint's `maxSize` (reported as `pageSize` when that clamp bites),
 * and the 1-based page. A page past the endpoint's documented range is
 * refused before sending: PayPal cannot serve it, and returning nothing would
 * read as the end of a collection that has more rows.
 */
function pageWindow(
  params: QueryParams,
  opts: { maxSize: number; fallback: number; maxPage?: number; what: string },
): PageWindow {
  const raw = params.page
  const page = typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1
  if (opts.maxPage !== undefined && page > opts.maxPage) {
    throw Object.assign(
      new Error(
        `PayPal ${opts.what} can page at most ${opts.maxPage} pages deep; page ${page} is out of range.`,
      ),
      { statusCode: 400, code: 'VALIDATION' },
    )
  }
  const limit = params.limit
  const asked =
    typeof limit === 'number' && Number.isFinite(limit) && limit >= 1
      ? Math.floor(limit)
      : opts.fallback
  const size = Math.min(asked, opts.maxSize)
  if (size < asked) reportUpstreamPage(params, { pageSize: size })
  return { page, size }
}

interface PayPalLink {
  rel?: string
  href?: string
}

function hasNextLink(links: unknown): boolean {
  return Array.isArray(links) && links.some((l) => (l as PayPalLink | null)?.rel === 'next')
}

/** Report hasMore / totalCount from a `total_required=true` response. */
function reportTotals(
  params: QueryParams,
  win: PageWindow,
  res: { total_items?: number; total_pages?: number; links?: unknown },
): void {
  if (typeof res.total_pages === 'number') {
    reportUpstreamPage(params, {
      hasMore: win.page < res.total_pages,
      ...(typeof res.total_items === 'number' ? { totalCount: res.total_items } : {}),
    })
  } else if (Array.isArray(res.links)) {
    reportUpstreamPage(params, { hasMore: hasNextLink(res.links) })
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

export class PayPalAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'paypal'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('PayPal uses client-credentials; submit credentials via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('PayPal uses client-credentials; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'live', label: 'Production' },
          { value: 'sandbox', label: 'Sandbox' },
        ],
      },
      { name: 'clientId', label: 'Client ID', type: 'text', required: true },
      { name: 'clientSecret', label: 'Client secret', type: 'password', required: true },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    const env = (fields.environment ?? 'live') as PayPalEnvironment
    return fetchToken(fields.clientId ?? '', fields.clientSecret ?? '', env)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
    const env = (extra.environment as PayPalEnvironment) ?? 'live'
    return fetchToken(String(extra.clientId ?? ''), String(extra.clientSecret ?? ''), env)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPayPalWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePayPalWebhookEvents(payload)
  }

  private client(credentials: Credentials): PayPalClient {
    return new PayPalClient(credentials)
  }

  // ── Charges (Payments v2 captures) ────────────────────────────────────────

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawPayPalCapture>(`/v2/payments/captures/${id}`)
    return transformCharge(raw)
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    // PayPal does not expose a generic list-captures endpoint without a
    // search via Transactions API. Production integrations consume webhook
    // notifications and look up by ID via getCharge.
    return []
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const raw = await this.client(credentials).get<RawPayPalRefund>(`/v2/payments/refunds/${id}`)
    return transformRefund(raw)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (capture ID) required for PayPal refund')
    const body: Record<string, unknown> = {}
    if (data.amount !== undefined && data.currency) {
      body.amount = {
        value: (data.amount / 100).toFixed(2),
        currency_code: data.currency,
      }
    }
    const raw = await this.client(credentials).post<RawPayPalRefund>(
      `/v2/payments/captures/${data.chargeId}/refund`,
      body,
    )
    return transformRefund(raw)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    // PayPal exposes "Identity" / Payer info for known transactions; for v1
    // we derive Customer from any capture's `payer` block.
    const raw = await this.client(credentials).get<RawPayPalCapture>(`/v2/payments/captures/${id}`)
    return transformCustomer(raw.payer ?? ({} as RawPayPalPayer))
  }

  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    return []
  }

  // ── Invoices ──────────────────────────────────────────────────────────────

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const raw = await this.client(credentials).get<RawPayPalInvoice>(`/v2/invoicing/invoices/${id}`)
    return transformInvoice(raw)
  }

  /**
   * "A combination of `page=2` and `page_size=20` returns the next 20
   * invoices." page ≤ 1000, page_size ≤ 100; `total_required` adds
   * total_pages / total_items.
   * (https://developer.paypal.com/api/invoicing/v2/invoices-list)
   */
  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const win = pageWindow(params, { maxSize: 100, fallback: 50, maxPage: 1000, what: 'invoices' })
    const res = await this.client(credentials).get<{
      items?: RawPayPalInvoice[]
      total_items?: number
      total_pages?: number
      links?: unknown
    }>('/v2/invoicing/invoices', { page: win.page, page_size: win.size, total_required: true })
    reportTotals(params, win, res)
    return (res.items ?? []).map(transformInvoice)
  }

  /**
   * Line items are embedded in GET /v2/invoicing/invoices/{invoice_id}, which
   * takes no paging parameters (items maxItems 100): the whole collection,
   * sliced locally.
   */
  async listInvoiceLineItems(
    credentials: Credentials,
    invoiceId: string,
    params: QueryParams,
  ): Promise<InvoiceLineItem[]> {
    const raw = await this.client(credentials).get<{ items?: RawPayPalInvoiceItem[] }>(
      `/v2/invoicing/invoices/${invoiceId}`,
    )
    return pageLocally(
      (raw.items ?? []).map((it) => transformInvoiceLineItem(it, invoiceId)),
      params,
    )
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const raw = await this.client(credentials).get<RawPayPalSubscription>(
      `/v1/billing/subscriptions/${id}`,
    )
    return transformSubscription(raw)
  }

  async listSubscriptions(_credentials: Credentials, _params: QueryParams): Promise<Subscription[]> {
    return []
  }

  async cancelSubscription(
    credentials: Credentials,
    id: string,
    _data?: { atPeriodEnd?: boolean },
  ): Promise<Subscription> {
    await this.client(credentials).post(`/v1/billing/subscriptions/${id}/cancel`, {
      reason: 'Cancelled via API',
    })
    return this.getSubscription(credentials, id)
  }

  // ── Plans ─────────────────────────────────────────────────────────────────

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const raw = await this.client(credentials).get<RawPayPalPlan>(`/v1/billing/plans/${id}`)
    return transformPlan(raw)
  }

  /**
   * "The combination of `page=2` and `page_size=20` returns the next 20
   * items." page_size ≤ 20 (page ≤ 10,000,000); `total_required` adds
   * total_pages / total_items.
   * (https://developer.paypal.com/api/subscriptions/v1/plans-list)
   */
  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const win = pageWindow(params, {
      maxSize: 20,
      fallback: 50,
      maxPage: 10_000_000,
      what: 'plans',
    })
    const res = await this.client(credentials).get<{
      plans?: RawPayPalPlan[]
      total_items?: number
      total_pages?: number
      links?: unknown
    }>('/v1/billing/plans', { page: win.page, page_size: win.size, total_required: true })
    reportTotals(params, win, res)
    return (res.plans ?? []).map(transformPlan)
  }

  // ── Disputes ──────────────────────────────────────────────────────────────

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const raw = await this.client(credentials).get<RawPayPalDispute>(
      `/v1/customer/disputes/${id}`,
    )
    return transformDispute(raw)
  }

  /**
   * `page` ("Enables you to search by page number. Use in combination with
   * the `page_size`") ≤ 50 and `page_size` ≤ 50. The response has no totals;
   * "it ... includes a HATEOAS link to the next page of results".
   * (https://developer.paypal.com/api/customer-disputes/v1/disputes-list)
   */
  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    const win = pageWindow(params, { maxSize: 50, fallback: 10, maxPage: 50, what: 'disputes' })
    const res = await this.client(credentials).get<{ items?: RawPayPalDispute[]; links?: unknown }>(
      '/v1/customer/disputes',
      { page: win.page, page_size: win.size },
    )
    reportUpstreamPage(params, { hasMore: hasNextLink(res.links) })
    return (res.items ?? []).map(transformDispute)
  }

  // ── Payouts ───────────────────────────────────────────────────────────────

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const raw = await this.client(credentials).get<RawPayPalPayoutItem>(
      `/v1/payments/payouts-item/${id}`,
    )
    return transformPayout(raw)
  }

  async listPayouts(_credentials: Credentials, _params: QueryParams): Promise<Payout[]> {
    return []
  }

  // ── Payment Methods (Vault) ───────────────────────────────────────────────

  /**
   * List saved payment tokens for a customer from the PayPal Vault API.
   * Requires the `customerId` query param to scope results to a customer:
   * `customer_id` is required upstream. page_size ≤ 5, page ≤ 10;
   * `total_required` adds total_pages / total_items.
   * (https://developer.paypal.com/api/payment-tokens/v3/customer-payment-tokens-get)
   */
  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const customerId = params['customerId'] as string | undefined
    if (!customerId) {
      throw Object.assign(
        new Error(
          'PayPal cannot list payment methods without a customer: GET /v3/vault/payment-tokens ' +
            'requires customer_id and has no merchant-wide list.',
        ),
        { statusCode: 501, code: 'NOT_SUPPORTED' },
      )
    }
    const win = pageWindow(params, {
      maxSize: 5,
      fallback: 10,
      maxPage: 10,
      what: 'payment tokens',
    })
    const res = await this.client(credentials).get<{
      payment_tokens?: RawPayPalVaultToken[]
      total_items?: number
      total_pages?: number
      links?: unknown
    }>('/v3/vault/payment-tokens', {
      customer_id: customerId,
      page: win.page,
      page_size: win.size,
      total_required: true,
    })
    reportTotals(params, win, res)
    return (res.payment_tokens ?? []).map(transformPaymentMethod)
  }

  /** Get a single vault payment token by its token ID. */
  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const raw = await this.client(credentials).get<RawPayPalVaultToken>(
      `/v3/vault/payment-tokens/${id}`,
    )
    return transformPaymentMethod(raw)
  }

  // ── Balance Transactions (Reporting) ─────────────────────────────────────

  /**
   * List balance/ledger transactions via the PayPal Reporting API.
   * `params.updatedAfter` controls the `start_date`; defaults to the start of
   * the UTC day 30 days ago, so every page of one walk searches from the same
   * start (a start recomputed from the clock slid between pages).
   * `params.limit` maps to `page_size` (max 500); `page` is 1-based: "the
   * combination of `page=2` and `page_size=20` returns the next 20 items".
   * (https://developer.paypal.com/api/transaction-search/v1/search-get)
   *
   * total_items is documented as counted "beginning with the specified
   * `page`", so it is reported as a total from page 1 only, and hasMore comes
   * from the `next` link when the response carries links.
   */
  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    const win = pageWindow(params, { maxSize: 500, fallback: 100, what: 'transactions' })
    const endDate = new Date()
    const today = Math.floor(endDate.getTime() / DAY_MS) * DAY_MS
    const startDate = params.updatedAfter ?? new Date(today - 30 * DAY_MS)
    const query: Record<string, unknown> = {
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      page: win.page,
      page_size: win.size,
    }
    const res = await this.client(credentials).get<{
      transaction_details?: Array<{ transaction_info?: RawPayPalReportingTransaction }>
      total_items?: number
      total_pages?: number
      links?: unknown
    }>('/v1/reporting/transactions', query)
    if (Array.isArray(res.links)) {
      reportUpstreamPage(params, { hasMore: hasNextLink(res.links) })
    } else if (win.page === 1 && typeof res.total_pages === 'number') {
      reportUpstreamPage(params, { hasMore: res.total_pages > 1 })
    }
    if (win.page === 1 && typeof res.total_items === 'number') {
      reportUpstreamPage(params, { totalCount: res.total_items })
    }
    return (res.transaction_details ?? [])
      .map((d) => d.transaction_info)
      .filter((t): t is RawPayPalReportingTransaction => t != null)
      .map(transformBalanceTransaction)
  }
}
