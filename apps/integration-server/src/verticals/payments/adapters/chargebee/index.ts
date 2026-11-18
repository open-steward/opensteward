/**
 * Chargebee adapter — payments vertical (subscription-billing).
 *
 * Chargebee sits on top of an underlying gateway (Stripe / Adyen /
 * Braintree / Razorpay / Authorize.Net). We surface `Charge.gateway =
 * 'chargebee'` and `Charge.metadata.processor = <underlying-gateway>` so
 * consumers can dedupe when both Chargebee and the underlying gateway
 * have connections configured.
 *
 * Auth: HTTP Basic with the API key as username (password blank). The
 * merchant's Chargebee site name (subdomain) is required for URL routing.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: balance-transaction — Chargebee is a billing-orchestration
 *   layer; fund-settlement ledger entries live in the underlying gateway
 *   (Stripe, Adyen, etc.) and are not exposed via the Chargebee API.
 *   Confirmed absent from the official OpenAPI spec (github.com/chargebee/openapi).
 * Unavailable: dispute — No /disputes REST endpoint exists. Chargeback
 *   handling is UI-only (Chargebee Pay portal); "chargeback" appears only as
 *   a payment_method enum value on credit-note/transaction objects.
 *   Confirmed absent from the official OpenAPI spec.
 * Unavailable: payout — No /payouts REST endpoint exists. Payouts are settled
 *   by the underlying payment gateway and are only viewable in the Chargebee
 *   Pay portal UI or as downloadable reports.
 *   Confirmed absent from the official OpenAPI spec.
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
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
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Plan } from '../../schema/plan'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { ChargebeeClient } from './client'
import {
  parseChargebeeWebhookEvents,
  verifyChargebeeWebhook,
} from './webhook'

import { transformCustomer, type RawChargebeeCustomer } from './transform/customer'
import { transformSubscription, type RawChargebeeSubscription } from './transform/subscription'
import { transformInvoice, type RawChargebeeInvoice } from './transform/invoice'
import { transformCharge, type RawChargebeeTransaction } from './transform/charge'
import { transformRefund, type RawChargebeeRefund } from './transform/refund'
import {
  transformPaymentMethod,
  type RawChargebeePaymentSource,
} from './transform/payment-method'
import { transformPlan, type RawChargebeePlan } from './transform/plan'

interface CbList<T, K extends string> {
  list?: Array<Record<K, T>>
  next_offset?: string
}

function unwrap<T, K extends string>(
  res: CbList<T, K>,
  key: K,
): T[] {
  return (res.list ?? []).map((wrap) => wrap[key])
}

export class ChargebeeAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'chargebee'
  readonly version = '0.1.0'
  /** Every list method pages at the caller's size up to this and reports its end. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('Chargebee uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Chargebee uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'site',
        label: 'Chargebee site',
        type: 'text',
        required: true,
        placeholder: 'mycompany-test',
        helpText: 'The Chargebee subdomain — e.g. mycompany-test for mycompany-test.chargebee.com.',
      },
      {
        name: 'apiKey',
        label: 'API key',
        type: 'password',
        required: true,
        helpText: 'From Chargebee dashboard → Settings → Configure Chargebee → API Keys.',
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
    return verifyChargebeeWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseChargebeeWebhookEvents(payload)
  }

  private client(credentials: Credentials): ChargebeeClient {
    return new ChargebeeClient(credentials)
  }

  /**
   * One caller page of a Chargebee list endpoint.
   *
   * Every list endpoint pages by an opaque cursor: `offset` "Determines your
   * position in the list for pagination. To ensure that the next page is
   * retrieved correctly, always set offset to the value of next_offset
   * obtained in the previous iteration of the API call", and `next_offset`
   * "is returned only if more resources are present". Page N is reached by
   * walking {@link pageByCursor}; the end is `next_offset`'s absence. `limit`
   * is "default=10, min=1, max=100", so a direct call past 100 is clamped and
   * reports the page size actually used.
   *
   * The pager scope is the site plus a fingerprint of the stored credential,
   * and the key carries every filter, so a cursor minted under `type[is]`
   * never positions an unfiltered walk.
   */
  private async pageList<T, K extends string>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    wrapKey: K,
    filters: Record<string, string> = {},
  ): Promise<T[]> {
    const asked =
      typeof params.limit === 'number' && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_PAGE_SIZE
    const limit = Math.min(asked, MAX_PAGE_SIZE)
    const site = String((credentials.extra as Record<string, unknown> | undefined)?.site ?? '')
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope(`chargebee:${site}`, credentials), path, {
      ...filters,
      limit,
    })
    const { items, hasMore } = await pageByCursor<T>(key, params.page, async (offset) => {
      const query: Record<string, unknown> = { ...filters, limit }
      if (offset !== undefined) query.offset = offset
      const res = await client.get<CbList<T, K>>(path, query)
      return { items: unwrap(res, wrapKey), next: res.next_offset || undefined }
    })
    reportUpstreamPage(params, limit < asked ? { hasMore, pageSize: limit } : { hasMore })
    return items
  }

  // ── Customers ───────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await this.pageList<RawChargebeeCustomer, 'customer'>(
      credentials,
      params,
      '/customers',
      'customer',
    )
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ customer: RawChargebeeCustomer }>(
      `/customers/${id}`,
    )
    return transformCustomer(res.customer)
  }

  // ── Subscriptions ───────────────────────────────────────────────────────

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const rows = await this.pageList<RawChargebeeSubscription, 'subscription'>(
      credentials,
      params,
      '/subscriptions',
      'subscription',
    )
    return rows.map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<{ subscription: RawChargebeeSubscription }>(
      `/subscriptions/${id}`,
    )
    return transformSubscription(res.subscription)
  }

  async cancelSubscription(
    credentials: Credentials,
    id: string,
    data?: { atPeriodEnd?: boolean },
  ): Promise<Subscription> {
    const res = await this.client(credentials).post<{ subscription: RawChargebeeSubscription }>(
      `/subscriptions/${id}/cancel`,
      data?.atPeriodEnd ? { end_of_term: true } : {},
    )
    return transformSubscription(res.subscription)
  }

  // ── Invoices ────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const rows = await this.pageList<RawChargebeeInvoice, 'invoice'>(
      credentials,
      params,
      '/invoices',
      'invoice',
    )
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).get<{ invoice: RawChargebeeInvoice }>(
      `/invoices/${id}`,
    )
    return transformInvoice(res.invoice)
  }

  // ── Charges (transactions) ──────────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.pageList<RawChargebeeTransaction, 'transaction'>(
      credentials,
      params,
      '/transactions',
      'transaction',
    )
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<{ transaction: RawChargebeeTransaction }>(
      `/transactions/${id}`,
    )
    return transformCharge(res.transaction)
  }

  // ── Refunds ─────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const rows = await this.pageList<RawChargebeeRefund, 'transaction'>(
      credentials,
      params,
      '/transactions',
      'transaction',
      { 'type[is]': 'refund' },
    )
    return rows.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<{ transaction: RawChargebeeRefund }>(
      `/transactions/${id}`,
    )
    return transformRefund(res.transaction)
  }

  // ── Payment Methods (payment_sources) ───────────────────────────────────

  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const rows = await this.pageList<RawChargebeePaymentSource, 'payment_source'>(
      credentials,
      params,
      '/payment_sources',
      'payment_source',
    )
    return rows.map(transformPaymentMethod)
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const res = await this.client(credentials).get<{
      payment_source: RawChargebeePaymentSource
    }>(`/payment_sources/${id}`)
    return transformPaymentMethod(res.payment_source)
  }

  // ── Plans ────────────────────────────────────────────────────────────────

  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const rows = await this.pageList<RawChargebeePlan, 'plan'>(
      credentials,
      params,
      '/plans',
      'plan',
    )
    return rows.map(transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const res = await this.client(credentials).get<{ plan: RawChargebeePlan }>(`/plans/${id}`)
    return transformPlan(res.plan)
  }
}
