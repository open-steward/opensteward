/**
 * Pagar.me adapter — payments vertical (LatAm anchor, Brazil-first).
 *
 * Pagar.me v5 is order-centric but exposes **charges** as a first-class,
 * listable resource, so the canonical **Charge** is backed directly by
 * `/charges`. **Customers** are a first-class resource (`/customers`).
 * A refund is performed by **cancelling a charge** (`DELETE /charges/{id}`,
 * optional partial `amount`); there is no standalone refund resource, so the
 * adapter implements `createRefund` + `cancelCharge` but not refund
 * list/get.
 *
 * Auth: a single secret API key sent via HTTP Basic Authentication (key as
 * username, empty password). The key prefix selects the environment —
 * `sk_test_…` for sandbox, `sk_…` for production — so there is no host/mode
 * flag. No OAuth, no refresh.
 *
 * Webhooks: Pagar.me v5 secures webhook deliveries with HTTP Basic Auth on the
 * **receiving** endpoint (a user/password the merchant configures per webhook)
 * rather than a payload HMAC signature, so there is nothing to verify on the
 * body — `verifyWebhook`/`parseWebhookEvents` are deliberately left
 * unimplemented (auto-501).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: dispute — Pagar.me v5 has no dedicated dispute/chargeback list
 *   endpoint; the "chargedback" state is a status value on the Charge object
 *   and is delivered via webhooks only. There is no GET /disputes endpoint.
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Invoice } from '../../schema/invoice'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Payout } from '../../schema/payout'
import type { Plan } from '../../schema/plan'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'

import {
  DEFAULT_PAGE_SIZE,
  CHARGES_PATH,
  CUSTOMERS_PATH,
  SUBSCRIPTIONS_PATH,
  INVOICES_PATH,
  PLANS_PATH,
  PAYABLES_PATH,
  BALANCE_OPERATIONS_PATH,
  chargePath,
  customerCardsPath,
} from './constants'
import { buildCredentials } from './auth'
import { PagarmeClient, type PagarmeListResponse } from './client'

import { transformCustomer, type RawPagarmeCustomer } from './transform/customer'
import { transformCharge, type RawPagarmeCharge } from './transform/charge'
import { transformRefund } from './transform/refund'
import {
  transformSubscription,
  type RawPagarmeSubscription,
} from './transform/subscription'
import { transformInvoice, type RawPagarmeInvoice } from './transform/invoice'
import { transformPlan, type RawPagarmePlan } from './transform/plan'
import {
  transformPaymentMethod,
  type RawPagarmeCard,
} from './transform/payment-method'
import {
  transformBalanceTransaction,
  type RawPagarmeBalanceOperation,
} from './transform/balance-transaction'
import { transformPayout, type RawPagarmePayable } from './transform/payout'

export class PagarmeAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'pagarme'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Pagar.me uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Pagar.me uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'secretKey',
        label: 'Secret key',
        type: 'password',
        required: true,
        placeholder: 'sk_…',
        helpText:
          'Your Pagar.me secret key (Dashboard → Settings → Keys). Test keys start sk_test_…; live keys start sk_…. The key itself selects sandbox vs production.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): PagarmeClient {
    return new PagarmeClient(credentials)
  }

  /** Pagar.me lists are page-based: `page` (1-indexed) + `size`. */
  private pageParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = { size: params.limit ?? DEFAULT_PAGE_SIZE }
    if (typeof params.page === 'number') out.page = params.page
    return out
  }

  // ── Charges ──────────────────────────────────────────────────────────────
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const res = await this.client(credentials).get<PagarmeListResponse<RawPagarmeCharge>>(
      CHARGES_PATH,
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawPagarmeCharge>(chargePath(id))
    return transformCharge(res ?? {})
  }

  /** Cancel a charge — `DELETE /charges/{id}`, optionally a partial `amount`. */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).delete<RawPagarmeCharge>(chargePath(id))
    return transformCharge(res ?? {})
  }

  // ── Refunds (DELETE /charges/{id}) ───────────────────────────────────────
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const chargeId = data.chargeId
    if (!chargeId) throw new Error('chargeId (Pagar.me charge id) is required for a refund')
    // A partial refund is requested by sending the `amount` (centavos) in the
    // cancel body; a full refund omits it.
    const body = data.amount !== undefined ? { amount: data.amount } : undefined
    const res = await this.client(credentials).delete<RawPagarmeCharge>(
      chargePath(chargeId),
      body,
    )
    return transformRefund(res ?? {}, data.amount)
  }

  // ── Customers ────────────────────────────────────────────────────────────
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).get<PagarmeListResponse<RawPagarmeCustomer>>(
      CUSTOMERS_PATH,
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawPagarmeCustomer>(`${CUSTOMERS_PATH}/${id}`)
    return transformCustomer(res ?? {})
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const res = await this.client(credentials).post<RawPagarmeCustomer>(CUSTOMERS_PATH, {
      name: data.name,
      email: data.email,
      code: data.externalId,
      metadata: data.metadata,
    })
    return transformCustomer(res ?? {})
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).patch<RawPagarmeCustomer>(
      `${CUSTOMERS_PATH}/${id}`,
      {
        name: data.name,
        email: data.email,
        metadata: data.metadata,
      },
    )
    return transformCustomer(res ?? {})
  }

  // ── Subscriptions ────────────────────────────────────────────────────────
  async listSubscriptions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Subscription[]> {
    const res = await this.client(credentials).get<PagarmeListResponse<RawPagarmeSubscription>>(
      SUBSCRIPTIONS_PATH,
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<RawPagarmeSubscription>(
      `${SUBSCRIPTIONS_PATH}/${id}`,
    )
    return transformSubscription(res ?? {})
  }

  async cancelSubscription(
    credentials: Credentials,
    id: string,
  ): Promise<Subscription> {
    const res = await this.client(credentials).delete<RawPagarmeSubscription>(
      `${SUBSCRIPTIONS_PATH}/${id}`,
    )
    return transformSubscription(res ?? {})
  }

  // ── Invoices ─────────────────────────────────────────────────────────────
  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const res = await this.client(credentials).get<PagarmeListResponse<RawPagarmeInvoice>>(
      INVOICES_PATH,
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).get<RawPagarmeInvoice>(
      `${INVOICES_PATH}/${id}`,
    )
    return transformInvoice(res ?? {})
  }

  // ── Plans ─────────────────────────────────────────────────────────────────
  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const res = await this.client(credentials).get<PagarmeListResponse<RawPagarmePlan>>(
      PLANS_PATH,
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const res = await this.client(credentials).get<RawPagarmePlan>(`${PLANS_PATH}/${id}`)
    return transformPlan(res ?? {})
  }

  // ── Payment Methods (cards) ───────────────────────────────────────────────
  /**
   * Pagar.me cards are scoped to a customer: GET /customers/{id}/cards.
   * Pass `customerId` in `params` to scope the list to a specific customer.
   * Returns an empty array when no `customerId` is provided.
   */
  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const customerId = (params as Record<string, unknown>)['customerId'] as string | undefined
    if (!customerId) return []
    const res = await this.client(credentials).get<PagarmeListResponse<RawPagarmeCard>>(
      customerCardsPath(customerId),
      this.pageParams(params),
    )
    return (res.data ?? []).map((card) => transformPaymentMethod(card, customerId))
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    // Pagar.me has no global card lookup; id is expected as "customerId:cardId"
    const [customerId, cardId] = id.split(':')
    const res = await this.client(credentials).get<RawPagarmeCard>(
      `${CUSTOMERS_PATH}/${customerId}/cards/${cardId}`,
    )
    return transformPaymentMethod(res ?? {}, customerId)
  }

  // ── Balance Transactions ──────────────────────────────────────────────────
  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    const res = await this.client(credentials).get<PagarmeListResponse<RawPagarmeBalanceOperation>>(
      BALANCE_OPERATIONS_PATH,
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformBalanceTransaction)
  }

  async getBalanceTransaction(
    credentials: Credentials,
    id: string,
  ): Promise<BalanceTransaction> {
    const res = await this.client(credentials).get<RawPagarmeBalanceOperation>(
      `${BALANCE_OPERATIONS_PATH}/${id}`,
    )
    return transformBalanceTransaction(res ?? {})
  }

  // ── Payouts (payables) ───────────────────────────────────────────────────
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const res = await this.client(credentials).get<PagarmeListResponse<RawPagarmePayable>>(
      PAYABLES_PATH,
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<RawPagarmePayable>(`${PAYABLES_PATH}/${id}`)
    return transformPayout(res ?? {})
  }
}
