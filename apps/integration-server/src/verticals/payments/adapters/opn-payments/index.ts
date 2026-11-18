/**
 * Opn Payments adapter — payments vertical.
 *
 * Auth: API key (Bearer token).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: invoice — Opn Payments has no invoice API; billing is handled via scheduled charges on the Schedule API
 * Unavailable: plan    — No standalone plan/price/product objects; schedule charge sub-objects are not addressable as plans
 */

import { pageOffset, reportUpstreamPage } from '@opensteward/shared'
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
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { OpnPaymentsClient } from './client'
import { verifyOpnPaymentsWebhook, parseOpnPaymentsWebhookEvents } from './webhook'

import { transformBalanceTransaction, type RawOpnTransaction } from './transform/balance-transaction'
import { transformCustomer, type RawOpnCustomer } from './transform/customer'
import { transformCharge, type RawOpnCharge } from './transform/charge'
import { transformDispute, type RawOpnDispute } from './transform/dispute'
import { transformRefund, type RawOpnRefund } from './transform/refund'
import { transformPaymentMethod, type RawOpnCard } from './transform/payment-method'
import { transformPayout, type RawOpnTransfer } from './transform/payout'
import { transformSubscription, type RawOpnSubscription } from './transform/subscription'

/** An Omise list object: https://docs.omise.co/api-pagination. */
interface OpnList<T> {
  data?: T[]
  offset?: number
  limit?: number
  total?: number
}

export class OpnPaymentsAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'opn-payments'
  readonly version = '0.1.0'
  /** "(optional, default: 20, maximum: 100)" (docs.omise.co/api-pagination). Every list method pages at it. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('Opn Payments uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Opn Payments uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'Secret Key (sk_...)',
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
    return verifyOpnPaymentsWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseOpnPaymentsWebhookEvents(payload)
  }

  private client(credentials: Credentials): OpnPaymentsClient {
    return new OpnPaymentsClient(credentials)
  }

  /**
   * Get one offset page of an Omise list and report its end to the caller.
   *
   * Every list API pages by `offset` + `limit` (https://docs.omise.co/api-pagination,
   * "The same applies to all list APIs (cards, transactions)."). `offset` is "Offset of
   * the first record returned (i.e. how many records to skip from the beginning)." The
   * 1-based `page` becomes an offset at the size actually sent, after the clamp to 100.
   * The list object carries `total`, so more rows exist while offset + rows < total.
   */
  private async listRows<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    const size = Math.min(
      Math.max(Math.floor(Number.isFinite(asked) ? asked : 1), 1),
      MAX_PAGE_SIZE,
    )
    const offset = pageOffset(params, size)
    const res = await this.client(credentials).get<OpnList<T>>(path, { limit: size, offset })
    const rows = res.data ?? []
    if (typeof res.total === 'number') {
      const start = typeof res.offset === 'number' ? res.offset : offset
      reportUpstreamPage(params, {
        hasMore: start + rows.length < res.total,
        totalCount: res.total,
        pageSize: size,
      })
    } else {
      reportUpstreamPage(params, { pageSize: size })
    }
    return rows
  }

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await this.listRows<RawOpnCustomer>(credentials, '/customers', params)
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ data?: RawOpnCustomer }>(`/customers/${id}`)
    return transformCustomer(res.data ?? {})
  }

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.listRows<RawOpnCharge>(credentials, '/charges', params)
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<{ data?: RawOpnCharge }>(`/charges/${id}`)
    return transformCharge(res.data ?? {})
  }

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const rows = await this.listRows<RawOpnRefund>(credentials, '/refunds', params)
    return rows.map(transformRefund)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawOpnRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }

  async listPaymentMethods(credentials: Credentials, params: QueryParams): Promise<PaymentMethod[]> {
    const customerId = (params['customerId'] ?? params['customer_id']) as string | undefined
    if (!customerId) return []
    const rows = await this.listRows<RawOpnCard>(
      credentials,
      `/customers/${customerId}/cards`,
      params,
    )
    return rows.map((c) => transformPaymentMethod(c, customerId))
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    // id format: `{customerId}:{cardId}`
    const [customerId, cardId] = id.includes(':') ? id.split(':') : [undefined, id]
    if (!customerId) throw new Error('Opn Payments getPaymentMethod requires composite id `customerId:cardId`')
    const res = await this.client(credentials).get<RawOpnCard>(
      `/customers/${customerId}/cards/${cardId}`,
    )
    return transformPaymentMethod(res, customerId)
  }

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const rows = await this.listRows<RawOpnSubscription>(credentials, '/schedules', params)
    return rows.map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<RawOpnSubscription>(`/schedules/${id}`)
    return transformSubscription(res)
  }

  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    const rows = await this.listRows<RawOpnDispute>(credentials, '/disputes', params)
    return rows.map(transformDispute)
  }

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const res = await this.client(credentials).get<RawOpnDispute>(`/disputes/${id}`)
    return transformDispute(res)
  }

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const rows = await this.listRows<RawOpnTransfer>(credentials, '/transfers', params)
    return rows.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<RawOpnTransfer>(`/transfers/${id}`)
    return transformPayout(res)
  }

  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    const rows = await this.listRows<RawOpnTransaction>(credentials, '/transactions', params)
    return rows.map(transformBalanceTransaction)
  }

  async getBalanceTransaction(credentials: Credentials, id: string): Promise<BalanceTransaction> {
    const res = await this.client(credentials).get<RawOpnTransaction>(`/transactions/${id}`)
    return transformBalanceTransaction(res)
  }
}
