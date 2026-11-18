/**
 * Rapyd adapter — payments vertical (global Collect/Disburse network).
 *
 * Rapyd is a cross-border payments platform spanning 190+ countries and 900+
 * local payment methods (cards, bank transfers, ewallets, cash). The Collect
 * API exposes first-class Payment, Customer, and Refund objects, which this
 * adapter maps to the canonical Charge / Customer / Refund resources.
 *
 * Auth: `api_key` model — a static `access_key` + `secret_key` per
 * organization. Rapyd does NOT use OAuth or a bearer token; instead every
 * request carries a fresh HMAC-SHA256 signature computed from the request and
 * both keys (see `client.ts`). The keys + environment ride on the connection's
 * credentials.
 *
 * Scope: customers (list/get), charges (list/get), refunds (list/get/create),
 * disputes (list/get), invoices (list/get), payment methods (list only),
 * payouts (list/get), plans (list/get), subscriptions (list/get).
 *
 * balance-transaction is not a direct Rapyd concept (no unified ledger).
 *
 * Docs: https://docs.rapyd.net/en/merchant-api-reference.html
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: balance-transaction — Rapyd has no global balance-transaction
//   ledger endpoint. Wallet transactions are per-ewallet
//   (/v1/ewallets/:ewallet/transactions) and require a known wallet ID;
//   they also omit fee/net fields required by the canonical schema.

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Dispute } from '../../schema/dispute'
import type { Invoice } from '../../schema/invoice'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Payout } from '../../schema/payout'
import type { Plan } from '../../schema/plan'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE, ENDPOINTS, MAX_PAGE_SIZE, customerPaymentMethods } from './constants'
import { FORM, baseUrlFor } from './auth'
import { RapydClient } from './client'
import { parseRapydWebhookEvents, verifyRapydWebhook } from './webhook'

import { transformCustomer, type RawRapydCustomer } from './transform/customer'
import { transformCharge, type RawRapydPayment } from './transform/charge'
import { transformRefund, type RawRapydRefund } from './transform/refund'
import { transformDispute, type RawRapydDispute } from './transform/dispute'
import { transformInvoice, type RawRapydInvoice } from './transform/invoice'
import { transformPaymentMethod, type RawRapydPaymentMethod } from './transform/payment-method'
import { transformPayout, type RawRapydPayout } from './transform/payout'
import { transformPlan, type RawRapydPlan } from './transform/plan'
import { transformSubscription, type RawRapydSubscription } from './transform/subscription'

export class RapydAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'rapyd'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Rapyd uses an access/secret key pair; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Rapyd uses an access/secret key pair; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return FORM.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static access/secret key pair — nothing to refresh.
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyRapydWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseRapydWebhookEvents(payload)
  }

  private client(credentials: Credentials): RapydClient {
    return new RapydClient(credentials)
  }

  /**
   * One caller page of a Rapyd id-keyset list (customers, payments, refunds,
   * disputes, invoices, payouts, plans, subscriptions).
   *
   * These lists come newest first (every multi-row doc example) and page by the id of the last row
   * seen as `keyset`: `ending_before` ("The ID of the customer created after
   * the last customer you want to retrieve.",
   * https://docs.rapyd.net/en/list-customers-364253.html) or, on /payments,
   * `created_before` (same wording; `ending_before` is Deprecated there and
   * mixing the two families is ERROR_LIST_PAYMENTS_PAYOUTS_QUERY_MISMATCH,
   * https://docs.rapyd.net/en/list-payments.html). `limit` is "Range: 1-100".
   * The envelope carries no has_more or total, so a full page is the only
   * signal that more may follow, and the next cursor is that page's last id.
   * The 1-based `page` is mapped onto that chain by {@link pageByCursor},
   * keyed per connection. Only one keyset param is ever sent, never a pair (a
   * pair spanning over 90 days is ERROR_QUERY_DATE_RANGE_EXCEEDS_90_DAYS).
   *
   * A caller who passes a raw `cursor` gets that one upstream page as-is, outside the pager.
   *
   * Paths and keysets per list: /customers, /refunds, /disputes, /invoices,
   * /plans and /payments/subscriptions take `ending_before`; /payments and
   * /payouts take `created_before`. The subscriptions page labels
   * starting_after "the next page", but its sentence ("created next after the
   * record with this ID") returns NEWER rows, as list-payouts' twin wording. The
   * customers/payments/refunds/disputes keyset params also say "Date range:
   * 1-90 days. Default: 90 days."; whether an unbounded walk reaches rows
   * older than 90 days is not documented.
   */
  private async pageList<R extends { id?: unknown }>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    keyset: 'ending_before' | 'created_before',
  ): Promise<R[]> {
    const requested = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const asked =
      Number.isFinite(requested) && requested >= 1 ? Math.floor(requested) : DEFAULT_PAGE_SIZE
    const limit = Math.min(MAX_PAGE_SIZE, asked)
    const client = this.client(credentials)
    const fetchPage = async (
      cursor: string | undefined,
    ): Promise<{ items: R[]; next?: string }> => {
      const res = await client.get<R[]>(path, {
        limit,
        ...(cursor !== undefined ? { [keyset]: cursor } : {}),
      })
      const items = Array.isArray(res.data) ? res.data : []
      const lastId = items.length >= limit ? items[items.length - 1]?.id : undefined
      const next =
        typeof lastId === 'string' && lastId !== '' && lastId !== cursor ? lastId : undefined
      return { items, next }
    }

    let items: R[]
    let hasMore: boolean
    const raw = params['cursor']
    if (typeof raw === 'string' && raw !== '') {
      const page = await fetchPage(raw)
      items = page.items
      hasMore = page.next !== undefined
    } else {
      const scope = connectionScope(`rapyd:${baseUrlFor(credentials)}`, credentials)
      const key = cursorPagerKey(scope, path, { limit })
      ;({ items, hasMore } = await pageByCursor<R>(key, params.page, fetchPage))
    }
    reportUpstreamPage(params, limit < asked ? { hasMore, pageSize: limit } : { hasMore })
    return items
  }

  // ── Customers ──────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await this.pageList<RawRapydCustomer>(
      credentials,
      params,
      ENDPOINTS.customers,
      'ending_before',
    )
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawRapydCustomer>(`${ENDPOINTS.customers}/${id}`)
    return transformCustomer(res.data ?? {})
  }

  // ── Charges (Rapyd Payments) ───────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.pageList<RawRapydPayment>(
      credentials,
      params,
      ENDPOINTS.payments,
      'created_before',
    )
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawRapydPayment>(`${ENDPOINTS.payments}/${id}`)
    return transformCharge(res.data ?? {})
  }

  // ── Refunds ────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const rows = await this.pageList<RawRapydRefund>(
      credentials,
      params,
      ENDPOINTS.refunds,
      'ending_before',
    )
    return rows.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<RawRapydRefund>(`${ENDPOINTS.refunds}/${id}`)
    return transformRefund(res.data ?? {})
  }

  /**
   * Create a refund. Rapyd refunds reference the Payment id via `payment` and
   * carry a decimal major-unit `amount`; the canonical `amount` is integer
   * minor units, so divide by 100 on the way out (inverse of the transform's
   * `toMinorUnits`). Omitting `amount` issues a full refund.
   */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (Rapyd payment id) required for refund')
    const body: Record<string, unknown> = { payment: data.chargeId }
    if (data.amount != null) body['amount'] = data.amount / 100
    if (data.currency) body['currency'] = data.currency
    if (data.metadata && Object.keys(data.metadata).length > 0) body['metadata'] = data.metadata
    const res = await this.client(credentials).post<RawRapydRefund>(ENDPOINTS.refunds, body)
    return transformRefund(res.data ?? {})
  }

  // ── Disputes ───────────────────────────────────────────────────────────

  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    const rows = await this.pageList<RawRapydDispute>(
      credentials,
      params,
      ENDPOINTS.disputes,
      'ending_before',
    )
    return rows.map(transformDispute)
  }

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const res = await this.client(credentials).get<RawRapydDispute>(`${ENDPOINTS.disputes}/${id}`)
    return transformDispute(res.data ?? {})
  }

  // ── Invoices ───────────────────────────────────────────────────────────

  /**
   * GET /v1/invoices (https://docs.rapyd.net/en/list-invoices.html): ending_before
   * "The ID of the invoice created after the last invoice you want to
   * retrieve.", limit "Range: 1-100."
   */
  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const rows = await this.pageList<RawRapydInvoice>(
      credentials,
      params,
      ENDPOINTS.invoices,
      'ending_before',
    )
    return rows.map(transformInvoice)
  }

  /** GET /v1/invoices/:invoice (https://docs.rapyd.net/en/retrieve-invoice.html). */
  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).get<RawRapydInvoice>(
      `${ENDPOINTS.invoices}/${encodeURIComponent(id)}`,
    )
    return transformInvoice(res.data ?? {})
  }

  // ── Payment Methods ────────────────────────────────────────────────────

  /**
   * Every customer's stored payment methods, flattened.
   *
   * Rapyd has no account-wide payment-method list. The Customer Payment
   * Method API lists them per customer: "List all the payment methods of a
   * customer." at GET /v1/customers/:customer/payment_methods
   * (https://docs.rapyd.net/en/list-payment-methods-of-customer.html). So
   * this walks GET /v1/customers (ending_before = last id, 100 to a page) and,
   * for each customer, walks that customer's payment methods (ending_before
   * "The ID of the payment method created after the last payment method you
   * want to retrieve.", limit "Range: 1-100."). One upstream page for
   * {@link pageByRows} is one page of customers with all their payment
   * methods, so the caller's page is cut exactly out of the flattened rows.
   */
  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const client = this.client(credentials)
    const scope = connectionScope(`rapyd:${baseUrlFor(credentials)}`, credentials)
    const key = cursorPagerKey(scope, 'customers/*/payment_methods', { limit: MAX_PAGE_SIZE })
    const { items } = await pageByRows<PaymentMethod>(
      key,
      params,
      async (cursor) => {
        const res = await client.get<RawRapydCustomer[]>(ENDPOINTS.customers, {
          limit: MAX_PAGE_SIZE,
          ...(cursor !== undefined ? { ending_before: cursor } : {}),
        })
        const customers = Array.isArray(res.data) ? res.data : []
        const rows: PaymentMethod[] = []
        for (const customer of customers) {
          const customerId = typeof customer.id === 'string' ? customer.id : ''
          if (customerId === '') throw new Error('Rapyd customer list returned a row with no id')
          const methods = await this.customerPaymentMethods(client, customerId)
          for (const m of methods) rows.push(transformPaymentMethod(m, customerId))
        }
        const lastId =
          customers.length >= MAX_PAGE_SIZE ? customers[customers.length - 1]?.id : undefined
        const next =
          typeof lastId === 'string' && lastId !== '' && lastId !== cursor ? lastId : undefined
        return { items: rows, next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  /** One customer's payment methods, every page of them. */
  private async customerPaymentMethods(
    client: RapydClient,
    customerId: string,
  ): Promise<RawRapydPaymentMethod[]> {
    const out: RawRapydPaymentMethod[] = []
    let cursor: string | undefined
    for (;;) {
      const res = await client.get<RawRapydPaymentMethod[]>(customerPaymentMethods(customerId), {
        limit: MAX_PAGE_SIZE,
        ...(cursor !== undefined ? { ending_before: cursor } : {}),
      })
      const page = Array.isArray(res.data) ? res.data : []
      out.push(...page)
      const lastId = page.length >= MAX_PAGE_SIZE ? page[page.length - 1]?.id : undefined
      if (typeof lastId !== 'string' || lastId === '' || lastId === cursor) return out
      cursor = lastId
    }
  }

  /**
   * Rapyd retrieves a payment method only under its customer
   * (GET /v1/customers/:customer/payment_methods/:payment_method,
   * https://docs.rapyd.net/en/retrieve-payment-method.html); a bare payment
   * method id cannot be looked up, so this refuses before sending anything.
   */
  async getPaymentMethod(_credentials: Credentials, _id: string): Promise<PaymentMethod> {
    throw Object.assign(
      new Error(
        'Rapyd cannot retrieve a payment method by id alone: the documented path is /v1/customers/:customer/payment_methods/:payment_method',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  // ── Payouts (Disburse API) ─────────────────────────────────────────────

  /**
   * GET /v1/payouts (https://docs.rapyd.net/en/list-payouts.html): created_before
   * "The ID of the payout created after the last payout you want to retrieve.
   * String starting with payout_.", limit "Range: 1-100. Default is 10."
   * ending_before / starting_after are marked Deprecated there, and never sent.
   */
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const rows = await this.pageList<RawRapydPayout>(
      credentials,
      params,
      ENDPOINTS.payouts,
      'created_before',
    )
    return rows.map(transformPayout)
  }

  /** GET /v1/payouts/:payout (https://docs.rapyd.net/en/retrieve-payout.html). */
  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<RawRapydPayout>(
      `${ENDPOINTS.payouts}/${encodeURIComponent(id)}`,
    )
    return transformPayout(res.data ?? {})
  }

  // ── Plans (subscription billing) ──────────────────────────────────────

  /**
   * GET /v1/plans (https://docs.rapyd.net/en/list-plans.html): ending_before
   * "The ID of the plan created after the last plan you want to retrieve.",
   * limit "Range: 1-100."
   */
  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const rows = await this.pageList<RawRapydPlan>(
      credentials,
      params,
      ENDPOINTS.plans,
      'ending_before',
    )
    return rows.map(transformPlan)
  }

  /** GET /v1/plans/:plan (https://docs.rapyd.net/en/retrieve-plan.html). */
  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const res = await this.client(credentials).get<RawRapydPlan>(
      `${ENDPOINTS.plans}/${encodeURIComponent(id)}`,
    )
    return transformPlan(res.data ?? {})
  }

  // ── Subscriptions ──────────────────────────────────────────────────────

  /**
   * GET /v1/payments/subscriptions
   * (https://docs.rapyd.net/en/list-subscriptions.html), paged by
   * `ending_before`: "The list ends with the last record that was created
   * before the record with this ID." That walks toward older rows on a
   * newest-first list, as every other Rapyd list does. The page labels it
   * "the previous page" and `starting_after` ("created next after the record
   * with this ID") "the next page", but list-payouts gives its deprecated
   * pair the same labels while its created_before, not created_after, is the
   * older-rows cursor, so the labels are not taken as direction. limit
   * "Range: 1-100." Not checked in a sandbox.
   */
  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const rows = await this.pageList<RawRapydSubscription>(
      credentials,
      params,
      ENDPOINTS.subscriptions,
      'ending_before',
    )
    return rows.map(transformSubscription)
  }

  /** GET /v1/payments/subscriptions/:subscription (https://docs.rapyd.net/en/retrieve-subscription.html). */
  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<RawRapydSubscription>(
      `${ENDPOINTS.subscriptions}/${encodeURIComponent(id)}`,
    )
    return transformSubscription(res.data ?? {})
  }
}
