/**
 * Helcim adapter — payments vertical (Canada-first card acquirer).
 *
 * Helcim is a direct merchant acquirer: a card **transaction** carries the
 * amount, currency, card and customer reference, so it maps onto the canonical
 * **Charge**. Reads come from `GET /card-transactions`; a new charge is created
 * via the Payment API (`POST /payment/purchase`). Customers are a first-class
 * resource at `/customers`. A refund is created with `POST /payment/refund`
 * against an existing transaction — there is no refund list — so only
 * `createRefund` is implemented.
 *
 * Auth: a single `api-token` header (Helcim's own scheme, not OAuth Bearer).
 * The token is bound to the merchant account it was minted in, so there is no
 * host/mode flag and no refresh. We use the shared `simpleApiKey` template with
 * an `apiToken` field, then wire the token onto the `api-token` request header
 * in the client.
 *
 * Webhooks: Standard Webhooks signature scheme (HMAC-SHA256, base64), verified
 * with the merchant's base64-decoded Verifier Token (see webhook.ts).
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: payout           — Helcim has no merchant-accessible payout/
 *                                 disbursement API; funds are settled through
 *                                 their acquiring bank automatically.
 * Unavailable: dispute          — No chargeback or dispute endpoint exists in
 *                                 the Helcim REST API.
 * Unavailable: balance-transaction — No ledger/balance transaction endpoint
 *                                    exists in the Helcim REST API.
 */

import type {
  BaseAdapter,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import { simpleApiKey } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Invoice } from '../../schema/invoice'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Plan } from '../../schema/plan'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import {
  DEFAULT_PAGE_SIZE,
  CUSTOMERS_PATH,
  CARD_TRANSACTIONS_PATH,
  PAYMENT_PURCHASE_PATH,
  PAYMENT_REFUND_PATH,
  INVOICES_PATH,
  CUSTOMER_CARDS_PATH,
  PAYMENT_PLANS_PATH,
  SUBSCRIPTIONS_PATH,
} from './constants'
import { HelcimClient } from './client'
import { parseHelcimWebhookEvents, verifyHelcimWebhook } from './webhook'

import { transformCustomer, type RawHelcimCustomer } from './transform/customer'
import { transformCharge, type RawHelcimTransaction } from './transform/charge'
import { transformRefund, type RawHelcimRefundTransaction } from './transform/refund'
import { transformInvoice, type RawHelcimInvoice } from './transform/invoice'
import { transformPaymentMethod, type RawHelcimCard } from './transform/payment-method'
import { transformPlan, type RawHelcimPaymentPlan } from './transform/plan'
import { transformSubscription, type RawHelcimSubscription } from './transform/subscription'
import { toMajorUnits } from './transform/shared'

/** Shared Connect-Link form: a single API token submitted as `apiToken`. */
const CREDENTIAL_FORM = simpleApiKey({
  fieldName: 'apiToken',
  label: 'API token',
  placeholder: 'your-helcim-api-token',
  helpText:
    'Mint a token in Helcim under All Tools → Integrations → API Access Configurations. ' +
    'The token is bound to the account it was created in.',
})

export class HelcimAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'helcim'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  getAuthUrl(): string {
    throw new Error('Helcim uses an API token; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Helcim uses an API token; call exchangeCredentials instead.')
  }

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyHelcimWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseHelcimWebhookEvents(payload)
  }

  private client(credentials: Credentials): HelcimClient {
    return new HelcimClient(credentials)
  }

  /** Helcim list endpoints page with `limit` (1–1000) + `page`. */
  private pageParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = { limit: params.limit ?? DEFAULT_PAGE_SIZE }
    if (typeof params.page === 'number') out.page = params.page
    if (typeof params.search === 'string') out.search = params.search
    return out
  }

  // ── Customers ───────────────────────────────────────────────────────────────
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).get<RawHelcimCustomer[]>(
      CUSTOMERS_PATH,
      this.pageParams(params),
    )
    return (Array.isArray(res) ? res : []).map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawHelcimCustomer>(`${CUSTOMERS_PATH}/${id}`)
    return transformCustomer(res ?? {})
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const res = await this.client(credentials).post<RawHelcimCustomer>(
      CUSTOMERS_PATH,
      buildCustomerBody(data),
    )
    return transformCustomer(res ?? {})
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).put<RawHelcimCustomer>(
      `${CUSTOMERS_PATH}/${id}`,
      buildCustomerBody(data),
    )
    return transformCustomer(res ?? {})
  }

  // ── Charges (Helcim card transactions) ──────────────────────────────────────
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const res = await this.client(credentials).get<RawHelcimTransaction[]>(
      CARD_TRANSACTIONS_PATH,
      this.pageParams(params),
    )
    return (Array.isArray(res) ? res : []).map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawHelcimTransaction>(
      `${CARD_TRANSACTIONS_PATH}/${id}`,
    )
    return transformCharge(res ?? {})
  }

  /** Create a purchase via the Payment API. Amount is converted to dollars. */
  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const body: Record<string, unknown> = {
      amount: toMajorUnits(data.amount),
      currency: data.currency ? data.currency.toUpperCase() : undefined,
    }
    if (data.customerId) body.customerCode = data.customerId
    if (data.invoiceId) body.invoiceNumber = data.invoiceId
    const res = await this.client(credentials).post<RawHelcimTransaction>(
      PAYMENT_PURCHASE_PATH,
      body,
    )
    return transformCharge(res ?? {})
  }

  // ── Refunds (POST /payment/refund) ──────────────────────────────────────────
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const originalTransactionId = data.chargeId
    if (!originalTransactionId) {
      throw new Error('chargeId (Helcim transaction id) is required for a refund')
    }
    const res = await this.client(credentials).post<RawHelcimRefundTransaction>(PAYMENT_REFUND_PATH, {
      originalTransactionId: Number(originalTransactionId),
      amount: toMajorUnits(data.amount),
    })
    return transformRefund(res ?? {}, originalTransactionId)
  }

  // ── Invoices ─────────────────────────────────────────────────────────────────
  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const res = await this.client(credentials).get<RawHelcimInvoice[]>(
      INVOICES_PATH,
      this.pageParams(params),
    )
    return (Array.isArray(res) ? res : []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).get<RawHelcimInvoice>(`${INVOICES_PATH}/${id}`)
    return transformInvoice(res ?? {})
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const body: Record<string, unknown> = {}
    if (data.number) body.invoiceNumber = data.number
    if (data.customerId) body.customerId = data.customerId
    if (data.currency) body.currency = data.currency.toUpperCase()
    if (data.total != null) body.amount = toMajorUnits(data.total)
    const res = await this.client(credentials).post<RawHelcimInvoice>(INVOICES_PATH, body)
    return transformInvoice(res ?? {})
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const body: Record<string, unknown> = {}
    if (data.number) body.invoiceNumber = data.number
    if (data.total != null) body.amount = toMajorUnits(data.total)
    const res = await this.client(credentials).put<RawHelcimInvoice>(
      `${INVOICES_PATH}/${id}`,
      body,
    )
    return transformInvoice(res ?? {})
  }

  // ── Payment methods (customer-scoped stored cards) ───────────────────────────
  async listPaymentMethods(credentials: Credentials, params: QueryParams): Promise<PaymentMethod[]> {
    const customerId = typeof params.customerId === 'string' ? params.customerId : ''
    if (!customerId) return []
    const res = await this.client(credentials).get<RawHelcimCard[]>(
      CUSTOMER_CARDS_PATH(customerId),
    )
    return (Array.isArray(res) ? res : []).map((card) => transformPaymentMethod(card, customerId))
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    // id is expected as "{customerId}:{cardId}" since cards are customer-scoped
    const [customerId, cardId] = id.split(':')
    const path = cardId
      ? `${CUSTOMER_CARDS_PATH(customerId ?? id)}/${cardId}`
      : CUSTOMER_CARDS_PATH(id)
    const res = await this.client(credentials).get<RawHelcimCard>(path)
    return transformPaymentMethod(res ?? {}, customerId)
  }

  // ── Plans (Helcim payment plans) ─────────────────────────────────────────────
  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const res = await this.client(credentials).get<RawHelcimPaymentPlan[]>(
      PAYMENT_PLANS_PATH,
      this.pageParams(params),
    )
    return (Array.isArray(res) ? res : []).map(transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const res = await this.client(credentials).get<RawHelcimPaymentPlan>(
      `${PAYMENT_PLANS_PATH}/${id}`,
    )
    return transformPlan(res ?? {})
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────────
  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const res = await this.client(credentials).get<RawHelcimSubscription[]>(
      SUBSCRIPTIONS_PATH,
      this.pageParams(params),
    )
    return (Array.isArray(res) ? res : []).map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<RawHelcimSubscription>(
      `${SUBSCRIPTIONS_PATH}/${id}`,
    )
    return transformSubscription(res ?? {})
  }
}

/** Map a canonical customer onto Helcim's create/update body. Drops blanks. */
function buildCustomerBody(data: Partial<Customer>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name) out.contactName = data.name
  if (data.email || data.phone) {
    out.billingAddress = {
      ...(data.name ? { name: data.name } : {}),
      ...(data.email ? { email: data.email } : {}),
      ...(data.phone ? { phone: data.phone } : {}),
    }
  }
  if (data.phone) out.cellPhone = data.phone
  return out
}
