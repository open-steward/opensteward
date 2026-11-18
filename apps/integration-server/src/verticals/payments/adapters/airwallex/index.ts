/**
 * Airwallex adapter — payments vertical (global, multi-currency anchor).
 *
 * Airwallex is PaymentIntent-centric: a **PaymentIntent** carries the amount,
 * currency, customer and overall status, so it maps onto the canonical
 * **Charge**. Customers and Refunds are first-class resources. All payments
 * resources live under the `/api/v1/pa` prefix and report money in **major
 * units** (scaled to canonical minor units in the transform layer).
 *
 * Auth: a client-id + api-key pair, exchanged at the login endpoint for a
 * ~30-minute bearer token that the client mints and refreshes transparently.
 * The pair is environment-bound (production vs demo), selected on the Connect
 * Link form. No OAuth, no refresh token.
 *
 * Webhooks: HMAC-SHA256 over `x-timestamp` + raw body, hex in `x-signature`
 * (see webhook.ts).
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * All 10 canonical payments resources are available:
 *   balance-transaction  → GET /api/v1/transactions
 *   charge               → GET /api/v1/pa/payment_intents
 *   customer             → GET /api/v1/pa/customers
 *   dispute              → GET /api/v1/pa/payment_disputes
 *   invoice              → GET /api/v1/invoices  (Airwallex Billing layer)
 *   payment-method       → GET /api/v1/pa/payment_methods
 *   payout               → GET /api/v1/transfers
 *   plan                 → derived from GET /api/v1/prices (recurring Prices)
 *   refund               → GET /api/v1/pa/refunds
 *   subscription         → GET /api/v1/subscriptions  (Airwallex Billing layer)
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PAYMENT_INTENTS_PATH,
  REFUNDS_PATH,
  CUSTOMERS_PATH,
  CREATE_SUFFIX,
  paymentIntentCancelPath,
} from './constants'
import { CREDENTIAL_FIELDS, buildCredentials } from './auth'
import { AirwallexClient, type AirwallexListResponse } from './client'
import { parseAirwallexWebhookEvents, verifyAirwallexWebhook } from './webhook'

import { transformCustomer, type RawAirwallexCustomer } from './transform/customer'
import { transformCharge, type RawAirwallexPaymentIntent } from './transform/charge'
import { transformRefund, type RawAirwallexRefund } from './transform/refund'
import {
  transformPaymentMethod,
  type RawAirwallexPaymentMethod,
} from './transform/payment-method'
import { transformPayout, type RawAirwallexTransfer } from './transform/payout'
import {
  transformBalanceTransaction,
  type RawAirwallexTransaction,
} from './transform/balance-transaction'
import { transformDispute, type RawAirwallexDispute } from './transform/dispute'
import { transformInvoice, type RawAirwallexInvoice } from './transform/invoice'
import { transformPlan, type RawAirwallexPrice } from './transform/plan'
import { transformSubscription, type RawAirwallexSubscription } from './transform/subscription'

import type { PaymentMethod } from '../../schema/payment-method'
import type { Payout } from '../../schema/payout'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { Dispute } from '../../schema/dispute'
import type { Invoice } from '../../schema/invoice'
import type { Plan } from '../../schema/plan'
import type { Subscription } from '../../schema/subscription'

export class AirwallexAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'airwallex'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Airwallex uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Airwallex uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // The stored credential is the long-lived api-key pair; the short-lived
    // bearer token is minted lazily inside the client, so nothing to refresh.
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyAirwallexWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseAirwallexWebhookEvents(payload)
  }

  private client(credentials: Credentials): AirwallexClient {
    return new AirwallexClient(credentials)
  }

  /** Airwallex paginates with `page_num` (0-indexed) + `page_size`. */
  private pageParams(params: QueryParams): Record<string, unknown> {
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const out: Record<string, unknown> = { page_size: size }
    if (typeof params.page === 'number' && params.page >= 0) out.page_num = params.page
    return out
  }

  // ── Charges (Airwallex PaymentIntents) ──────────────────────────────────────
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const res = await this.client(credentials).get<
      AirwallexListResponse<RawAirwallexPaymentIntent>
    >(PAYMENT_INTENTS_PATH, this.pageParams(params))
    return (res.items ?? []).map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawAirwallexPaymentIntent>(
      `${PAYMENT_INTENTS_PATH}/${id}`,
    )
    return transformCharge(res ?? {})
  }

  /** Cancel an uncaptured PaymentIntent authorisation. */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<RawAirwallexPaymentIntent>(
      paymentIntentCancelPath(id),
      { request_id: `cancel_${id}_${Date.now()}` },
    )
    return transformCharge(res ?? {})
  }

  // ── Customers ───────────────────────────────────────────────────────────────
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).get<AirwallexListResponse<RawAirwallexCustomer>>(
      CUSTOMERS_PATH,
      this.pageParams(params),
    )
    return (res.items ?? []).map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawAirwallexCustomer>(
      `${CUSTOMERS_PATH}/${id}`,
    )
    return transformCustomer(res ?? {})
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const [firstName, ...rest] = (data.name ?? '').trim().split(/\s+/)
    const res = await this.client(credentials).post<RawAirwallexCustomer>(
      `${CUSTOMERS_PATH}${CREATE_SUFFIX}`,
      {
        request_id: `cust_${Date.now()}`,
        email: data.email,
        phone_number: data.phone,
        first_name: firstName || undefined,
        last_name: rest.length > 0 ? rest.join(' ') : undefined,
        metadata: data.metadata,
      },
    )
    return transformCustomer(res ?? {})
  }

  // ── Refunds ─────────────────────────────────────────────────────────────────
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const res = await this.client(credentials).get<AirwallexListResponse<RawAirwallexRefund>>(
      REFUNDS_PATH,
      this.pageParams(params),
    )
    return (res.items ?? []).map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<RawAirwallexRefund>(`${REFUNDS_PATH}/${id}`)
    return transformRefund(res ?? {})
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (Airwallex payment_intent_id) is required for a refund')
    // Airwallex amounts are in major units; the canonical `amount` is minor
    // units, so scale back before sending.
    const amount = typeof data.amount === 'number' ? data.amount / 100 : undefined
    const res = await this.client(credentials).post<RawAirwallexRefund>(
      `${REFUNDS_PATH}${CREATE_SUFFIX}`,
      {
        request_id: `refund_${Date.now()}`,
        payment_intent_id: data.chargeId,
        amount,
        reason: data.reason,
        metadata: data.metadata,
      },
    )
    return transformRefund(res ?? {})
  }

  // ── Payment methods ──────────────────────────────────────────────────────────
  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const res = await this.client(credentials).get<AirwallexListResponse<RawAirwallexPaymentMethod>>(
      '/api/v1/pa/payment_methods',
      this.pageParams(params),
    )
    return (res.items ?? []).map(transformPaymentMethod)
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const res = await this.client(credentials).get<RawAirwallexPaymentMethod>(
      `/api/v1/pa/payment_methods/${encodeURIComponent(id)}`,
    )
    return transformPaymentMethod(res ?? {})
  }

  // ── Payouts (Airwallex Transfers) ────────────────────────────────────────────
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const res = await this.client(credentials).get<AirwallexListResponse<RawAirwallexTransfer>>(
      '/api/v1/transfers',
      this.pageParams(params),
    )
    return (res.items ?? []).map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<RawAirwallexTransfer>(
      `/api/v1/transfers/${encodeURIComponent(id)}`,
    )
    return transformPayout(res ?? {})
  }

  // ── Balance transactions (Airwallex Transaction History) ─────────────────────
  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    const res = await this.client(credentials).get<AirwallexListResponse<RawAirwallexTransaction>>(
      '/api/v1/transactions',
      this.pageParams(params),
    )
    return (res.items ?? []).map(transformBalanceTransaction)
  }

  async getBalanceTransaction(
    credentials: Credentials,
    id: string,
  ): Promise<BalanceTransaction> {
    const res = await this.client(credentials).get<RawAirwallexTransaction>(
      `/api/v1/transactions/${encodeURIComponent(id)}`,
    )
    return transformBalanceTransaction(res ?? {})
  }

  // ── Disputes (Airwallex Payment Disputes) ────────────────────────────────────
  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    const res = await this.client(credentials).get<AirwallexListResponse<RawAirwallexDispute>>(
      '/api/v1/pa/payment_disputes',
      this.pageParams(params),
    )
    return (res.items ?? []).map(transformDispute)
  }

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const res = await this.client(credentials).get<RawAirwallexDispute>(
      `/api/v1/pa/payment_disputes/${encodeURIComponent(id)}`,
    )
    return transformDispute(res ?? {})
  }

  // ── Invoices (Airwallex Billing) ─────────────────────────────────────────────
  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const res = await this.client(credentials).get<AirwallexListResponse<RawAirwallexInvoice>>(
      '/api/v1/invoices',
      this.pageParams(params),
    )
    return (res.items ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).get<RawAirwallexInvoice>(
      `/api/v1/invoices/${encodeURIComponent(id)}`,
    )
    return transformInvoice(res ?? {})
  }

  // ── Plans (Airwallex Prices — derived) ──────────────────────────────────────
  /** Airwallex has no "plan" object. We derive plans from the Prices catalog. */
  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const res = await this.client(credentials).get<AirwallexListResponse<RawAirwallexPrice>>(
      '/api/v1/prices',
      this.pageParams(params),
    )
    return (res.items ?? []).map(transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const res = await this.client(credentials).get<RawAirwallexPrice>(
      `/api/v1/prices/${encodeURIComponent(id)}`,
    )
    return transformPlan(res ?? {})
  }

  // ── Subscriptions (Airwallex Billing) ────────────────────────────────────────
  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const res = await this.client(credentials).get<
      AirwallexListResponse<RawAirwallexSubscription>
    >('/api/v1/subscriptions', this.pageParams(params))
    return (res.items ?? []).map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<RawAirwallexSubscription>(
      `/api/v1/subscriptions/${encodeURIComponent(id)}`,
    )
    return transformSubscription(res ?? {})
  }
}
