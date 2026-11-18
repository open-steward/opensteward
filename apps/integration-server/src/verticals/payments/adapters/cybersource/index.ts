/**
 * Cybersource adapter — payments vertical (Visa-owned enterprise).
 *
 * REST API at api.cybersource.com / apitest.cybersource.com. Authentication
 * uses HTTP Signature — every request signed with HMAC-SHA-256 of
 * canonical headers + body digest. Sandbox is rate-limited; expect slower
 * responses than peer adapters.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — no per-transaction balance ledger; settlement data is only available via the Reporting API as bulk file downloads, not a REST record endpoint
 * Unavailable: payout — POST /pts/v2/payouts is an outbound credit-push (OCT/Visa Direct) with no GET list endpoint; it does not represent merchant settlement payouts
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
import type { Dispute } from '../../schema/dispute'
import type { Invoice } from '../../schema/invoice'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Plan } from '../../schema/plan'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import { buildCredentials } from './auth'
import { CybersourceClient } from './client'
import {
  parseCybersourceWebhookEvents,
  verifyCybersourceWebhook,
} from './webhook'

import { transformCharge, type RawCybersourcePayment } from './transform/charge'
import { transformRefund, type RawCybersourceRefund } from './transform/refund'
import { transformCustomer, type RawCybersourceCustomer } from './transform/customer'
import { transformDispute, type RawCybersourceDispute } from './transform/dispute'
import { transformInvoice, type RawCybersourceInvoice } from './transform/invoice'
import { transformPaymentMethod, type RawCybersourcePaymentInstrument } from './transform/payment-method'
import { transformSubscription, type RawCybersourceSubscription } from './transform/subscription'
import { transformPlan, type RawCybersourcePlan } from './transform/plan'

export class CybersourceAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'cybersource'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Cybersource uses HTTP Signature auth; submit credentials via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Cybersource uses HTTP Signature auth; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'test', label: 'Test (apitest.cybersource.com)' },
          { value: 'live', label: 'Production (api.cybersource.com)' },
        ],
      },
      { name: 'merchantId', label: 'Merchant ID', type: 'text', required: true },
      { name: 'keyId', label: 'Key ID (serial number)', type: 'text', required: true },
      {
        name: 'secretKey',
        label: 'Shared secret key',
        type: 'password',
        required: true,
        helpText: 'Base64-encoded secret from Enterprise Business Center → Key Management.',
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
    return verifyCybersourceWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseCybersourceWebhookEvents(payload)
  }

  private client(credentials: Credentials): CybersourceClient {
    return new CybersourceClient(credentials)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawCybersourcePayment>(`/pts/v2/payments/${id}`)
    return transformCharge(raw)
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    return []
  }

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).get<{ _embedded?: { customers?: RawCybersourceCustomer[] } }>(
      `/tms/v1/customers?limit=${params.limit ?? 20}`,
    )
    return (res._embedded?.customers ?? []).map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawCybersourceCustomer>(`/tms/v1/customers/${id}`)
    return transformCustomer(raw)
  }

  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    const res = await this.client(credentials).get<{ _embedded?: { disputes?: RawCybersourceDispute[] } }>(
      `/dispute/v1/disputes?limit=${params.limit ?? 20}`,
    )
    return (res._embedded?.disputes ?? []).map(transformDispute)
  }

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const raw = await this.client(credentials).get<RawCybersourceDispute>(`/dispute/v1/disputes/${id}`)
    return transformDispute(raw)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (paymentId) required for Cybersource refund')
    const raw = await this.client(credentials).post<RawCybersourceRefund>(
      `/pts/v2/payments/${data.chargeId}/refunds`,
      {
        orderInformation: {
          amountDetails: {
            totalAmount: ((data.amount ?? 0) / 100).toFixed(2),
            currency: (data.currency ?? 'USD').toUpperCase(),
          },
        },
      },
    )
    return transformRefund({ ...raw, paymentId: data.chargeId })
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const res = await this.client(credentials).get<{ invoices?: RawCybersourceInvoice[] }>(
      `/invoicing/v2/invoices?limit=${params.limit ?? 20}&offset=${params.offset ?? 0}`,
    )
    return (res.invoices ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const raw = await this.client(credentials).get<RawCybersourceInvoice>(`/invoicing/v2/invoices/${id}`)
    return transformInvoice(raw)
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const raw = await this.client(credentials).get<RawCybersourcePaymentInstrument>(
      `/tms/v1/paymentinstruments/${id}`,
    )
    return transformPaymentMethod(raw)
  }

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const res = await this.client(credentials).get<{ subscriptions?: RawCybersourceSubscription[] }>(
      `/rbs/v1/subscriptions?limit=${params.limit ?? 20}&offset=${params.offset ?? 0}`,
    )
    return (res.subscriptions ?? []).map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const raw = await this.client(credentials).get<RawCybersourceSubscription>(`/rbs/v1/subscriptions/${id}`)
    return transformSubscription(raw)
  }

  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const res = await this.client(credentials).get<{ plans?: RawCybersourcePlan[] }>(
      `/rbs/v1/plans?limit=${params.limit ?? 20}&offset=${params.offset ?? 0}`,
    )
    return (res.plans ?? []).map(transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const raw = await this.client(credentials).get<RawCybersourcePlan>(`/rbs/v1/plans/${id}`)
    return transformPlan(raw)
  }
}
