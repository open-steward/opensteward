/**
 * Paystack adapter — payments vertical (Africa anchor).
 *
 * Owned by Stripe but operates as an independent product. Strong in
 * Nigeria + Ghana + South Africa + Kenya. Methods: cards, bank transfers,
 * USSD, QR, mobile money. NGN settlement requires a Nigerian business.
 *
 * Auth: Bearer-token (secret key, sk_test_… or sk_live_…).
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: payment-method — No standalone list/get endpoint; card
//              authorizations are embedded in individual customer objects
//              only (GET /customer/:id returns an authorizations array) and
//              there is no API to enumerate them across all customers.

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import { reportUpstreamPage } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'
import type { Plan } from '../../schema/plan'
import type { Subscription } from '../../schema/subscription'
import type { Invoice } from '../../schema/invoice'
import type { Payout } from '../../schema/payout'
import type { Dispute } from '../../schema/dispute'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { PaystackClient } from './client'
import { parsePaystackWebhookEvents, verifyPaystackWebhook } from './webhook'

import { transformCustomer, type RawPaystackCustomer } from './transform/customer'
import { transformCharge, type RawPaystackTransaction } from './transform/charge'
import { transformRefund, type RawPaystackRefund } from './transform/refund'
import { transformPlan, type RawPaystackPlan } from './transform/plan'
import { transformSubscription, type RawPaystackSubscription } from './transform/subscription'
import { transformInvoice, type RawPaystackInvoice } from './transform/invoice'
import { transformPayout, type RawPaystackTransfer } from './transform/payout'
import { transformDispute, type RawPaystackDispute } from './transform/dispute'
import { transformBalanceTransaction } from './transform/balance-transaction'

interface PaystackEnvelope<T> {
  status?: boolean
  message?: string
  data?: T
  /** List responses: meta { total, skipped, perPage, page, pageCount } (PaystackOSS/openapi *ListResponse.yaml). */
  meta?: { total?: number; skipped?: number; perPage?: number; page?: number; pageCount?: number }
}

export class PaystackAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'paystack'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Paystack uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Paystack uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'secretKey',
        label: 'Secret key',
        type: 'password',
        required: true,
        helpText: 'Live keys start sk_live_…; test keys start sk_test_…',
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
    return verifyPaystackWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePaystackWebhookEvents(payload)
  }

  private client(credentials: Credentials): PaystackClient {
    return new PaystackClient(credentials)
  }

  /**
   * One caller page of a Paystack list endpoint. Every list endpoint documents
   * page-number paging, `page` ("The section to retrieve", 1-based) and
   * `perPage`, so one upstream page is one caller page. The end comes from
   * meta.page < meta.pageCount; without meta nothing is reported.
   *
   * When meta.perPage says the server paged at a smaller size than was asked
   * (an undocumented cap, or /transaction and /transfer honouring only the
   * post-2025 `per_page` name), that size is reported as `pageSize` so the
   * router's meta.limit and every short-page judgement use the size actually
   * served. `page` still advances by the server's own size, so no row is
   * lost or repeated either way.
   */
  private async listPaged<Raw, T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    transform: (raw: Raw) => T,
  ): Promise<T[]> {
    const page = Number(params.page ?? 1)
    const perPage = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const res = await this.client(credentials).get<PaystackEnvelope<Raw[]>>(path, {
      page,
      perPage,
    })
    const pageCount = res.meta?.pageCount
    if (typeof pageCount === 'number') {
      const served = Number(res.meta?.perPage)
      reportUpstreamPage(params, {
        hasMore: page < pageCount,
        ...(typeof res.meta?.total === 'number' ? { totalCount: res.meta.total } : {}),
        ...(Number.isInteger(served) && served >= 1 && served < perPage
          ? { pageSize: served }
          : {}),
      })
    }
    return (res.data ?? []).map(transform)
  }

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    return this.listPaged(credentials, '/customer', params, transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<PaystackEnvelope<RawPaystackCustomer>>(
      `/customer/${id}`,
    )
    return transformCustomer(res.data ?? {})
  }

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    return this.listPaged(credentials, '/transaction', params, transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<PaystackEnvelope<RawPaystackTransaction>>(
      `/transaction/${id}`,
    )
    return transformCharge(res.data ?? {})
  }

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    return this.listPaged(credentials, '/refund', params, transformRefund)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId required for Paystack refund')
    const res = await this.client(credentials).post<PaystackEnvelope<RawPaystackRefund>>(
      '/refund',
      { transaction: data.chargeId, amount: data.amount, currency: data.currency },
    )
    return transformRefund(res.data ?? {})
  }

  // ── Plans ────────────────────────────────────────────────────────────────

  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    return this.listPaged(credentials, '/plan', params, transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const res = await this.client(credentials).get<PaystackEnvelope<RawPaystackPlan>>(`/plan/${id}`)
    return transformPlan(res.data ?? {})
  }

  // ── Subscriptions ────────────────────────────────────────────────────────

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    return this.listPaged(credentials, '/subscription', params, transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<PaystackEnvelope<RawPaystackSubscription>>(
      `/subscription/${id}`,
    )
    return transformSubscription(res.data ?? {})
  }

  // ── Invoices (Payment Requests) ─────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    return this.listPaged(credentials, '/paymentrequest', params, transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).get<PaystackEnvelope<RawPaystackInvoice>>(
      `/paymentrequest/${id}`,
    )
    return transformInvoice(res.data ?? {})
  }

  // ── Payouts (Transfers) ──────────────────────────────────────────────────

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    return this.listPaged(credentials, '/transfer', params, transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<PaystackEnvelope<RawPaystackTransfer>>(
      `/transfer/${id}`,
    )
    return transformPayout(res.data ?? {})
  }

  // ── Disputes ─────────────────────────────────────────────────────────────

  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    return this.listPaged(credentials, '/dispute', params, transformDispute)
  }

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const res = await this.client(credentials).get<PaystackEnvelope<RawPaystackDispute>>(
      `/dispute/${id}`,
    )
    return transformDispute(res.data ?? {})
  }

  // ── Balance Transactions (Ledger) ────────────────────────────────────────

  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    return this.listPaged(credentials, '/balance/ledger', params, transformBalanceTransaction)
  }
}
