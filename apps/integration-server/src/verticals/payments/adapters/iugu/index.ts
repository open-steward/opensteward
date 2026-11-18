/**
 * Iugu adapter — payments vertical.
 *
 * Auth: HTTP Basic, the API token as the username and an empty password
 * (https://dev.iugu.com/reference/autentica%C3%A7%C3%A3o).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — Iugu has no per-transaction ledger
 *   endpoint; only account-level financial statements (GET /v1/accounts/financial)
 *   which do not map to the canonical BalanceTransaction schema.
 */

import { pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'
import type { Invoice } from '../../schema/invoice'
import type { Subscription } from '../../schema/subscription'
import type { Plan } from '../../schema/plan'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Dispute } from '../../schema/dispute'
import type { Payout } from '../../schema/payout'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { IuguClient } from './client'
import { verifyIuguWebhook, parseIuguWebhookEvents } from './webhook'

import { transformCustomer, type RawIuguCustomer } from './transform/customer'
import { transformRefund, type RawIuguRefund } from './transform/refund'
import { transformInvoice, type RawIuguInvoice } from './transform/invoice'
import { transformSubscription, type RawIuguSubscription } from './transform/subscription'
import { transformPlan, type RawIuguPlan } from './transform/plan'
import { transformPaymentMethod, type RawIuguPaymentMethod } from './transform/payment-method'
import { transformDispute, type RawIuguChargeback } from './transform/dispute'
import { transformPayout, type RawIuguWithdrawRequest } from './transform/payout'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class IuguAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'iugu'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Iugu uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Iugu uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API Key',
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
    return verifyIuguWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseIuguWebhookEvents(payload)
  }

  private client(credentials: Credentials): IuguClient {
    return new IuguClient(credentials)
  }

  /**
   * One offset page of an Iugu listing: `start` + `limit`
   * (https://dev.iugu.com/reference/pagina%C3%A7%C3%A3o). The 1-based `page`
   * becomes `start` at the size actually sent, after clamping to 1..100
   * ("Limita o número de registros retornados em até 100"). The end is a
   * short page: "Para detectar o fim da listagem, compare items.length com
   * limit : se for menor, não há mais páginas." (listar-cliente).
   * `totalItems` is not reported as a total: on /customers and /subscriptions
   * it is the page's own size since 2026-06-11, and /plans and /chargebacks
   * omit it.
   *
   * /customers and /subscriptions answer 400 for `start > 100` without a
   * filter; that error propagates rather than reading as an empty page.
   */
  private async listRows<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    // NaN means no usable limit (the default); Infinity means "as many as
    // allowed", which the clamp below turns into MAX_PAGE_SIZE.
    const raw = params.limit ?? DEFAULT_PAGE_SIZE
    const asked = Number.isNaN(raw) ? DEFAULT_PAGE_SIZE : raw
    const size = Math.min(Math.max(Math.floor(asked), 1), MAX_PAGE_SIZE)
    const res = await this.client(credentials).get<{ items?: T[] }>(path, {
      limit: size,
      start: pageOffset(params, size),
    })
    const rows = res.items ?? []
    reportUpstreamPage(params, { hasMore: rows.length >= size, pageSize: size })
    return rows
  }

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    // Documented response: { items, totalItems }.
    const rows = await this.listRows<RawIuguCustomer>(credentials, '/customers', params)
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ data?: RawIuguCustomer }>(`/customers/${id}`)
    return transformCustomer(res.data ?? {})
  }

  // ── Charges ───────────────────────────────────────────────────────────────
  // iugu documents no charge resource that can be read back: the only charge
  // operations are POST /v1/charge ("Cobrança simples via boleto ou cartão de
  // crédito.", https://dev.iugu.com/reference/cobranca-direta) and POST
  // /v1/charge_two_credit_cards. GET /v1/credit_card_transactions
  // (https://dev.iugu.com/reference/transa%C3%A7%C3%B5es) lists card
  // transactions only, and its documented rows carry no amount or currency,
  // both required on a canonical Charge. Payments are read as invoices.

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    throw notSupported(
      'Iugu cannot list charges: its API documents only "POST /v1/charge" (Cobrança Direta) and no GET for charges; read payments through invoices.',
    )
  }

  async getCharge(_credentials: Credentials, _id: string): Promise<Charge> {
    throw notSupported(
      'Iugu cannot read a charge: its API documents only "POST /v1/charge" (Cobrança Direta) and no GET for charges; read payments through invoices.',
    )
  }

  // ── Refunds ───────────────────────────────────────────────────────────────
  // The only refund operations are actions on their parent: POST
  // /v1/invoices/{id}/refund ("Efetua o reembolso de uma Fatura.",
  // https://dev.iugu.com/reference/reembolsar-fatura) and PUT
  // /v1/deposits/{id}/refund. There is no refund record to list.

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported(
      'Iugu cannot list refunds: a refund is an action on an invoice ("Efetua o reembolso de uma Fatura.", POST /v1/invoices/{id}/refund) and the API has no refund list.',
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawIuguRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }

  // ── Invoices ──────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const rows = await this.listRows<RawIuguInvoice>(credentials, '/invoices', params)
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const raw = await this.client(credentials).get<RawIuguInvoice>(`/invoices/${id}`)
    return transformInvoice(raw)
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const rows = await this.listRows<RawIuguSubscription>(credentials, '/subscriptions', params)
    return rows.map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const raw = await this.client(credentials).get<RawIuguSubscription>(`/subscriptions/${id}`)
    return transformSubscription(raw)
  }

  async cancelSubscription(
    credentials: Credentials,
    id: string,
    _data?: { atPeriodEnd?: boolean },
  ): Promise<Subscription> {
    const raw = await this.client(credentials).delete<RawIuguSubscription>(`/subscriptions/${id}`)
    return transformSubscription(raw)
  }

  // ── Plans ─────────────────────────────────────────────────────────────────

  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const rows = await this.listRows<RawIuguPlan>(credentials, '/plans', params)
    return rows.map(transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const raw = await this.client(credentials).get<RawIuguPlan>(`/plans/${id}`)
    return transformPlan(raw)
  }

  // ── Payment Methods ───────────────────────────────────────────────────────

  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    // Iugu payment methods are scoped to a customer; if customerId provided use it.
    const customerId = (params as Record<string, unknown>)['customerId'] as string | undefined
    if (!customerId) return []
    const res = await this.client(credentials).get<{ items?: RawIuguPaymentMethod[] }>(
      `/customers/${customerId}/payment_methods`,
      { limit: params.limit ?? DEFAULT_PAGE_SIZE },
    )
    return (res.items ?? []).map((pm) => transformPaymentMethod({ ...pm, customer_id: customerId }))
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    // id is expected in the form `${customerId}:${paymentMethodId}`
    const sep = id.indexOf(':')
    const [customerId, pmId] = sep >= 0 ? [id.slice(0, sep), id.slice(sep + 1)] : ['', id]
    const raw = await this.client(credentials).get<RawIuguPaymentMethod>(
      `/customers/${customerId}/payment_methods/${pmId}`,
    )
    return transformPaymentMethod({ ...raw, customer_id: customerId })
  }

  // ── Disputes (chargebacks) ─────────────────────────────────────────────────

  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    // Documented response: { facets, items }.
    const rows = await this.listRows<RawIuguChargeback>(credentials, '/chargebacks', params)
    return rows.map(transformDispute)
  }

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const raw = await this.client(credentials).get<RawIuguChargeback>(`/chargebacks/${id}`)
    return transformDispute(raw)
  }

  // ── Payouts (saques) ────────────────────────────────────────────────────────
  // A payout is a withdrawal to the account's own bank domicile: GET
  // /v1/withdraw_requests, "Retorna a lista de todas as transferências
  // bancárias." (https://dev.iugu.com/reference/listar-transferencia-bancaria),
  // documented response { items, totalItems }. GET /v1/transfers is
  // iugu-to-iugu transfers ({ sent, received }), not payouts. The endpoint's
  // own page names no paging parameters, so paging rests on the site-wide
  // start/limit ("Em nossas APIs de listagem, usamos dois parâmetros...").

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const rows = await this.listRows<RawIuguWithdrawRequest>(
      credentials,
      '/withdraw_requests',
      params,
    )
    return rows.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    // https://dev.iugu.com/reference/buscar-transferencia-bancaria: the bare object.
    const raw = await this.client(credentials).get<RawIuguWithdrawRequest>(
      `/withdraw_requests/${encodeURIComponent(id)}`,
    )
    return transformPayout(raw)
  }
}
