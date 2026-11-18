/**
 * Mercado Pago adapter — payments vertical.
 *
 * Bearer-token auth (access token). Coverage: payments (charges),
 * refunds, customers, cards (payment methods), preapprovals (subscriptions),
 * preapproval plans, payouts, authorized-payment invoices.
 */
// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: balance-transaction — Mercado Pago exposes balance data only
//   via downloadable CSV reports (/v1/account/settlement_report), not a
//   queryable REST endpoint for individual balance-transaction records.

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import { connectionScope, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Customer } from '../../schema/customer'
import type { Dispute } from '../../schema/dispute'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Subscription } from '../../schema/subscription'
import type { Plan } from '../../schema/plan'
import type { Payout } from '../../schema/payout'
import type { Invoice } from '../../schema/invoice'
import type { WebhookEvent } from '../../schema/webhook'

import {
  DEFAULT_PAGE_SIZE,
  PAYMENTS_SEARCH_MAX_LIMIT,
  PAYMENTS_SEARCH_MAX_OFFSET,
  USERS_ME_URL,
} from './constants'
import { buildCredentials } from './auth'
import { MercadoPagoClient } from './client'
import { parseMercadoPagoWebhookEvents, verifyMercadoPagoWebhook } from './webhook'

import { transformCustomer, type RawMPCustomer } from './transform/customer'
import { transformPaymentMethod, type RawMPCard } from './transform/payment-method'
import { transformCharge, type RawMPPayment } from './transform/charge'
import { transformRefund, type RawMPRefund } from './transform/refund'
import { transformSubscription, type RawMPPreapproval } from './transform/subscription'
import { transformPlan, type RawMPPreapprovalPlan } from './transform/plan'
import { transformDispute, type RawMPChargeback } from './transform/dispute'
import { transformInvoice, type RawMPAuthorizedPayment } from './transform/invoice'

interface SearchResult<T> {
  results?: T[]
  paging?: { total?: number; offset?: number; limit?: number }
}

/**
 * The page size to ask a search endpoint for: the caller's limit (whole, ≥ 1,
 * else DEFAULT_PAGE_SIZE), clamped to the endpoint's documented maximum.
 */
function searchPageSize(params: QueryParams, max?: number): number {
  const raw = params.limit ?? DEFAULT_PAGE_SIZE
  const size = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_PAGE_SIZE
  return max === undefined ? size : Math.min(size, max)
}

/** A usable seller id: a positive safe integer (isSafeInteger is false for non-numbers). */
function isSellerId(v: unknown): v is number {
  return Number.isSafeInteger(v) && (v as number) > 0
}

export class MercadoPagoAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'mercado-pago'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Mercado Pago uses an access token; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Mercado Pago uses an access token; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'accessToken',
        label: 'Access token',
        type: 'password',
        required: true,
        helpText: 'Generated in Mercado Pago Developers > Your applications > Credentials.',
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
    return verifyMercadoPagoWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseMercadoPagoWebhookEvents(payload)
  }

  private client(credentials: Credentials): MercadoPagoClient {
    return new MercadoPagoClient(credentials)
  }

  /** Seller ids by connectionScope, held as the in-flight or settled lookup. */
  private readonly sellerIds = new Map<string, Promise<number>>()

  /**
   * The seller id the chargeback endpoints require as X-Caller-Id, looked up
   * once per connection with the connection's own access token. The users
   * guide for that host documents the answer carrying it: "Recibirás toda la
   * información del usuario relacionado al token usado, por ejemplo:
   * { "id": 2320007493, "nickname": "TESTUSER942900259", ..."
   * (https://developers.mercadolibre.com.ar/es_ar/consulta-de-usuarios).
   * A failed lookup is dropped from the cache so the next read retries it,
   * and nothing is sent to the chargeback endpoint without an id.
   */
  private sellerId(credentials: Credentials): Promise<number> {
    const key = connectionScope(this.platform, credentials)
    const cached = this.sellerIds.get(key)
    if (cached) return cached
    const lookup = this.client(credentials)
      .get<{ id?: unknown }>(USERS_ME_URL)
      .then((me) => {
        const id = me?.id
        if (!isSellerId(id)) throw new Error('Mercado Pago /users/me returned no seller id')
        return id
      })
    lookup.catch(() => this.sellerIds.delete(key))
    this.sellerIds.set(key, lookup)
    return lookup
  }

  /**
   * One caller page of a Mercado Pago search endpoint. Every one pages by
   * `offset` + `limit` and answers `{ paging: { total, limit, offset }, results }`
   * (e.g. /preapproval/search: "Specifies the offset of the first item in the
   * collection to return."). The offset strides by the size actually sent, so
   * a clamped page still reaches every row, and that size is reported.
   * Where the endpoint caps the offset (`maxOffset`), a next page that would
   * start past the cap is not announced: requesting it fails upstream, so the
   * reachable end is reported instead (totalCount still says how many exist).
   * Without a numeric `paging.total` the end is unknown and is not reported.
   * Only `offset` and `limit` are sent; no caller filter is forwarded.
   */
  private async search<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    max?: number,
    maxOffset?: number,
  ): Promise<T[]> {
    const limit = searchPageSize(params, max)
    const offset = pageOffset(params, limit)
    const res = await this.client(credentials).get<SearchResult<T>>(path, { offset, limit })
    const total = res.paging?.total
    const next = offset + limit
    reportUpstreamPage(
      params,
      typeof total === 'number'
        ? {
            totalCount: total,
            hasMore: next < total && (maxOffset === undefined || next <= maxOffset),
            pageSize: limit,
          }
        : { pageSize: limit },
    )
    return res.results ?? []
  }

  // ── Charges ─────────────────────────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    // limit: "Number of results shown (max value = 50)."
    const rows = await this.search<RawMPPayment>(
      credentials,
      '/v1/payments/search',
      params,
      PAYMENTS_SEARCH_MAX_LIMIT,
      PAYMENTS_SEARCH_MAX_OFFSET,
    )
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawMPPayment>(`/v1/payments/${id}`)
    return transformCharge(raw)
  }

  // ── Refunds ─────────────────────────────────────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId required for Mercado Pago refund')
    const raw = await this.client(credentials).post<RawMPRefund>(
      `/v1/payments/${data.chargeId}/refunds`,
      data.amount ? { amount: data.amount / 100 } : {},
    )
    return transformRefund({ ...raw, payment_id: data.chargeId })
  }

  // ── Customers ───────────────────────────────────────────────────────────

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawMPCustomer>(`/v1/customers/${id}`)
    return transformCustomer(raw)
  }

  // ── Payment methods (cards) ─────────────────────────────────────────────

  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const customerId = (params['customer_id'] ?? params['customer']) as string | undefined
    if (!customerId) {
      throw new Error(
        'Mercado Pago listPaymentMethods requires customer_id (cards are customer-scoped)',
      )
    }
    const cards = await this.client(credentials).get<RawMPCard[]>(
      `/v1/customers/${customerId}/cards`,
    )
    return (cards ?? []).map(transformPaymentMethod)
  }

  // ── Subscriptions (preapprovals) + plans ────────────────────────────────

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const rows = await this.search<RawMPPreapproval>(credentials, '/preapproval/search', params)
    return rows.map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const raw = await this.client(credentials).get<RawMPPreapproval>(`/preapproval/${id}`)
    return transformSubscription(raw)
  }

  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const rows = await this.search<RawMPPreapprovalPlan>(
      credentials,
      '/preapproval_plan/search',
      params,
    )
    return rows.map(transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const raw = await this.client(credentials).get<RawMPPreapprovalPlan>(`/preapproval_plan/${id}`)
    return transformPlan(raw)
  }

  // ── Payouts (money-out withdrawals) ─────────────────────────────────────

  async listPayouts(_credentials: Credentials, _params: QueryParams): Promise<Payout[]> {
    // The Payouts API reference lists no collection read, only reads by id:
    // https://www.mercadopago.com.br/developers/en/reference/online-payments/payouts/overview.md
    throw notSupported(
      'Mercado Pago cannot list payouts: the Payouts API reads a batch only by id ' +
        '("GET /v1/payouts/{payout_id}: Returns the status and consolidated summary of a ' +
        'transaction batch (_payout_) by its ID.")',
    )
  }

  async getPayout(_credentials: Credentials, _id: string): Promise<Payout> {
    // GET /v1/payouts/{payout_id} documents id, status, external_reference,
    // config and summary counts, but no amount or currency, both of which the
    // canonical Payout requires. The old /v1/account/movements/{id} path is
    // not in the reference.
    throw notSupported(
      'Mercado Pago cannot read a payout: GET /v1/payouts/{payout_id} returns no amount or currency',
    )
  }

  // ── Disputes (chargebacks) ───────────────────────────────────────────────

  /**
   * GET /v1/chargebacks/search is scoped to one payment: "This endpoint
   * allows you to search for all chargeback cases associated with a
   * `payment_id`", and `payment_id` is "(integer, required)". There is no
   * account-wide chargeback list, so the dispute collection cannot be listed
   * and every call is refused before any request. (A per-payment variant is
   * not offered: the list route forwards no payment_id, and one payment's
   * cases would be cached as the complete collection.)
   * https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-api-payments/chargebacks/search-chargebacks/get.md
   */
  async listDisputes(_credentials: Credentials, _params: QueryParams): Promise<Dispute[]> {
    throw notSupported(
      'Mercado Pago cannot list disputes: chargeback search is per payment ("This endpoint ' +
        'allows you to search for all chargeback cases associated with a `payment_id`") and ' +
        'there is no account-wide chargeback list',
    )
  }

  /**
   * GET /v1/chargebacks/{id} requires, under Header: "`X-Caller-Id` (integer,
   * required) ID of the authenticated user (`seller ID`) and owner of the
   * requested resource." It is resolved from /users/me (see sellerId), so a
   * connection needs no extra field and no reconnect.
   * https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-api-payments/chargebacks/get-chargeback/get.md
   */
  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const callerId = await this.sellerId(credentials)
    const raw = await this.client(credentials).get<RawMPChargeback>(
      `/v1/chargebacks/${id}`,
      undefined,
      { 'X-Caller-Id': String(callerId) },
    )
    return transformDispute(raw)
  }

  // ── Invoices (authorized subscription payments) ──────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const rows = await this.search<RawMPAuthorizedPayment>(
      credentials,
      '/authorized_payments/search',
      params,
    )
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const raw = await this.client(credentials).get<RawMPAuthorizedPayment>(
      `/authorized_payments/${id}`,
    )
    return transformInvoice(raw)
  }
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}
