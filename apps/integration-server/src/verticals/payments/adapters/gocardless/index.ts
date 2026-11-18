/**
 * GoCardless adapter — payments vertical.
 *
 * Bearer-token auth (access token). Coverage: payments (charges),
 * refunds, mandates (payment methods), subscriptions, plans, customers,
 * instalment schedules (invoices), payouts, balance transactions.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: dispute — GoCardless has no disputes/chargebacks REST API endpoint;
//              chargebacks are visible only in the Protect+ dashboard UI and as
//              payout_item debit entries, not as a dedicated queryable resource.

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
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Customer } from '../../schema/customer'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Subscription } from '../../schema/subscription'
import type { Invoice } from '../../schema/invoice'
import type { Plan } from '../../schema/plan'
import type { Payout } from '../../schema/payout'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { buildCredentials, environmentFrom } from './auth'
import { GoCardlessClient } from './client'
import {
  parseGoCardlessWebhookEvents,
  verifyGoCardlessWebhook,
} from './webhook'

import { transformCustomer, type RawGCCustomer } from './transform/customer'
import { transformMandate, type RawGCMandate } from './transform/mandate'
import { transformCharge, type RawGCPayment } from './transform/charge'
import { transformRefund, type RawGCRefund } from './transform/refund'
import { transformInvoice, type RawGCInstalmentSchedule } from './transform/invoice'
import { transformSubscription, type RawGCSubscription } from './transform/subscription'
import { transformPlan, type RawGCSubscriptionAsPlan } from './transform/plan'
import { transformPayout, type RawGCPayout } from './transform/payout'
import {
  transformBalanceTransaction,
  type RawGCPayoutItem,
} from './transform/balance-transaction'

/** A list response: rows under the resource's key, the cursor under `meta`. */
type GCListResponse = Record<string, unknown> & {
  meta?: { cursors?: { after?: string | null } }
}

export class GoCardlessAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'gocardless'
  readonly version = '0.1.0'
  /** "Maximum number of objects to return. Default 50, max 500, min 1." Every list method pages at it. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('GoCardless uses an access token; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('GoCardless uses an access token; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'accessToken',
        label: 'Access token',
        type: 'password',
        required: true,
        helpText: 'Generated in the GoCardless dashboard under Developers › Access tokens.',
      },
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'live', label: 'Live' },
          { value: 'sandbox', label: 'Sandbox' },
        ],
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
    return verifyGoCardlessWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseGoCardlessWebhookEvents(payload)
  }

  private client(credentials: Credentials): GoCardlessClient {
    return new GoCardlessClient(credentials)
  }

  /**
   * One caller page of a GoCardless cursor-paginated list.
   *
   * https://docs.gocardless.com/docs/api-reference/data-conventions: "To page
   * through all results, keep passing the after cursor from each response
   * until the array is empty or shorter than the requested limit." `limit` is
   * 1..500, so one upstream page at the caller's (clamped) limit IS one caller
   * page, and `pageByCursor` carries `meta.cursors.after` forward to reach
   * page N. The response is returned too, for fields beside the rows.
   */
  private async listPaged<T>(
    credentials: Credentials,
    path: string,
    envelope: string,
    collection: string,
    params: QueryParams,
    filters: Record<string, unknown> = {},
  ): Promise<{ items: T[]; res: GCListResponse | undefined }> {
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    const limit = Number.isFinite(asked)
      ? Math.min(Math.max(Math.floor(asked), 1), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE
    const client = this.client(credentials)
    const key = cursorPagerKey(
      connectionScope(environmentFrom(credentials), credentials),
      collection,
      { ...filters, limit },
    )
    let last: GCListResponse | undefined
    const result = await pageByCursor<T, string>(key, params.page, async (after) => {
      const res = await client.get<GCListResponse>(path, {
        ...filters,
        limit,
        ...(after !== undefined ? { after } : {}),
      })
      last = res
      const items = (res[envelope] as T[] | undefined) ?? []
      const cursor = res.meta?.cursors?.after
      return { items, next: cursor && items.length >= limit ? cursor : undefined }
    })
    reportUpstreamPage(params, { hasMore: result.hasMore, pageSize: limit })
    return { items: result.items, res: last }
  }

  // ── Customers ───────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const { items } = await this.listPaged<RawGCCustomer>(
      credentials,
      '/customers',
      'customers',
      'customers',
      params,
    )
    return items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ customers: RawGCCustomer }>(`/customers/${id}`)
    return transformCustomer(res.customers)
  }

  // ── Payment methods (mandates) ──────────────────────────────────────────

  async listPaymentMethods(credentials: Credentials, params: QueryParams): Promise<PaymentMethod[]> {
    const { items } = await this.listPaged<RawGCMandate>(
      credentials,
      '/mandates',
      'mandates',
      'mandates',
      params,
    )
    return items.map(transformMandate)
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const res = await this.client(credentials).get<{ mandates: RawGCMandate }>(`/mandates/${id}`)
    return transformMandate(res.mandates)
  }

  // ── Charges (payments) ──────────────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const { items } = await this.listPaged<RawGCPayment>(
      credentials,
      '/payments',
      'payments',
      'payments',
      params,
    )
    return items.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<{ payments: RawGCPayment }>(`/payments/${id}`)
    return transformCharge(res.payments)
  }

  // ── Refunds ─────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const { items } = await this.listPaged<RawGCRefund>(
      credentials,
      '/refunds',
      'refunds',
      'refunds',
      params,
    )
    return items.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<{ refunds: RawGCRefund }>(`/refunds/${id}`)
    return transformRefund(res.refunds)
  }

  // ── Subscriptions ───────────────────────────────────────────────────────

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const { items } = await this.listPaged<RawGCSubscription>(
      credentials,
      '/subscriptions',
      'subscriptions',
      'subscriptions',
      params,
    )
    return items.map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<{ subscriptions: RawGCSubscription }>(
      `/subscriptions/${id}`,
    )
    return transformSubscription(res.subscriptions)
  }

  // ── Plans (synthesised from subscriptions) ──────────────────────────────

  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    // Plans map 1:1 from /subscriptions; a walk of its own, apart from listSubscriptions.
    const { items } = await this.listPaged<RawGCSubscriptionAsPlan>(
      credentials,
      '/subscriptions',
      'subscriptions',
      'subscriptions-as-plans',
      params,
    )
    return items.map(transformPlan)
  }

  // ── Invoices (instalment schedules) ─────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const { items } = await this.listPaged<RawGCInstalmentSchedule>(
      credentials,
      '/instalment_schedules',
      'instalment_schedules',
      'instalment_schedules',
      params,
    )
    return items.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).get<{
      instalment_schedules: RawGCInstalmentSchedule
    }>(`/instalment_schedules/${id}`)
    return transformInvoice(res.instalment_schedules)
  }

  // ── Payouts ─────────────────────────────────────────────────────────────

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const { items } = await this.listPaged<RawGCPayout>(
      credentials,
      '/payouts',
      'payouts',
      'payouts',
      params,
    )
    return items.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<{ payouts: RawGCPayout }>(`/payouts/${id}`)
    return transformPayout(res.payouts)
  }

  // ── Balance transactions (payout items) ─────────────────────────────────

  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    const payoutId = params['payout_id'] as string | undefined
    if (!payoutId) {
      throw new Error(
        'GoCardless balance transactions require ?payout_id — items are scoped to a payout.',
      )
    }
    // "Returns a cursor-paginated list of items in the payout." — same after/limit as the rest.
    const { items, res } = await this.listPaged<RawGCPayoutItem>(
      credentials,
      '/payout_items',
      'payout_items',
      'payout_items',
      params,
      { payout: payoutId },
    )
    const currency = (res?.['payouts'] as { currency?: string } | undefined)?.currency ?? 'GBP'
    return items.map((item) => transformBalanceTransaction(item, currency))
  }
}
