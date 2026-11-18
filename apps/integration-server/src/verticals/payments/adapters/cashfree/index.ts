/**
 * Cashfree Payment Gateway (PG) adapter — payments vertical (India anchor).
 *
 * Cashfree models money as Orders, each with zero or more Payment attempts
 * and Refunds. There is no global "list all payments" endpoint and no
 * standalone Customers API — customers are embedded inside orders — so this
 * adapter implements charges (orders + payments) and refunds. Charge / refund
 * sub-collections are order-scoped, so the order id must be supplied:
 *   - `getCharge(id)`             → id is the `order_id`.
 *   - `listCharges({ orderId })`  → payments for that order.
 *   - `getRefund(id)`             → id is `"<order_id>:<refund_id>"`.
 *   - `listRefunds({ orderId })`  → refunds for that order.
 *   - `createRefund({ chargeId })`→ chargeId is the `order_id`.
 *
 * Auth: static `x-client-id` + `x-client-secret` + dated `x-api-version`
 * headers on every request (no OAuth, no token refresh).
 *
 * Money: Cashfree quotes MAJOR units (rupees); the canonical schema is
 * integer minor units (paise) — transforms scale by 100.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — Cashfree has no balance-transaction ledger
 *   resource; settlement reconciliation (POST /settlement/recon) returns
 *   aggregate settlement batches, not per-event ledger entries.
 * Unavailable: invoice — Cashfree PG has no invoice resource; billing is
 *   order-based rather than invoice-based.
 * Unavailable: payout — Cashfree Payouts is a separate product
 *   (payout-api.cashfree.com) with its own auth; not part of this PG adapter.
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
import type { PaymentMethod } from '../../schema/payment-method'
import type { Plan } from '../../schema/plan'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import { buildCredentials } from './auth'
import { CashfreeClient } from './client'
import { parseCashfreeWebhookEvents, verifyCashfreeWebhook } from './webhook'

import { transformCharge, type RawCashfreeCharge } from './transform/charge'
import { transformCustomer, type RawCashfreeCustomer } from './transform/customer'
import { transformDispute, type RawCashfreeDispute } from './transform/dispute'
import { transformPaymentMethod, type RawCashfreeInstrument } from './transform/payment-method'
import { transformPlan, type RawCashfreePlan } from './transform/plan'
import { transformRefund, type RawCashfreeRefund } from './transform/refund'
import { transformSubscription, type RawCashfreeSubscription } from './transform/subscription'
import { toMajorUnits } from './transform/shared'

/** Split a `getRefund` id into its order + refund components.
 *  Accepts `"<order_id>:<refund_id>"`; falls back to treating the whole
 *  string as the refund id (callers may also pass `orderId` via params). */
function splitRefundId(id: string): { orderId?: string; refundId: string } {
  const idx = id.indexOf(':')
  if (idx === -1) return { refundId: id }
  return { orderId: id.slice(0, idx), refundId: id.slice(idx + 1) }
}

export class CashfreeAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'cashfree'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error(
      'Cashfree uses static API keys; submit the client id + secret via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Cashfree uses static API keys; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'sandbox', label: 'Sandbox (test)' },
          { value: 'production', label: 'Production (live)' },
        ],
      },
      {
        name: 'clientId',
        label: 'Client ID (App ID)',
        type: 'text',
        required: true,
        helpText: 'Sent as x-client-id. Found under Developers → API Keys in the Cashfree dashboard.',
      },
      {
        name: 'clientSecret',
        label: 'Client secret',
        type: 'password',
        required: true,
        helpText: 'Sent as x-client-secret and used to verify webhook signatures.',
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
    return verifyCashfreeWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseCashfreeWebhookEvents(payload)
  }

  private client(credentials: Credentials): CashfreeClient {
    return new CashfreeClient(credentials)
  }

  // ── Charges (orders + payments) ───────────────────────────────────────────

  /** Fetch an order and present it as a canonical charge. `id` = `order_id`. */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawCashfreeCharge>(
      `/orders/${encodeURIComponent(id)}`,
    )
    return transformCharge(raw ?? {})
  }

  /** List the payment attempts for one order. Requires `params.orderId`;
   *  returns `[]` when omitted (Cashfree has no global payment list). */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const orderId = typeof params.orderId === 'string' ? params.orderId : undefined
    if (!orderId) return []
    const res = await this.client(credentials).get<RawCashfreeCharge[]>(
      `/orders/${encodeURIComponent(orderId)}/payments`,
    )
    return (Array.isArray(res) ? res : []).map(transformCharge)
  }

  /** Create an order. The returned order is presented as a pending charge. */
  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const body: Record<string, unknown> = {
      order_amount: toMajorUnits(data.amount),
      order_currency: data.currency ?? 'INR',
      customer_details: {
        customer_id: data.customerId ?? undefined,
        customer_email: data.receiptEmail ?? undefined,
      },
    }
    if (data.description) body.order_note = data.description
    const raw = await this.client(credentials).post<RawCashfreeCharge>('/orders', body)
    return transformCharge(raw ?? {})
  }

  // ── Refunds ────────────────────────────────────────────────────────────────

  /** List refunds for one order. Requires `params.orderId`; returns `[]`
   *  otherwise (refunds are order-scoped in Cashfree). */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = typeof params.orderId === 'string' ? params.orderId : undefined
    if (!orderId) return []
    const res = await this.client(credentials).get<RawCashfreeRefund[]>(
      `/orders/${encodeURIComponent(orderId)}/refunds`,
    )
    return (Array.isArray(res) ? res : []).map(transformRefund)
  }

  /** Fetch a single refund. `id` is `"<order_id>:<refund_id>"`. */
  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const { orderId, refundId } = splitRefundId(id)
    if (!orderId) {
      throw new Error('Cashfree refund lookup needs "<order_id>:<refund_id>"; order id missing.')
    }
    const raw = await this.client(credentials).get<RawCashfreeRefund>(
      `/orders/${encodeURIComponent(orderId)}/refunds/${encodeURIComponent(refundId)}`,
    )
    return transformRefund(raw ?? {})
  }

  /** Create a refund against an order. `data.chargeId` = `order_id`. */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (Cashfree order_id) required for refund')
    const body: Record<string, unknown> = {
      refund_amount: toMajorUnits(data.amount),
      // Cashfree requires a unique merchant refund id (3-40 alphanumerics).
      refund_id: data.id ?? `re_${Date.now()}`,
    }
    const note = data.metadata?.refund_note
    if (note) body.refund_note = note
    const raw = await this.client(credentials).post<RawCashfreeRefund>(
      `/orders/${encodeURIComponent(data.chargeId)}/refunds`,
      body,
    )
    return transformRefund({ ...raw, order_id: data.chargeId })
  }

  // ── Customers ────────────────────────────────────────────────────────────────

  /** Create a customer in Cashfree's system. Returns a gateway customer_uid.
   *  Note: Cashfree PG has no GET /customers or list customers endpoint;
   *  customer data lives inside orders and subscriptions. */
  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const body: Record<string, unknown> = {
      customer_phone: data.phone ?? '',
      customer_email: data.email ?? undefined,
      customer_name: data.name ?? undefined,
    }
    const raw = await this.client(credentials).post<RawCashfreeCustomer>('/customers', body)
    return transformCustomer(raw ?? {})
  }

  // ── Disputes ─────────────────────────────────────────────────────────────────

  /** Fetch a single dispute by its Cashfree dispute_id. */
  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const raw = await this.client(credentials).get<RawCashfreeDispute>(
      `/disputes/${encodeURIComponent(id)}`,
    )
    return transformDispute(raw ?? {})
  }

  /** List disputes for an order. Requires `params.orderId`; returns `[]`
   *  otherwise (Cashfree disputes are order-scoped — no global list). */
  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    const orderId = typeof params.orderId === 'string' ? params.orderId : undefined
    if (!orderId) return []
    const res = await this.client(credentials).get<RawCashfreeDispute[]>(
      `/orders/${encodeURIComponent(orderId)}/disputes`,
    )
    return (Array.isArray(res) ? res : []).map(transformDispute)
  }

  // ── Payment methods (Token Vault) ─────────────────────────────────────────

  /** List saved card instruments for a customer. Requires `params.customerId`. */
  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const customerId = typeof params.customerId === 'string' ? params.customerId : undefined
    if (!customerId) return []
    const res = await this.client(credentials).get<RawCashfreeInstrument[]>(
      `/customers/${encodeURIComponent(customerId)}/instruments`,
      { instrument_type: 'card' },
    )
    return (Array.isArray(res) ? res : []).map(transformPaymentMethod)
  }

  /** Fetch a single saved instrument. `id` is `"<customer_id>:<instrument_id>"`. */
  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const colonIdx = id.indexOf(':')
    if (colonIdx === -1) {
      throw new Error(
        'Cashfree instrument lookup needs "<customer_id>:<instrument_id>"; customer id missing.',
      )
    }
    const customerId = id.slice(0, colonIdx)
    const instrumentId = id.slice(colonIdx + 1)
    const raw = await this.client(credentials).get<RawCashfreeInstrument>(
      `/customers/${encodeURIComponent(customerId)}/instruments/${encodeURIComponent(instrumentId)}`,
    )
    return transformPaymentMethod(raw ?? {})
  }

  // ── Plans ─────────────────────────────────────────────────────────────────

  /** Fetch a single plan by plan_id. Cashfree has no list-plans endpoint. */
  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const raw = await this.client(credentials).get<RawCashfreePlan>(
      `/plans/${encodeURIComponent(id)}`,
    )
    return transformPlan(raw ?? {})
  }

  // ── Subscriptions ────────────────────────────────────────────────────────

  /** Fetch a single subscription by subscription_id. */
  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const raw = await this.client(credentials).get<RawCashfreeSubscription>(
      `/subscriptions/${encodeURIComponent(id)}`,
    )
    return transformSubscription(raw ?? {})
  }

  /** Cancel a subscription. Sends the CANCEL manage action. */
  async cancelSubscription(
    credentials: Credentials,
    id: string,
  ): Promise<Subscription> {
    const raw = await this.client(credentials).post<RawCashfreeSubscription>(
      `/subscriptions/${encodeURIComponent(id)}/manage`,
      { action: 'CANCEL' },
    )
    return transformSubscription(raw ?? {})
  }
}
