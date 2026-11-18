/**
 * Gr4vy adapter — payments vertical.
 *
 * Gr4vy is a payment-orchestration platform: merchants route a single canonical
 * transaction to many underlying PSPs. Each merchant runs on a dedicated
 * instance addressed by its `gr4vyId`; the REST host is derived from that id and
 * the environment (sandbox vs production).
 *
 * Canonical mapping:
 *   - Charges          ← Gr4vy transactions  (list, get, capture, cancel/void)
 *   - Refunds          ← Gr4vy refunds        (create against a transaction)
 *   - Customers        ← Gr4vy buyers         (list, get, create, update, delete)
 *   - Payment methods  ← Gr4vy payment-methods (list, get, detach/delete)
 *   - Payouts          ← Gr4vy payouts         (list, get)
 *
 * Auth: ES512 Bearer JWT signed per-request from the merchant's private key.
 *
 * Docs: https://docs.gr4vy.com
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — Gr4vy has no ledger balance-transaction concept; settlement data is a per-transaction sub-resource without net/fee fields
 * Unavailable: dispute — chargebacks are a per-transaction settlement sub-resource (/transactions/{id}/chargebacks) with no status/reason/evidenceDueBy; no top-level disputes endpoint
 * Unavailable: invoice — Gr4vy has no invoice concept; it is a payment-orchestration layer, not a billing platform
 * Unavailable: plan — Gr4vy has no subscription plan/price concept
 * Unavailable: subscription — Gr4vy has no subscription billing concept
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
import type { PaymentMethod } from '../../schema/payment-method'
import type { Refund } from '../../schema/refund'
import type { Payout } from '../../schema/payout'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { credentialFields, exchangeCredentials } from './auth'
import { Gr4vyClient, type Gr4vyList } from './client'
import { parseGr4vyWebhookEvents, verifyGr4vyWebhook } from './webhook'

import { transformCharge, type RawGr4vyTransaction } from './transform/charge'
import {
  transformCustomer,
  untransformCustomer,
  type RawGr4vyBuyer,
} from './transform/customer'
import {
  transformPaymentMethod,
  type RawGr4vyPaymentMethod,
} from './transform/payment-method'
import { transformRefund, type RawGr4vyRefund } from './transform/refund'
import { transformPayout, type RawGr4vyPayout } from './transform/payout'

export class Gr4vyAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'gr4vy'
  readonly version = '0.1.0'

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(): string {
    throw new Error('Gr4vy uses a signed-JWT API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Gr4vy uses a signed-JWT API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // The private key never expires; per-request JWTs are minted on demand.
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyGr4vyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseGr4vyWebhookEvents(payload)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private client(credentials: Credentials): Gr4vyClient {
    return new Gr4vyClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const out: Record<string, unknown> = { limit }
    if (typeof params['cursor'] === 'string') out.cursor = params['cursor']
    return out
  }

  // ── Charges (Gr4vy transactions) ────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const res = await this.client(credentials).get<Gr4vyList<RawGr4vyTransaction>>(
      '/transactions',
      this.listParams(params),
    )
    return (res.items ?? []).map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawGr4vyTransaction>(`/transactions/${id}`)
    return transformCharge(res ?? {})
  }

  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const body: Record<string, unknown> = {}
    if (data?.amount !== undefined) body.amount = data.amount
    const res = await this.client(credentials).post<RawGr4vyTransaction>(
      `/transactions/${id}/capture`,
      body,
    )
    return transformCharge(res ?? {})
  }

  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<RawGr4vyTransaction>(
      `/transactions/${id}/void`,
      {},
    )
    return transformCharge(res ?? {})
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (transaction id) required for Gr4vy refund')
    const body: Record<string, unknown> = {}
    if (data.amount !== undefined) body.amount = data.amount
    if (data.reason !== undefined) body.reason = data.reason
    const res = await this.client(credentials).post<RawGr4vyRefund>(
      `/transactions/${data.chargeId}/refunds`,
      body,
    )
    return transformRefund(res ?? {}, data.chargeId)
  }

  // ── Customers (Gr4vy buyers) ──────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).get<Gr4vyList<RawGr4vyBuyer>>(
      '/buyers',
      this.listParams(params),
    )
    return (res.items ?? []).map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawGr4vyBuyer>(`/buyers/${id}`)
    return transformCustomer(res ?? {})
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const res = await this.client(credentials).post<RawGr4vyBuyer>(
      '/buyers',
      untransformCustomer(data),
    )
    return transformCustomer(res ?? {})
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).put<RawGr4vyBuyer>(
      `/buyers/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(res ?? {})
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/buyers/${id}`)
  }

  // ── Payment methods ───────────────────────────────────────────────────────

  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const res = await this.client(credentials).get<Gr4vyList<RawGr4vyPaymentMethod>>(
      '/payment-methods',
      this.listParams(params),
    )
    return (res.items ?? []).map(transformPaymentMethod)
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const res = await this.client(credentials).get<RawGr4vyPaymentMethod>(
      `/payment-methods/${id}`,
    )
    return transformPaymentMethod(res ?? {})
  }

  async detachPaymentMethod(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/payment-methods/${id}`)
  }

  // ── Payouts ───────────────────────────────────────────────────────────────

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const res = await this.client(credentials).get<Gr4vyList<RawGr4vyPayout>>(
      '/payouts',
      this.listParams(params),
    )
    return (res.items ?? []).map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<RawGr4vyPayout>(`/payouts/${id}`)
    return transformPayout(res ?? {})
  }
}
