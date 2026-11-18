/**
 * Bolt adapter — payments vertical (US checkout / one-click anchor).
 *
 * Bolt is a US-first checkout and payments network: one-click checkout, a
 * shopper account network, and a merchant payments API for authorize / capture
 * / void / refund. Settlement is USD-first. Methods: cards, Apple Pay, PayPal,
 * and Bolt-account wallets.
 *
 * Auth: static API key (api_key model) sent in the `X-Api-Key` header — not a
 * Bearer token. Submitted via the Connect Link form. Sandbox and production
 * each issue their own key, so the key implies the environment.
 *
 * Resources Bolt's merchant transaction API exposes (and we implement):
 *   - Charges: retrieve, authorize (create), capture, void (cancel).
 *   - Refunds: create (refund a captured transaction).
 *   - Subscriptions: list, get (via GET /v1/subscriptions).
 *   - Plans: list, get (via GET /v1/subscriptions/products — plans are
 *     embedded within product objects and flattened per plan).
 * Bolt has no public paginated list endpoint for charges via the merchant API,
 * so listCharges is intentionally omitted and auto-501.
 *
 * Docs: https://help.bolt.com/api-bolt/
 *       https://help.bolt.com/api-subscriptions/
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — Bolt exposes only a CSV statement export
 *   (POST /v1/merchant/statement) with no per-record JSON API for ledger entries.
 * Unavailable: dispute — Disputes are managed via the Bolt dashboard / webhook
 *   notifications; no merchant REST API exists for retrieving dispute records.
 * Unavailable: invoice — Bolt is a checkout-based processor with no invoice
 *   concept in its merchant REST API.
 * Unavailable: payment-method — Saved payment methods are accessible only
 *   through a per-shopper OAuth token (Account API), not the static merchant
 *   API key this adapter uses.
 * Unavailable: payout — Settlement data is available only as a CSV export
 *   (POST /v1/merchant/statement type=daily_funding); no per-record payout API.
 */

import type { BaseAdapter, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { Plan } from '../../schema/plan'
import type { WebhookEvent } from '../../schema/webhook'

import { TRANSACTIONS_PATH } from './constants'
import { BOLT_CREDENTIAL_FORM } from './auth'
import { BoltClient } from './client'
import { parseBoltWebhookEvents, verifyBoltWebhook } from './webhook'

import { transformCharge, type RawBoltTransaction } from './transform/charge'
import { transformRefund, type RawBoltRefund } from './transform/refund'
import { transformSubscription, type RawBoltSubscription } from './transform/subscription'
import { transformPlan, type RawBoltProduct } from './transform/plan'

export class BoltAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'bolt'
  readonly version = '0.1.0'

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('Bolt uses a static API key; submit it via the Connect Link form.')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Bolt uses a static API key; call exchangeCredentials instead.')
  }

  // api_key model — delegate the form + exchange to the shared simpleApiKey template.
  credentialFields = BOLT_CREDENTIAL_FORM.credentialFields
  exchangeCredentials = BOLT_CREDENTIAL_FORM.exchangeCredentials

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static key — nothing to refresh.
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyBoltWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseBoltWebhookEvents(payload)
  }

  private client(credentials: Credentials): BoltClient {
    return new BoltClient(credentials)
  }

  // ── Charges ──────────────────────────────────────────────────────────────

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawBoltTransaction>(
      `${TRANSACTIONS_PATH}/${encodeURIComponent(id)}`,
    )
    return transformCharge(res ?? {})
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    // Bolt authorizes a transaction; capture is a separate step unless the
    // merchant has auto-capture enabled.
    const res = await this.client(credentials).post<RawBoltTransaction>(
      `${TRANSACTIONS_PATH}/authorize`,
      {
        amount: data.amount,
        currency: data.currency,
        auto_capture: data.captured ?? false,
        ...(data.customerId ? { account_id: data.customerId } : {}),
        ...(data.invoiceId ? { order_reference: data.invoiceId } : {}),
      },
    )
    return transformCharge(res ?? {})
  }

  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const res = await this.client(credentials).post<RawBoltTransaction>(
      `${TRANSACTIONS_PATH}/capture`,
      {
        transaction_reference: id,
        ...(data?.amount != null ? { amount: data.amount } : {}),
        skip_hook_notification: false,
      },
    )
    return transformCharge(res ?? {})
  }

  /** Void an authorized-but-uncaptured Bolt transaction. */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<RawBoltTransaction>(
      `${TRANSACTIONS_PATH}/void`,
      { transaction_reference: id, skip_hook_notification: false },
    )
    return transformCharge(res ?? {})
  }

  // ── Refunds ──────────────────────────────────────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId is required for a Bolt refund.')
    const res = await this.client(credentials).post<RawBoltRefund>(
      `${TRANSACTIONS_PATH}/refund`,
      {
        transaction_reference: data.chargeId,
        amount: data.amount,
        currency: data.currency,
        ...(data.reason ? { reason: data.reason } : {}),
        skip_hook_notification: false,
      },
    )
    return transformRefund(res ?? {})
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────
  // Bolt Subscriptions API: GET /v1/subscriptions (list) and
  // GET /v1/subscriptions/{ID} (get).
  // Docs: https://help.bolt.com/products/bolt-subscriptions/subscriptions-implementation/

  async listSubscriptions(
    credentials: Credentials,
    _params: QueryParams,
  ): Promise<Subscription[]> {
    const res = await this.client(credentials).get<RawBoltSubscription[]>('/v1/subscriptions')
    return (res ?? []).map((s) => transformSubscription(s))
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<RawBoltSubscription>(
      `/v1/subscriptions/${encodeURIComponent(id)}`,
    )
    return transformSubscription(res ?? {})
  }

  // ── Plans ─────────────────────────────────────────────────────────────────
  // Bolt exposes plans embedded within product objects at
  // GET /v1/subscriptions/products. We flatten across all products to yield
  // one Plan record per plan entry.
  // Docs: https://help.bolt.com/products/bolt-subscriptions/subscriptions-implementation/

  async listPlans(credentials: Credentials, _params: QueryParams): Promise<Plan[]> {
    const products = await this.client(credentials).get<RawBoltProduct[]>(
      '/v1/subscriptions/products',
    )
    const plans: Plan[] = []
    for (const product of products ?? []) {
      for (const plan of product.plans ?? []) {
        // Carry the product_id on each plan so the transform can reference it.
        plans.push(transformPlan({ ...plan, product_id: plan.product_id ?? product.id }))
      }
    }
    return plans
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    // Bolt has no single-plan endpoint; fetch the parent product by product_id.
    // Callers may pass either a plan ID or a product ID; we fetch the product
    // and return the first plan whose `id` matches (falling back to the first).
    const product = await this.client(credentials).get<RawBoltProduct>(
      `/v1/subscriptions/products/${encodeURIComponent(id)}`,
    )
    const plans = product?.plans ?? []
    const match = plans.find((p) => String(p.id) === id) ?? plans[0]
    return transformPlan({ ...(match ?? {}), product_id: match?.product_id ?? product?.id })
  }
}
