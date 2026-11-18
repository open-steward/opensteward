/**
 * Lago adapter — payments vertical.
 *
 * Lago (https://getlago.com) is an open-source metering + usage-based billing
 * platform. It is invoice-centric rather than charge-centric: a customer is
 * assigned a plan via a subscription, usage events accrue, and Lago issues
 * invoices; the reversal instrument is a credit note. This adapter maps Lago's
 * resources onto the canonical payments schema:
 *
 *   Lago customer     → Customer   (addressed by `external_id`)
 *   Lago invoice      → Invoice    (addressed by `lago_id`)
 *   Lago credit note  → Refund     (addressed by `lago_id`)
 *   Lago subscription → Subscription (addressed by `external_id`)
 *   Lago plan         → Plan       (addressed by `code`)
 *
 * Auth: a single organisation API key sent as a Bearer token (no OAuth, no
 * refresh). The optional `baseUrl` field selects the cloud region (US / EU) or
 * a self-hosted origin; the key itself selects the organisation, so there is no
 * sandbox/live flag.
 *
 * Webhooks: HMAC-SHA256 over the raw body, base64-encoded, in `X-Lago-Signature`.
 *
 * Resources coverage:
 *
 *   Lago payment (invoice settlement) → Charge   (GET /payments)
 *   Lago payment method               → PaymentMethod (GET /customers/{id}/payment_methods)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — Lago has no acquiring/ledger layer; no balance transaction concept
 * Unavailable: dispute — Lago has no dispute management; chargebacks are handled by the external payment provider
 * Unavailable: payout — Lago has no merchant payout/disbursement concept; payouts belong to the external provider
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
import type { Invoice } from '../../schema/invoice'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { Plan } from '../../schema/plan'
import type { WebhookEvent } from '../../schema/webhook'

import {
  DEFAULT_PAGE_SIZE,
  CUSTOMERS_PATH,
  INVOICES_PATH,
  CREDIT_NOTES_PATH,
  SUBSCRIPTIONS_PATH,
  PLANS_PATH,
  PAYMENTS_PATH,
} from './constants'
import { buildCredentials } from './auth'
import { LagoClient } from './client'
import { parseLagoWebhookEvents, verifyLagoWebhook } from './webhook'

import {
  transformCustomer,
  untransformCustomer,
  type RawLagoCustomer,
} from './transform/customer'
import { transformCharge, type RawLagoPayment } from './transform/charge'
import { transformInvoice, type RawLagoInvoice } from './transform/invoice'
import {
  transformPaymentMethod,
  type RawLagoPaymentMethod,
} from './transform/payment-method'
import { transformRefund, type RawLagoCreditNote } from './transform/refund'
import {
  transformSubscription,
  type RawLagoSubscription,
} from './transform/subscription'
import { transformPlan, type RawLagoPlan } from './transform/plan'

interface LagoListEnvelope<T> {
  meta?: {
    current_page?: number
    next_page?: number | null
    prev_page?: number | null
    total_pages?: number
    total_count?: number
  }
  [key: string]: T[] | unknown
}

export class LagoAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'lago'
  readonly version = '0.1.0'

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(): string {
    throw new Error('Lago uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Lago uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API key',
        type: 'password',
        required: true,
        placeholder: 'lago_xxxxxxxxxxxxxxxx',
        helpText:
          'Your Lago organisation API key (Developers → API keys). Scopes a single organisation.',
      },
      {
        name: 'baseUrl',
        label: 'API base URL',
        type: 'url',
        required: false,
        placeholder: 'https://api.getlago.com',
        helpText:
          'Leave blank for the US cloud. Use https://api.eu.getlago.com for the EU region, or your self-hosted origin.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyLagoWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseLagoWebhookEvents(payload)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private client(credentials: Credentials): LagoClient {
    return new LagoClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params['page']) out.page = params['page']
    return out
  }

  private collection<T>(env: LagoListEnvelope<T>, key: string): T[] {
    const value = env[key]
    return Array.isArray(value) ? (value as T[]) : []
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).get<LagoListEnvelope<RawLagoCustomer>>(
      CUSTOMERS_PATH,
      this.listParams(params),
    )
    return this.collection<RawLagoCustomer>(res, 'customers').map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ customer?: RawLagoCustomer }>(
      `${CUSTOMERS_PATH}/${encodeURIComponent(id)}`,
    )
    return transformCustomer(res.customer ?? {})
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const res = await this.client(credentials).post<{ customer?: RawLagoCustomer }>(
      CUSTOMERS_PATH,
      { customer: untransformCustomer(data) },
    )
    return transformCustomer(res.customer ?? {})
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    // Lago upserts customers via POST /customers keyed by external_id.
    const res = await this.client(credentials).post<{ customer?: RawLagoCustomer }>(
      CUSTOMERS_PATH,
      { customer: { external_id: id, ...untransformCustomer(data) } },
    )
    return transformCustomer(res.customer ?? {})
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`${CUSTOMERS_PATH}/${encodeURIComponent(id)}`)
  }

  // ── Invoices ──────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const query = this.listParams(params)
    const externalCustomerId = params['external_customer_id'] ?? params['customer_id']
    if (externalCustomerId) query.external_customer_id = externalCustomerId
    const res = await this.client(credentials).get<LagoListEnvelope<RawLagoInvoice>>(
      INVOICES_PATH,
      query,
    )
    return this.collection<RawLagoInvoice>(res, 'invoices').map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).get<{ invoice?: RawLagoInvoice }>(
      `${INVOICES_PATH}/${encodeURIComponent(id)}`,
    )
    return transformInvoice(res.invoice ?? {})
  }

  async voidInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).post<{ invoice?: RawLagoInvoice }>(
      `${INVOICES_PATH}/${encodeURIComponent(id)}/void`,
    )
    return transformInvoice(res.invoice ?? {})
  }

  // ── Refunds (Lago credit notes) ───────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const query = this.listParams(params)
    const externalCustomerId = params['external_customer_id'] ?? params['customer_id']
    if (externalCustomerId) query.external_customer_id = externalCustomerId
    const res = await this.client(credentials).get<LagoListEnvelope<RawLagoCreditNote>>(
      CREDIT_NOTES_PATH,
      query,
    )
    return this.collection<RawLagoCreditNote>(res, 'credit_notes').map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<{ credit_note?: RawLagoCreditNote }>(
      `${CREDIT_NOTES_PATH}/${encodeURIComponent(id)}`,
    )
    return transformRefund(res.credit_note ?? {})
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  async listSubscriptions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Subscription[]> {
    const query = this.listParams(params)
    const externalCustomerId = params['external_customer_id'] ?? params['customer_id']
    if (externalCustomerId) query.external_customer_id = externalCustomerId
    if (params['plan_code']) query.plan_code = params['plan_code']
    const res = await this.client(credentials).get<LagoListEnvelope<RawLagoSubscription>>(
      SUBSCRIPTIONS_PATH,
      query,
    )
    return this.collection<RawLagoSubscription>(res, 'subscriptions').map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<{ subscription?: RawLagoSubscription }>(
      `${SUBSCRIPTIONS_PATH}/${encodeURIComponent(id)}`,
    )
    return transformSubscription(res.subscription ?? {})
  }

  async cancelSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    // Lago terminates a subscription by its external_id.
    const res = await this.client(credentials).delete<{ subscription?: RawLagoSubscription }>(
      `${SUBSCRIPTIONS_PATH}/${encodeURIComponent(id)}`,
    )
    return transformSubscription(res.subscription ?? {})
  }

  // ── Charges (Lago payments — invoice settlement records) ──────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const query = this.listParams(params)
    const externalCustomerId = params['external_customer_id'] ?? params['customer_id']
    if (externalCustomerId) query.external_customer_id = externalCustomerId
    if (params['invoice_id']) query.invoice_id = params['invoice_id']
    const res = await this.client(credentials).get<LagoListEnvelope<RawLagoPayment>>(
      PAYMENTS_PATH,
      query,
    )
    return this.collection<RawLagoPayment>(res, 'payments').map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<{ payment?: RawLagoPayment }>(
      `${PAYMENTS_PATH}/${encodeURIComponent(id)}`,
    )
    return transformCharge(res.payment ?? {})
  }

  // ── Payment methods ───────────────────────────────────────────────────────

  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const customerId =
      params['external_customer_id'] ?? params['customer_id'] ?? params['customerId']
    if (!customerId) return []
    const res = await this.client(credentials).get<
      LagoListEnvelope<RawLagoPaymentMethod>
    >(
      `${CUSTOMERS_PATH}/${encodeURIComponent(String(customerId))}/payment_methods`,
      this.listParams(params),
    )
    return this.collection<RawLagoPaymentMethod>(res, 'payment_methods').map(
      (pm) => transformPaymentMethod({ ...pm, external_customer_id: String(customerId) }),
    )
  }

  // ── Plans ─────────────────────────────────────────────────────────────────

  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const res = await this.client(credentials).get<LagoListEnvelope<RawLagoPlan>>(
      PLANS_PATH,
      this.listParams(params),
    )
    return this.collection<RawLagoPlan>(res, 'plans').map(transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const res = await this.client(credentials).get<{ plan?: RawLagoPlan }>(
      `${PLANS_PATH}/${encodeURIComponent(id)}`,
    )
    return transformPlan(res.plan ?? {})
  }
}
