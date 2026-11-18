/**
 * Yapstone adapter — payments vertical.
 *
 * Auth: API key (Bearer token).
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unverified: balance-transaction — Yapstone developer portal returns 403 and Apiary docs are JS-rendered; endpoint path and response shape could not be confirmed.
// Unverified: dispute            — Yapstone advertises chargeback management but official API docs are inaccessible (403/JS-rendered); endpoint path and response shape could not be confirmed.
// Unverified: invoice            — No invoice endpoint found in accessible docs; platform focuses on marketplace payments, not invoice-based billing.
// Unverified: payment-method     — Yapstone uses a hosted-elements iframe flow; no stored payment-method list/get endpoint confirmed in accessible docs.
// Unverified: payout             — Yapstone advertises ACH payout API but official API docs are inaccessible (403/JS-rendered); endpoint path and response shape could not be confirmed.
// Unverified: plan               — No plan/recurring-billing endpoint found in accessible docs; platform focuses on marketplace payments, not subscription plan management.
// Unverified: subscription       — No subscription endpoint found in accessible docs; platform focuses on one-time and split marketplace payments for property rentals.

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


import { DEFAULT_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { YapstoneClient } from './client'


import { transformCustomer, type RawYapstoneCustomer } from './transform/customer'
import { transformCharge, type RawYapstonePayment } from './transform/charge'
import { transformRefund, type RawYapstoneRefund } from './transform/refund'

export class YapstoneAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'yapstone'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Yapstone uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Yapstone uses an API key; call exchangeCredentials instead.')
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

  private client(credentials: Credentials): YapstoneClient {
    return new YapstoneClient(credentials)
  }

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).get<{ data?: RawYapstoneCustomer[] }>('/customers', {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    })
    return (res.data ?? []).map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ data?: RawYapstoneCustomer }>(`/customers/${id}`)
    return transformCustomer(res.data ?? {})
  }

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const res = await this.client(credentials).get<{ data?: RawYapstonePayment[] }>('/charges', {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    })
    return (res.data ?? []).map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<{ data?: RawYapstonePayment }>(`/charges/${id}`)
    return transformCharge(res.data ?? {})
  }

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const res = await this.client(credentials).get<{ data?: RawYapstoneRefund[] }>('/refunds', {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    })
    return (res.data ?? []).map(transformRefund)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawYapstoneRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }
}
