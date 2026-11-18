/**
 * Dodo Payments adapter — payments vertical.
 *
 * Dodo Payments is a Merchant-of-Record (MoR) platform for digital products
 * and SaaS: it handles checkout, global tax, and subscription billing. The
 * REST API is split across two isolated environments (test / live), each
 * with its own Bearer API key.
 *
 * Supported canonical resources (everything else auto-501s via the router):
 *   - Customers     : list / get / create / update
 *   - Charges       : list / get          (Dodo "payments")
 *   - Refunds       : list / get / create
 *   - Subscriptions : list / get
 *   - Products      : list / get
 *   - Disputes      : list / get
 *   - Payouts       : list
 *   - PaymentMethods: list (per-customer; requires params.customerId)
 *   - BalanceTxns   : list  (GET /balances/ledger)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: invoice — GET /invoices/payments/{id} returns a PDF binary only; no structured JSON invoice object exists
 * Unavailable: plan    — Dodo has no separate Plan/Price catalog; pricing is embedded in Product objects (covered by listProducts/getProduct)
 *
 * Auth: static API key (Bearer). Webhooks: Standard Webhooks (HMAC-SHA256).
 *
 * Docs: https://docs.dodopayments.com/api-reference/introduction
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
import type { Dispute } from '../../schema/dispute'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { Product } from '../../schema/plan'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { DodoPaymentsClient } from './client'
import {
  parseDodoPaymentsWebhookEvents,
  verifyDodoPaymentsWebhook,
} from './webhook'

import { transformCharge, type RawDodoPayment } from './transform/charge'
import {
  transformCustomer,
  untransformCustomer,
  type RawDodoCustomer,
} from './transform/customer'
import { transformRefund, type RawDodoRefund } from './transform/refund'
import {
  transformSubscription,
  type RawDodoSubscription,
} from './transform/subscription'
import { transformProduct, type RawDodoProduct } from './transform/product'
import { transformDispute, type RawDodoDispute } from './transform/dispute'
import { transformPayout, type RawDodoPayout } from './transform/payout'
import {
  transformPaymentMethod,
  type RawDodoPaymentMethod,
} from './transform/payment-method'
import {
  transformBalanceTransaction,
  type RawDodoLedgerEntry,
} from './transform/balance-transaction'

export class DodoPaymentsAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'dodo-payments'
  readonly version = '0.1.0'

  // ── Auth ────────────────────────────────────────────────────────────────

  getAuthUrl(): string {
    throw new Error('Dodo Payments uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Dodo Payments uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API key',
        type: 'password',
        required: true,
        helpText: 'Dashboard → Developer → API Keys. Test and live keys are environment-scoped.',
      },
      {
        name: 'mode',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'live', label: 'Live (production)' },
          { value: 'test', label: 'Test (sandbox)' },
        ],
        helpText: 'Must match the environment the API key was issued in.',
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
    return verifyDodoPaymentsWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseDodoPaymentsWebhookEvents(payload)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private client(credentials: Credentials): DodoPaymentsClient {
    return new DodoPaymentsClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (typeof params.page === 'number') out.page_number = params.page
    if (params.updatedAfter instanceof Date) {
      out.created_at_gte = params.updatedAfter.toISOString()
    } else if (typeof params['created_at_gte'] === 'string') {
      out.created_at_gte = params['created_at_gte']
    }
    return out
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).list<RawDodoCustomer>('/customers', this.listParams(params))
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawDodoCustomer>(`/customers/${id}`)
    return transformCustomer(raw)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const raw = await this.client(credentials).post<RawDodoCustomer>('/customers', untransformCustomer(data))
    return transformCustomer(raw)
  }

  async updateCustomer(credentials: Credentials, id: string, data: Partial<Customer>): Promise<Customer> {
    const raw = await this.client(credentials).patch<RawDodoCustomer>(
      `/customers/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  // ── Charges (Dodo "payments") ─────────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const res = await this.client(credentials).list<RawDodoPayment>('/payments', this.listParams(params))
    return res.items.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawDodoPayment>(`/payments/${id}`)
    return transformCharge(raw)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const res = await this.client(credentials).list<RawDodoRefund>('/refunds', this.listParams(params))
    return res.items.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const raw = await this.client(credentials).get<RawDodoRefund>(`/refunds/${id}`)
    return transformRefund(raw)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (Dodo payment_id) is required to create a refund.')
    const body: Record<string, unknown> = { payment_id: data.chargeId }
    // Dodo refunds the full payment unless `amount` is supplied. Item-level
    // partial refunds require a valid `item_id` (product_id / addon_id) which
    // is not available in the canonical Refund schema, so we pass amount at
    // the top level — the API uses it for a partial refund of that amount.
    if (typeof data.amount === 'number' && data.amount > 0) {
      body.amount = data.amount
    }
    if (data.metadata !== undefined) body.metadata = data.metadata
    const raw = await this.client(credentials).post<RawDodoRefund>('/refunds', body)
    return transformRefund(raw)
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const res = await this.client(credentials).list<RawDodoSubscription>(
      '/subscriptions',
      this.listParams(params),
    )
    return res.items.map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const raw = await this.client(credentials).get<RawDodoSubscription>(`/subscriptions/${id}`)
    return transformSubscription(raw)
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).list<RawDodoProduct>('/products', this.listParams(params))
    return res.items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawDodoProduct>(`/products/${id}`)
    return transformProduct(raw)
  }

  // ── Disputes ──────────────────────────────────────────────────────────────

  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    const res = await this.client(credentials).list<RawDodoDispute>(
      '/disputes',
      this.listParams(params),
    )
    return res.items.map(transformDispute)
  }

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const raw = await this.client(credentials).get<RawDodoDispute>(`/disputes/${id}`)
    return transformDispute(raw)
  }

  // ── Payouts ───────────────────────────────────────────────────────────────

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const res = await this.client(credentials).list<RawDodoPayout>(
      '/payouts',
      this.listParams(params),
    )
    return res.items.map(transformPayout)
  }

  // ── Payment methods (per-customer) ────────────────────────────────────────

  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const customerId = params['customerId'] as string | undefined
    if (!customerId) return []
    const res = await this.client(credentials).list<RawDodoPaymentMethod>(
      `/customers/${customerId}/payment-methods`,
    )
    return res.items.map((r) => transformPaymentMethod(r, customerId))
  }

  // ── Balance transactions (ledger) ─────────────────────────────────────────

  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    const res = await this.client(credentials).list<RawDodoLedgerEntry>(
      '/balances/ledger',
      this.listParams(params),
    )
    return res.items.map(transformBalanceTransaction)
  }
}
