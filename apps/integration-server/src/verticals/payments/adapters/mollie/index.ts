/**
 * Mollie adapter — payments vertical.
 *
 * Bearer-token auth (API key). Coverage: payments, refunds, customers,
 * mandates (payment methods), subscriptions, invoices, payouts,
 * chargebacks (disputes), settlements (balance transactions).
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: plan — Mollie has no plan/pricing-template concept; subscription billing
//              parameters (amount, interval) are defined inline on the subscription object
//              with no separate plans resource or endpoint in the Mollie API.

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
import type { Refund } from '../../schema/refund'
import type { Customer } from '../../schema/customer'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Subscription } from '../../schema/subscription'
import type { Invoice } from '../../schema/invoice'
import type { Payout } from '../../schema/payout'
import type { Dispute } from '../../schema/dispute'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { WebhookEvent } from '../../schema/webhook'

import { API_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { MollieClient } from './client'
import { parseMollieWebhookEvents, verifyMollieWebhook } from './webhook'

import { transformCustomer, type RawMollieCustomer } from './transform/customer'
import { transformPaymentMethod, type RawMollieMandate } from './transform/payment-method'
import { transformCharge, type RawMolliePayment } from './transform/charge'
import { transformRefund, type RawMollieRefund } from './transform/refund'
import { transformInvoice, type RawMollieInvoice } from './transform/invoice'
import {
  transformSubscription,
  type RawMollieSubscription,
} from './transform/subscription'
import { transformPayout, type RawMolliePayout } from './transform/payout'
import { transformDispute, type RawMollieChargeback } from './transform/dispute'
import {
  transformBalanceTransaction,
  type RawMollieSettlement,
} from './transform/balance-transaction'

interface MollieList<T> {
  _embedded?: Record<string, T[]>
  count?: number
  _links?: { next?: { href?: string } | null }
}

function extractList<T>(res: MollieList<T>): T[] {
  const data = res._embedded ?? {}
  const values = Object.values(data)[0]
  return values ?? []
}

/**
 * The `from` id that starts the next page, read from `_links.next.href`.
 * `from` is inclusive ("start the result set from the item with the given ID
 * and onwards"), so it cannot be derived from the last row of this page.
 */
function nextFrom(res: MollieList<unknown>): string | undefined {
  const href = res._links?.next?.href
  if (!href) return undefined
  // Resolve against the API base so a relative href still pages. A next link
  // that yields no `from` must not read as the end of the collection: that
  // would let the sync worker mark a truncated collection complete.
  const from = new URL(href, `${API_BASE_URL}/`).searchParams.get('from')
  if (!from) throw new Error(`Mollie _links.next has no 'from' cursor: ${href}`)
  return from
}

export class MollieAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'mollie'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Mollie uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Mollie uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API key',
        type: 'password',
        required: true,
        helpText: 'Live keys start with `live_`, test keys with `test_`.',
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
    return verifyMollieWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseMollieWebhookEvents(payload)
  }

  private client(credentials: Credentials): MollieClient {
    return new MollieClient(credentials)
  }

  /**
   * One caller page of a Mollie list endpoint.
   *
   * Mollie paginates by item id (e.g. https://docs.mollie.com/reference/list-payments):
   * "Provide an ID to start the result set from the item with the given ID and
   * onwards. This allows you to paginate the result set. ... The maximum number
   * of items to return. Defaults to 50 items. ... If more items are available,
   * a `_links.next` URL will be present in the result as well." `limit` is
   * 1..250, so one upstream page at the caller's (clamped) limit IS one caller
   * page, and `pageByCursor` carries the `from` of `_links.next` forward.
   */
  private async listPaged<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    const limit = Number.isFinite(asked)
      ? Math.min(Math.max(Math.floor(asked), 1), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope('mollie', credentials), path, { limit })
    const result = await pageByCursor<T, string>(key, params.page, async (from) => {
      const res = await client.get<MollieList<T>>(path, {
        limit,
        ...(from !== undefined ? { from } : {}),
      })
      return { items: extractList<T>(res), next: nextFrom(res) }
    })
    reportUpstreamPage(params, { hasMore: result.hasMore, pageSize: limit })
    return result.items
  }

  // ── Charges ─────────────────────────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.listPaged<RawMolliePayment>(credentials, '/payments', params)
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawMolliePayment>(`/payments/${id}`)
    return transformCharge(raw)
  }

  // ── Refunds ─────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const rows = await this.listPaged<RawMollieRefund>(credentials, '/refunds', params)
    return rows.map(transformRefund)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId required for Mollie refund')
    const raw = await this.client(credentials).post<RawMollieRefund>(
      `/payments/${data.chargeId}/refunds`,
      {
        amount: {
          value: ((data.amount ?? 0) / 100).toFixed(2),
          currency: data.currency ?? 'EUR',
        },
      },
    )
    return transformRefund(raw)
  }

  // ── Customers ───────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await this.listPaged<RawMollieCustomer>(credentials, '/customers', params)
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawMollieCustomer>(`/customers/${id}`)
    return transformCustomer(raw)
  }

  // ── Payment methods (mandates) ──────────────────────────────────────────

  async listPaymentMethods(credentials: Credentials, params: QueryParams): Promise<PaymentMethod[]> {
    const customerId = (params['customer_id'] ?? params['customer']) as string | undefined
    if (!customerId) {
      throw new Error('Mollie listPaymentMethods requires customer_id (mandates are customer-scoped)')
    }
    const res = await this.client(credentials).get<MollieList<RawMollieMandate>>(
      `/customers/${customerId}/mandates`,
    )
    return extractList<RawMollieMandate>(res).map(transformPaymentMethod)
  }

  // ── Subscriptions ───────────────────────────────────────────────────────

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const raw = await this.client(credentials).get<RawMollieSubscription>(`/subscriptions/${id}`)
    return transformSubscription(raw)
  }

  async listSubscriptions(_credentials: Credentials, _params: QueryParams): Promise<Subscription[]> {
    // Mollie subscriptions are customer-scoped (`/customers/:id/subscriptions`).
    // Top-level listing requires fan-out; v1 returns empty.
    return []
  }

  // ── Invoices ────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const rows = await this.listPaged<RawMollieInvoice>(credentials, '/invoices', params)
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const raw = await this.client(credentials).get<RawMollieInvoice>(`/invoices/${id}`)
    return transformInvoice(raw)
  }

  // ── Payouts ─────────────────────────────────────────────────────────────

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const rows = await this.listPaged<RawMolliePayout>(credentials, '/payouts', params)
    return rows.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const raw = await this.client(credentials).get<RawMolliePayout>(`/payouts/${id}`)
    return transformPayout(raw)
  }

  // ── Disputes (chargebacks) ──────────────────────────────────────────────

  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    const rows = await this.listPaged<RawMollieChargeback>(credentials, '/chargebacks', params)
    return rows.map(transformDispute)
  }

  // ── Balance transactions (settlements) ──────────────────────────────────

  async listBalanceTransactions(
    credentials: Credentials,
    _params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    const res = await this.client(credentials).get<MollieList<RawMollieSettlement>>('/settlements')
    return extractList<RawMollieSettlement>(res).map(transformBalanceTransaction)
  }
}
