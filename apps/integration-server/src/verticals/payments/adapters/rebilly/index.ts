/**
 * Rebilly adapter — payments vertical.
 *
 * Auth: secret API key in the `REB-APIKEY` header, against
 * `https://api.rebilly.com/organizations/{organizationId}` (sandbox keys:
 * api-sandbox.rebilly.com). See auth.ts.
 *
 * Paging: every collection takes `limit` and `offset` (collectionLimit.yaml /
 * collectionOffset.yaml, each "maximum: 1000"; GET /invoices caps `limit` at
 * 100) and answers with a bare JSON array plus a `Pagination-Total` header,
 * "Total number of items that match the request."
 */

import {
  pageOffset,
  reportUpstreamPage,
  type BaseAdapter,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { Invoice } from '../../schema/invoice'
import type { Plan } from '../../schema/plan'
import type { Dispute } from '../../schema/dispute'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Payout } from '../../schema/payout'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { WebhookEvent } from '../../schema/webhook'

import {
  CHARGE_TYPES,
  DEFAULT_PAGE_SIZE,
  INVOICE_MAX_LIMIT,
  MAX_LIMIT,
  MAX_OFFSET,
  PAYOUT_TYPE,
  REFUND_TYPE,
} from './constants'
import { buildCredentials } from './auth'
import { RebillyClient } from './client'
import { verifyRebillyWebhook, parseRebillyWebhookEvents } from './webhook'

import { transformCustomer, type RawRebillyCustomer } from './transform/customer'
import { transformCharge, type RawRebillyTransaction } from './transform/charge'
import { transformRefund } from './transform/refund'
import { transformSubscription, type RawRebillySubscription } from './transform/subscription'
import { transformInvoice, type RawRebillyInvoice } from './transform/invoice'
import { SINGLE_PRICE_FORMULAS, transformPlan, type RawRebillyPlan } from './transform/plan'
import { transformDispute, type RawRebillyDispute } from './transform/dispute'
import {
  transformPaymentMethod,
  type RawRebillyPaymentInstrument,
} from './transform/payment-method'
import { transformPayout } from './transform/payout'
import {
  transformBalanceTransaction,
  type RawRebillyBalanceTransaction,
} from './transform/balance-transaction'

/**
 * `filter` syntax (https://www.rebilly.com/docs/dev-docs/search-filters):
 * "Fields and values in the filter are separated with `:`", "separate each
 * field:value pair with `;`", "Separate multiple values for one field with `,`".
 */
const CHARGE_FILTER = `type:${CHARGE_TYPES.join(',')}`
const REFUND_FILTER = `type:${REFUND_TYPE}`
const PAYOUT_FILTER = `type:${PAYOUT_TYPE}`
/** SubscriptionOrOneTimeSale.yaml discriminator `orderType`: subscription-order | one-time-order. */
const SUBSCRIPTION_FILTER = 'orderType:subscription-order'
/**
 * Plan.yaml discriminator `type`: subscription | one-time-sale | trial-only;
 * only `subscription` plans have a `recurringInterval`, and only the
 * fixed-fee / flat-rate formulas have a single `price`.
 */
const PLAN_FILTER = `type:subscription;pricing.formula:${SINGLE_PRICE_FORMULAS.join(',')}`

function notFound(what: string, id: string): Error {
  return Object.assign(new Error(`Rebilly ${what} '${id}' not found`), {
    statusCode: 404,
    code: 'NOT_FOUND',
  })
}

export class RebillyAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'rebilly'
  readonly version = '0.2.0'
  /** collectionLimit.yaml: `limit` maximum 1000. */
  readonly capabilities = { maxPageSize: MAX_LIMIT }

  getAuthUrl(): string {
    throw new Error('Rebilly uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Rebilly uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'organizationId',
        label: 'Organization ID',
        type: 'text',
        required: true,
        helpText: 'Settings → My organization & websites → Organization details → ID.',
      },
      {
        name: 'apiKey',
        label: 'Secret API key (sk_live_… or sk_sandbox_…)',
        type: 'password',
        required: true,
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
    return verifyRebillyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseRebillyWebhookEvents(payload)
  }

  private client(credentials: Credentials): RebillyClient {
    return new RebillyClient(credentials)
  }

  /**
   * One caller page of a Rebilly collection: `limit` is the caller's size
   * clamped to the endpoint's maximum, `offset` is `(page − 1) × limit`, and
   * `hasMore` / `totalCount` come from `Pagination-Total`. An offset past the
   * documented maximum (1000) is refused before sending, rather than served as
   * an empty last page that would read as the end of the collection.
   */
  private async listPage<R>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    maxLimit: number,
    filter?: string,
  ): Promise<R[]> {
    const asked =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_PAGE_SIZE
    const limit = Math.min(asked, maxLimit)
    const offset = pageOffset(params, limit)
    if (offset > MAX_OFFSET) {
      throw Object.assign(
        new Error(
          `Rebilly cannot page ${path} past offset ${MAX_OFFSET} (collectionOffset.yaml: ` +
            `"maximum: 1000"); page ${params.page ?? 1} at limit ${limit} starts at offset ${offset}.`,
        ),
        { statusCode: 501, code: 'NOT_SUPPORTED' },
      )
    }
    // The size sent is known before sending; report it even if the request fails.
    if (limit < asked) reportUpstreamPage(params, { pageSize: limit })
    const query: Record<string, unknown> = { limit, offset }
    if (filter !== undefined) query.filter = filter
    const { rows, total } = await this.client(credentials).getPage<R>(path, query)
    if (total !== undefined) {
      reportUpstreamPage(params, {
        totalCount: total,
        hasMore: rows.length > 0 && offset + rows.length < total,
      })
    }
    return rows
  }

  private async getTransaction(
    credentials: Credentials,
    id: string,
    types: readonly string[],
    what: string,
  ): Promise<RawRebillyTransaction> {
    const raw = await this.client(credentials).get<RawRebillyTransaction>(
      `/transactions/${encodeURIComponent(id)}`,
    )
    if (raw.type === undefined || !types.includes(raw.type)) throw notFound(what, id)
    return raw
  }

  // ── Customers ────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await this.listPage<RawRebillyCustomer>(
      credentials,
      params,
      '/customers',
      MAX_LIMIT,
    )
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    return transformCustomer(
      await this.client(credentials).get<RawRebillyCustomer>(
        `/customers/${encodeURIComponent(id)}`,
      ),
    )
  }

  // ── Charges (transactions of type sale / authorize / capture) ─────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.listPage<RawRebillyTransaction>(
      credentials,
      params,
      '/transactions',
      MAX_LIMIT,
      CHARGE_FILTER,
    )
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    return transformCharge(await this.getTransaction(credentials, id, CHARGE_TYPES, 'charge'))
  }

  // ── Refunds (transactions of type refund) ─────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const rows = await this.listPage<RawRebillyTransaction>(
      credentials,
      params,
      '/transactions',
      MAX_LIMIT,
      REFUND_FILTER,
    )
    return rows.map(transformRefund)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    // Out of scope for the read rebuild: POST /refunds is not a documented
    // path (the refund operation is POST /transactions/{id}/refund).
    const res = await this.client(credentials).post<RawRebillyTransaction>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res)
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const rows = await this.listPage<RawRebillySubscription>(
      credentials,
      params,
      '/subscriptions',
      MAX_LIMIT,
      SUBSCRIPTION_FILTER,
    )
    return rows.map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const raw = await this.client(credentials).get<RawRebillySubscription>(
      `/subscriptions/${encodeURIComponent(id)}`,
    )
    if (raw.orderType !== 'subscription-order') throw notFound('subscription', id)
    return transformSubscription(raw)
  }

  // ── Invoices ─────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const rows = await this.listPage<RawRebillyInvoice>(
      credentials,
      params,
      '/invoices',
      INVOICE_MAX_LIMIT,
    )
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    return transformInvoice(
      await this.client(credentials).get<RawRebillyInvoice>(`/invoices/${encodeURIComponent(id)}`),
    )
  }

  // ── Plans ─────────────────────────────────────────────────────────────────

  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const rows = await this.listPage<RawRebillyPlan>(
      credentials,
      params,
      '/plans',
      MAX_LIMIT,
      PLAN_FILTER,
    )
    return rows.map(transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    return transformPlan(
      await this.client(credentials).get<RawRebillyPlan>(`/plans/${encodeURIComponent(id)}`),
    )
  }

  // ── Disputes ─────────────────────────────────────────────────────────────

  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    const rows = await this.listPage<RawRebillyDispute>(credentials, params, '/disputes', MAX_LIMIT)
    return rows.map(transformDispute)
  }

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    return transformDispute(
      await this.client(credentials).get<RawRebillyDispute>(`/disputes/${encodeURIComponent(id)}`),
    )
  }

  // ── Payment Methods (instruments) ────────────────────────────────────────

  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const rows = await this.listPage<RawRebillyPaymentInstrument>(
      credentials,
      params,
      '/payment-instruments',
      MAX_LIMIT,
    )
    return rows.map(transformPaymentMethod)
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    return transformPaymentMethod(
      await this.client(credentials).get<RawRebillyPaymentInstrument>(
        `/payment-instruments/${encodeURIComponent(id)}`,
      ),
    )
  }

  // ── Payouts (transactions of type credit) ─────────────────────────────────

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const rows = await this.listPage<RawRebillyTransaction>(
      credentials,
      params,
      '/transactions',
      MAX_LIMIT,
      PAYOUT_FILTER,
    )
    return rows.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    return transformPayout(await this.getTransaction(credentials, id, [PAYOUT_TYPE], 'payout'))
  }

  // ── Balance Transactions ─────────────────────────────────────────────────

  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    const rows = await this.listPage<RawRebillyBalanceTransaction>(
      credentials,
      params,
      '/balance-transactions',
      MAX_LIMIT,
    )
    return rows.map(transformBalanceTransaction)
  }

  async getBalanceTransaction(credentials: Credentials, id: string): Promise<BalanceTransaction> {
    return transformBalanceTransaction(
      await this.client(credentials).get<RawRebillyBalanceTransaction>(
        `/balance-transactions/${encodeURIComponent(id)}`,
      ),
    )
  }
}
