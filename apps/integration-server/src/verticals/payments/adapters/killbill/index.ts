/**
 * Kill Bill adapter — payments vertical.
 *
 * Kill Bill is self-hosted. Auth is HTTP Basic (a Kill Bill user) plus the
 * tenant headers X-Killbill-ApiKey / X-Killbill-ApiSecret
 * (https://killbill.github.io/slate/, "Authentication and RBAC",
 * "Multi-Tenancy"); every path lives under /1.0/kb/.
 *
 * Paging: the `/pagination` endpoints take `offset` and `limit` (default 100,
 * no documented maximum) and carry the next signal in headers:
 * "X-Killbill-Pagination-NextOffset : The header will only be present if there
 * are additional entries to return" (https://killbill.github.io/slate/,
 * Pagination).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — Kill Bill has no balance-transaction concept; it is an open-source billing engine, not a payment gateway
 * Unavailable: dispute — chargebacks are write-only (POST /1.0/kb/payments/{id}/chargebacks); no list/get endpoint exists
 * Unavailable: payout — Kill Bill has no payout concept; payouts are managed by the underlying payment plugin/gateway
 */

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  pageByRows,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'
import type { Invoice } from '../../schema/invoice'
import type { Subscription } from '../../schema/subscription'
import type { Plan } from '../../schema/plan'
import type { PaymentMethod } from '../../schema/payment-method'

import { DEFAULT_PAGE_SIZE } from './constants'
import { buildCredentials, resolveConnection } from './auth'
import { KillbillClient } from './client'

import { transformCustomer, type RawKillbillAccount } from './transform/customer'
import { isCharge, transformCharge, type RawKillbillPayment } from './transform/charge'
import { refundsOf, transformRefund, type RawKillbillRefund } from './transform/refund'
import { transformInvoice, type RawKillbillInvoice } from './transform/invoice'
import {
  subscriptionsOf,
  transformSubscription,
  type RawKillbillBundle,
  type RawKillbillSubscription,
} from './transform/subscription'
import { transformPlanDetail, type RawKillbillPlanDetail } from './transform/plan'
import { transformPaymentMethod, type RawKillbillPaymentMethod } from './transform/payment-method'

const NEXT_OFFSET = 'x-killbill-pagination-nextoffset'
const TOTAL = 'x-killbill-pagination-totalnbrecords'

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

export class KillbillAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'killbill'
  readonly version = '0.2.0'

  getAuthUrl(): string {
    throw new Error(
      'Kill Bill uses HTTP Basic auth and tenant keys; submit them via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error(
      'Kill Bill uses HTTP Basic auth and tenant keys; call exchangeCredentials instead.',
    )
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'serverUrl',
        label: 'Kill Bill server URL',
        type: 'url',
        required: true,
        placeholder: 'https://killbill.example.com',
        helpText: 'The origin of your Kill Bill server (Kill Bill is self-hosted).',
      },
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
      {
        name: 'apiKey',
        label: 'Tenant API key',
        type: 'text',
        required: true,
        helpText: 'Sent as X-Killbill-ApiKey.',
      },
      {
        name: 'apiSecret',
        label: 'Tenant API secret',
        type: 'password',
        required: true,
        helpText: 'Sent as X-Killbill-ApiSecret.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): KillbillClient {
    return new KillbillClient(credentials)
  }

  /** Pager key scope: one server and tenant, under one user's credentials. */
  private scope(credentials: Credentials): string {
    const conn = resolveConnection(credentials)
    return connectionScope(`${conn.serverUrl}|${conn.apiKey}`, credentials)
  }

  /**
   * One caller page of a `/pagination` endpoint: offset = (page − 1) × limit,
   * with hasMore from X-Killbill-Pagination-NextOffset and the total from
   * -TotalNbRecords. Reports nothing when neither header arrives. Pass
   * `countsRows: false` when the caller filters the rows, so the upstream
   * total is not reported as the count of what it returns.
   */
  private async offsetPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    countsRows = true,
  ): Promise<T[]> {
    const size = params.limit ?? DEFAULT_PAGE_SIZE
    const { data, headers } = await this.client(credentials).getWithHeaders<T[]>(path, {
      limit: size,
      offset: pageOffset(params, size),
    })
    const next = headers[NEXT_OFFSET]
    const totalRaw = headers[TOTAL]
    const total = totalRaw === undefined || !countsRows ? NaN : Number(totalRaw)
    if (next !== undefined || totalRaw !== undefined) {
      reportUpstreamPage(params, {
        hasMore: next !== undefined,
        ...(Number.isFinite(total) ? { totalCount: total } : {}),
      })
    }
    return Array.isArray(data) ? data : []
  }

  /**
   * One upstream page of a `/pagination` endpoint for pageByRows, at the
   * documented default size. The next offset is the NextOffset header; with no
   * pagination header at all, a full page is taken to continue.
   */
  private async upstreamPage<T>(
    credentials: Credentials,
    path: string,
    offset: number | undefined,
  ): Promise<{ items: T[]; next?: number }> {
    const from = offset ?? 0
    const { data, headers } = await this.client(credentials).getWithHeaders<T[]>(path, {
      limit: DEFAULT_PAGE_SIZE,
      offset: from,
    })
    const items = Array.isArray(data) ? data : []
    const next = headers[NEXT_OFFSET]
    if (next !== undefined && Number.isFinite(Number(next))) return { items, next: Number(next) }
    if (headers[TOTAL] !== undefined) return { items }
    return items.length >= DEFAULT_PAGE_SIZE ? { items, next: from + items.length } : { items }
  }

  // ── Customers (Kill Bill accounts) ──────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    // GET /1.0/kb/accounts/pagination (https://killbill.github.io/slate/account.html, "List accounts")
    const rows = await this.offsetPage<RawKillbillAccount>(
      credentials,
      '/1.0/kb/accounts/pagination',
      params,
    )
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    // GET /1.0/kb/accounts/{accountId} ("Retrieve an Account by its ID")
    const res = await this.client(credentials).get<RawKillbillAccount>(
      `/1.0/kb/accounts/${encodeURIComponent(id)}`,
    )
    return transformCustomer(res)
  }

  // ── Charges (Kill Bill payments) ────────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    // GET /1.0/kb/payments/pagination (https://killbill.github.io/slate/payment.html, "Get payments").
    // Payments opened by CREDIT pay the customer and are not charges, so
    // TotalNbRecords (every payment) is not the charge count: omit it.
    const rows = await this.offsetPage<RawKillbillPayment>(
      credentials,
      '/1.0/kb/payments/pagination',
      params,
      false,
    )
    return rows.filter(isCharge).map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    // GET /1.0/kb/payments/{paymentId} ("Retrieve a payment [using paymentId]")
    const res = await this.client(credentials).get<RawKillbillPayment>(
      `/1.0/kb/payments/${encodeURIComponent(id)}`,
    )
    if (!isCharge(res)) throw notFound(`Kill Bill payment ${id} is not a charge`)
    return transformCharge(res)
  }

  // ── Payment Methods ─────────────────────────────────────────────────────────

  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    // GET /1.0/kb/paymentMethods/pagination (https://killbill.github.io/slate/payment-method.html)
    const rows = await this.offsetPage<RawKillbillPaymentMethod>(
      credentials,
      '/1.0/kb/paymentMethods/pagination',
      params,
    )
    return rows.map(transformPaymentMethod)
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const res = await this.client(credentials).get<RawKillbillPaymentMethod>(
      `/1.0/kb/paymentMethods/${encodeURIComponent(id)}`,
    )
    return transformPaymentMethod(res)
  }

  // ── Refunds (REFUND transactions of payments) ───────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    // Kill Bill documents no refund list; a refund is "A new PaymentTransaction
    // of type REFUND" (payment.html). Flatten them out of GET
    // /1.0/kb/payments/pagination, whose Payments carry `transactions`.
    const key = `${this.scope(credentials)}::refunds::payments/pagination::${DEFAULT_PAGE_SIZE}`
    const { items } = await pageByRows<Refund, number>(
      key,
      params,
      async (offset) => {
        const page = await this.upstreamPage<RawKillbillPayment>(
          credentials,
          '/1.0/kb/payments/pagination',
          offset,
        )
        return { items: page.items.flatMap(refundsOf), next: page.next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    // Out of scope for the read rebuild: POST /refunds is not a Kill Bill path.
    const res = await this.client(credentials).post<{ data?: RawKillbillRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }

  // ── Invoices ────────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    // GET /1.0/kb/invoices/pagination (invoice.html, "List invoices") returns
    // "shallow objects and thus the value 0 is returned for the amount,
    // creditAdj, refundAdj and balance fields. In order to retrieve the actual
    // data for these fields, additional endpoints (like retrieve invoice by id)
    // would need to be invoked." So each listed invoice is read back by id.
    const rows = await this.offsetPage<RawKillbillInvoice>(
      credentials,
      '/1.0/kb/invoices/pagination',
      params,
    )
    const client = this.client(credentials)
    const out: Invoice[] = []
    for (const row of rows) {
      const id = typeof row.invoiceId === 'string' ? row.invoiceId : ''
      if (!id) throw new Error('Kill Bill invoice list row has no invoiceId')
      const full = await client.get<RawKillbillInvoice>(
        `/1.0/kb/invoices/${encodeURIComponent(id)}`,
      )
      out.push(transformInvoice(full))
    }
    return out
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    // GET /1.0/kb/invoices/{invoiceId} ("Retrieve an invoice by id")
    const res = await this.client(credentials).get<RawKillbillInvoice>(
      `/1.0/kb/invoices/${encodeURIComponent(id)}`,
    )
    return transformInvoice(res)
  }

  // ── Subscriptions (flattened out of bundles) ────────────────────────────────

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    // subscription.html documents no list; bundles carry a `subscriptions`
    // array and are listed by GET /1.0/kb/bundles/pagination (bundle.html, "List bundles").
    const key = `${this.scope(credentials)}::subscriptions::bundles/pagination::${DEFAULT_PAGE_SIZE}`
    const { items } = await pageByRows<Subscription, number>(
      key,
      params,
      async (offset) => {
        const page = await this.upstreamPage<RawKillbillBundle>(
          credentials,
          '/1.0/kb/bundles/pagination',
          offset,
        )
        return { items: page.items.flatMap(subscriptionsOf), next: page.next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    // GET /1.0/kb/subscriptions/{subscriptionId}
    const res = await this.client(credentials).get<RawKillbillSubscription>(
      `/1.0/kb/subscriptions/${encodeURIComponent(id)}`,
    )
    return transformSubscription(res)
  }

  // ── Plans (catalog base plans) ──────────────────────────────────────────────

  private async allPlans(credentials: Credentials): Promise<Plan[]> {
    // GET /1.0/kb/catalog/availableBasePlans (catalog.html): an unpaginated
    // PlanDetail array (its only parameter is an optional accountId).
    const res = await this.client(credentials).get<RawKillbillPlanDetail[]>(
      '/1.0/kb/catalog/availableBasePlans',
    )
    return (Array.isArray(res) ? res : []).flatMap(transformPlanDetail)
  }

  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    return pageLocally(await this.allPlans(credentials), params)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    // Kill Bill has no get-plan-by-name (GET /1.0/kb/catalog/plan takes a
    // subscriptionId); ids are `<plan>:<currency>` from listPlans.
    const plan = (await this.allPlans(credentials)).find((p) => p.id === id)
    if (!plan) throw notFound(`Kill Bill base plan ${id} not found`)
    return plan
  }
}
