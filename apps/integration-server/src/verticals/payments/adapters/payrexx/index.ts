/**
 * Payrexx adapter — payments vertical.
 *
 * Auth: API Secret in the X-API-KEY header, plus the instance name on every
 * request (https://developers.payrexx.com/reference/rest-api.md).
 */
// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: customer — no customer or contact endpoint among the 35 reference pages in https://developers.payrexx.com/llms.txt (the only contact entry is the write "Update Pre-Authorization/Tokenization Contact Details"); contacts appear only nested in transactions
// Unavailable: refund (list/get) — a refund is only the action POST /Transaction/{id}/refund
// Unavailable: balance-transaction — Payrexx has no dedicated balance-transaction ledger endpoint; payout transfers array provides partial data but no canonical balance-transaction resource
// Unavailable: dispute — No dispute/chargeback endpoint found in Payrexx REST API docs or PHP SDK
// Refused until rebuilt: invoice, payout, subscription (list and get) — their transforms were never checked against the docs and returned wrong values; see NOT_REBUILT_* below
// Unavailable: plan — Payrexx has no catalog-style plan/price/product endpoint; subscriptions are parameter-driven on the Gateway/Invoice

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { Invoice } from '../../schema/invoice'
import type { Payout } from '../../schema/payout'
import type { PaymentMethod } from '../../schema/payment-method'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE } from './constants'
import { buildCredentials, credentialFields } from './auth'
import { PayrexxClient } from './client'
import { verifyPayrexxWebhook, parsePayrexxWebhookEvents } from './webhook'

import { transformCharge, type RawPayrexxTransaction } from './transform/charge'
import { transformRefund, type RawPayrexxRefund } from './transform/refund'
import { transformPaymentMethod, type RawPayrexxPaymentMethod } from './transform/payment-method'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * Invoice, payout and subscription reads refuse until their transforms are
 * rebuilt against the docs. What they did:
 *
 * - Invoices: "Retrieve an Invoice" answers
 *   `"data": [ { ... "total": 2700, ... "currency": "CHF" ... } ]`
 *   (https://developers.payrexx.com/reference/retrieve-an-invoice.md). The
 *   transform read `originalAmount`, so every amount was 0, and getInvoice
 *   read `data` as an object where the response carries an array.
 * - Subscriptions: "/Subscription/{id}/" also answers
 *   `"data": [ { "id": 1, "uuid": "a5e0c919", ... } ]`
 *   (https://developers.payrexx.com/reference/retrieve-a-subscription.md),
 *   read as an object; unknown statuses became 'active'.
 * - Payouts: "Retrieve Payout" answers `"data": { "uuid": "C6B438B9", ...
 *   "amount": 1000, ... "currency": "CHF" }` (an object, which getPayout read
 *   correctly; https://developers.payrexx.com/reference/retrieve-payout.md).
 *   The defect is the defaults below.
 * - All three transforms invented 'CHF' when no currency was read, and ''
 *   when no id was.
 */
const NOT_REBUILT_INVOICE =
  'its transform was never rebuilt against the documented response: amounts read originalAmount where the documented field is total, the currency defaulted to CHF, and the single read took the documented data array for an object'
const NOT_REBUILT_SUBSCRIPTION =
  "its transform was never rebuilt against the documented response: the currency defaulted to CHF, the customer id to '', unknown statuses became 'active', and the single read took the documented data array for an object"
const NOT_REBUILT_PAYOUT =
  "its transform was never rebuilt against the documented response: the currency defaulted to CHF and missing ids to ''"

export class PayrexxAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'payrexx'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Payrexx uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Payrexx uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPayrexxWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePayrexxWebhookEvents(payload)
  }

  private client(credentials: Credentials): PayrexxClient {
    return new PayrexxClient(credentials)
  }

  /**
   * One caller page of an offset/limit list. No maximum `limit` is documented,
   * nor a total or next-page signal, so the end is a page shorter than the one
   * asked for.
   */
  private async listByOffset<R>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<R[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const res = await this.client(credentials).get<{ data?: R[] }>(path, {
      limit,
      offset: pageOffset(params, limit),
    })
    const rows = res.data ?? []
    reportUpstreamPage(params, { hasMore: rows.length >= limit })
    return rows
  }

  // The API reference (https://developers.payrexx.com/reference/rest-api)
  // has no customer or contact endpoint; contact data appears only nested in
  // Transaction objects.
  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported('Payrexx cannot list customers: the API has no customer or contact endpoint')
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported(
      'Payrexx cannot read a customer: the API has no customer or contact endpoint',
    )
  }

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    // GET /Transaction/ ("Retrieve Transactions"): "offset" is "Row count to be
    // used as offset", "limit" is "Max row count"; orderByTime defaults to ASC.
    // (https://developers.payrexx.com/reference/retrieve-transactions.md)
    const rows = await this.listByOffset<RawPayrexxTransaction>(
      credentials,
      '/Transaction/',
      params,
    )
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    // GET /Transaction/{id}/ answers a one-row `data` array
    // (https://developers.payrexx.com/reference/retrieve-a-transaction.md).
    const res = await this.client(credentials).get<{ data?: RawPayrexxTransaction[] }>(
      `/Transaction/${encodeURIComponent(id)}/`,
    )
    const row = res.data?.[0]
    if (!row) {
      throw Object.assign(new Error(`Payrexx transaction ${id} not found`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    return transformCharge(row)
  }

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    // The only refund endpoint is the action "Refund a Transaction"
    // (POST /Transaction/{id}/refund,
    // https://developers.payrexx.com/reference/refund-a-transaction.md).
    throw notSupported(
      'Payrexx cannot list refunds: a refund is only the action "Refund a Transaction"',
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawPayrexxRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }

  async listSubscriptions(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<Subscription[]> {
    throw notSupported(`Payrexx cannot list subscriptions: ${NOT_REBUILT_SUBSCRIPTION}`)
  }

  async getSubscription(_credentials: Credentials, _id: string): Promise<Subscription> {
    throw notSupported(`Payrexx cannot read a subscription: ${NOT_REBUILT_SUBSCRIPTION}`)
  }

  async listInvoices(_credentials: Credentials, _params: QueryParams): Promise<Invoice[]> {
    throw notSupported(`Payrexx cannot list invoices: ${NOT_REBUILT_INVOICE}`)
  }

  async getInvoice(_credentials: Credentials, _id: string): Promise<Invoice> {
    throw notSupported(`Payrexx cannot read an invoice: ${NOT_REBUILT_INVOICE}`)
  }

  async listPayouts(_credentials: Credentials, _params: QueryParams): Promise<Payout[]> {
    throw notSupported(`Payrexx cannot list payouts: ${NOT_REBUILT_PAYOUT}`)
  }

  async getPayout(_credentials: Credentials, _id: string): Promise<Payout> {
    throw notSupported(`Payrexx cannot read a payout: ${NOT_REBUILT_PAYOUT}`)
  }

  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    // "Get All Active Payment Methods" documents only filterCurrency,
    // filterPaymentType and filterPsp — no paging — so one response is the
    // whole collection and the caller's page is cut here.
    // (https://developers.payrexx.com/reference/get-all-active-payment-methods.md)
    const res = await this.client(credentials).get<{ data?: RawPayrexxPaymentMethod[] }>(
      '/PaymentMethod/',
    )
    return pageLocally((res.data ?? []).map(transformPaymentMethod), params)
  }
}
