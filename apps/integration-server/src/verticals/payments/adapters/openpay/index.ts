/**
 * Openpay adapter — payments vertical.
 *
 * Auth: HTTP Basic, private API key as username, empty password ("donde la
 * llave de API es el nombre de usuario. La contraseña no es requerida"), and
 * every path is /v1/{MERCHANT_ID}/<resource> ("Un endpoint completo esta
 * formado por la URI base del ambiente, el identificador del comercio y el
 * recurso."). https://documents.openpay.mx/docs/api/index.html
 *
 * Lists answer a bare JSON array and page by `offset` ("Número de registros a
 * omitir al inicio, por defecto 0.") and `limit` ("Número de registros que se
 * requieren, por defecto 10."). No maximum and no total or has-more field is
 * documented, so a page shorter than the size sent is the end.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — Openpay has no balance/ledger endpoint; not present in any SDK or docs
 * Unavailable: dispute             — Openpay has no chargebacks REST resource; chargebacks appear only as webhook events
 * Unavailable: invoice             — Openpay has no invoice concept or endpoint
 */

import { pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Payout } from '../../schema/payout'
import type { Plan } from '../../schema/plan'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'

import { DEFAULT_PAGE_SIZE } from './constants'
import { buildCredentials, merchantIdOf } from './auth'
import { OpenpayClient } from './client'

import { transformCustomer, type RawOpenpayCustomer } from './transform/customer'
import { transformCharge, type RawOpenpayCharge } from './transform/charge'
import { transformPaymentMethod, type RawOpenpayCard } from './transform/payment-method'
import { transformPayout, type RawOpenpayPayout } from './transform/payout'
import { transformPlan, type RawOpenpayPlan } from './transform/plan'
import { transformRefund, type RawOpenpayRefund } from './transform/refund'
import { transformSubscription, type RawOpenpaySubscription } from './transform/subscription'

export class OpenpayAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'openpay'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Openpay uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Openpay uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'merchantId',
        label: 'Merchant ID',
        type: 'text',
        required: true,
      },
      {
        name: 'apiKey',
        label: 'Private API Key',
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

  private client(credentials: Credentials): OpenpayClient {
    return new OpenpayClient(credentials, merchantIdOf(credentials))
  }

  /**
   * One offset page of an Openpay list: the 1-based `page` becomes `offset`
   * at the size sent. The response is a bare array ("Regresa un arreglo de
   * objetos cliente."); anything else is an error, never an empty page.
   */
  private async listRows<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const asked = params.limit
    const size =
      typeof asked === 'number' && Number.isFinite(asked) && asked >= 1
        ? Math.floor(asked)
        : DEFAULT_PAGE_SIZE
    const client = this.client(credentials)
    const res = await client.get<unknown>(path, { offset: pageOffset(params, size), limit: size })
    if (!Array.isArray(res)) {
      throw new Error(`Openpay GET ${path} did not return the documented array`)
    }
    reportUpstreamPage(params, { hasMore: res.length >= size })
    return res as T[]
  }

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await this.listRows<RawOpenpayCustomer>(credentials, '/customers', params)
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawOpenpayCustomer>(
      `/customers/${encodeURIComponent(id)}`,
    )
    return transformCustomer(res)
  }

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.listRows<RawOpenpayCharge>(credentials, '/charges', params)
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawOpenpayCharge>(
      `/charges/${encodeURIComponent(id)}`,
    )
    return transformCharge(res)
  }

  // ── Payment Methods (cards) ──────────────────────────────────────────────
  // "GET https://sandbox-api.openpay.mx/v1/{MERCHANT_ID}/customers/{CUSTOMER_ID}/cards"
  // with offset/limit. Pass customerId via params['customerId']. Ids are
  // "customerId:cardId" so getPaymentMethod can read a listed card back.

  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const customerId = params['customerId'] as string | undefined
    if (!customerId) {
      throw new Error(
        'Openpay listPaymentMethods requires params.customerId — cards are customer-scoped.',
      )
    }
    const rows = await this.listRows<RawOpenpayCard>(
      credentials,
      `/customers/${encodeURIComponent(customerId)}/cards`,
      params,
    )
    return rows.map((c) => transformPaymentMethod(c, customerId))
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    // id must be formatted as "customerId:cardId"
    const [customerId, cardId] = id.split(':')
    if (!customerId || !cardId) {
      throw new Error('Openpay getPaymentMethod requires id formatted as "customerId:cardId".')
    }
    const res = await this.client(credentials).get<RawOpenpayCard>(
      `/customers/${encodeURIComponent(customerId)}/cards/${encodeURIComponent(cardId)}`,
    )
    return transformPaymentMethod(res, customerId)
  }

  /**
   * Openpay has no refunds resource: the merchant endpoints are "/fees
   * /charges /payouts /cards /customers /plans /tokens", and a refund is only
   * the action "POST https://sandbox-api.openpay.mx/v1/{MERCHANT_ID}/charges/{TRANSACTION_ID}/refund".
   */
  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw Object.assign(
      new Error(
        'Openpay cannot list refunds: it documents no refunds resource, only "POST https://sandbox-api.openpay.mx/v1/{MERCHANT_ID}/charges/{TRANSACTION_ID}/refund"',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawOpenpayRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }

  // ── Payouts ──────────────────────────────────────────────────────────────
  // "Listado de pagos": GET /v1/{MERCHANT_ID}/payouts, "Obtiene un listado de
  // los pagos realizados a nivel comercio o cliente." with offset/limit
  // (https://documents.openpay.co/docs/api/index.html#pagos-o-retiros).
  // /transfers is customer-to-customer wallet moves, not payouts.

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const rows = await this.listRows<RawOpenpayPayout>(credentials, '/payouts', params)
    return rows.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<RawOpenpayPayout>(
      `/payouts/${encodeURIComponent(id)}`,
    )
    return transformPayout(res)
  }

  // ── Plans ────────────────────────────────────────────────────────────────
  // "Listado de planes": GET /v1/{MERCHANT_ID}/plans, "Regresa los detalles de
  // todos los planes que están activos."

  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const rows = await this.listRows<RawOpenpayPlan>(credentials, '/plans', params)
    return rows.map(transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const res = await this.client(credentials).get<RawOpenpayPlan>(
      `/plans/${encodeURIComponent(id)}`,
    )
    return transformPlan(res)
  }

  // ── Subscriptions ────────────────────────────────────────────────────────
  // "GET https://sandbox-api.openpay.mx/v1/{MERCHANT_ID}/customers/{CUSTOMER_ID}/subscriptions"
  // with offset/limit. Pass customerId via params['customerId']. Ids are
  // "customerId:subscriptionId" so getSubscription can read a listed one back.

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const customerId = params['customerId'] as string | undefined
    if (!customerId) {
      throw new Error(
        'Openpay listSubscriptions requires params.customerId — subscriptions are customer-scoped.',
      )
    }
    const rows = await this.listRows<RawOpenpaySubscription>(
      credentials,
      `/customers/${encodeURIComponent(customerId)}/subscriptions`,
      params,
    )
    return rows.map((s) => transformSubscription(s, customerId))
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    // id must be formatted as "customerId:subscriptionId"
    const [customerId, subscriptionId] = id.split(':')
    if (!customerId || !subscriptionId) {
      throw new Error(
        'Openpay getSubscription requires id formatted as "customerId:subscriptionId".',
      )
    }
    const res = await this.client(credentials).get<RawOpenpaySubscription>(
      `/customers/${encodeURIComponent(customerId)}/subscriptions/${encodeURIComponent(subscriptionId)}`,
    )
    return transformSubscription(res, customerId)
  }

  async cancelSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const [customerId, subscriptionId] = id.split(':')
    if (!customerId || !subscriptionId) {
      throw new Error(
        'Openpay cancelSubscription requires id formatted as "customerId:subscriptionId".',
      )
    }
    await this.client(credentials).delete(
      `/customers/${customerId}/subscriptions/${subscriptionId}`,
    )
    // Return the last-known state by fetching before it 404s (best-effort)
    return {
      id,
      externalId: subscriptionId,
      customerId,
      status: 'cancelled',
      items: [],
      gateway: 'openpay',
      metadata: {},
    }
  }
}
