/**
 * BlueSnap adapter — payments vertical.
 *
 * BlueSnap is a global "all-in-one" payment platform (cards, ACH, SEPA,
 * BECS, PADS, wallets) processing through its JSON Payment API, version 2,
 * under the `/services/2/` path. Sandbox and production are isolated
 * environments with separate credentials.
 *
 * Auth: HTTP Basic — API username + password from Settings → API Settings,
 * Base64-encoded. The chosen environment rides on `credentials.extra`.
 *
 * Coverage: BlueSnap's Payment API exposes single-resource transaction and
 * vaulted-shopper endpoints (create + retrieve) and a refund mutation. It
 * has NO list/search endpoints for these resources and no first-class
 * refund resource, so `listCharges` / `listCustomers` / `listRefunds`
 * are intentionally omitted (they auto-501 via the router):
 *
 *   - getCharge / createCharge        → /services/2/transactions
 *   - getCustomer / createCustomer    → /services/2/vaulted-shoppers
 *   - createRefund                    → PUT /services/2/transactions/{id}/refund
 *   - listSubscriptions / getSubscription → /services/2/recurring/subscriptions
 *   - listPlans / getPlan             → /services/2/recurring/plans
 *   - listPaymentMethods / getPaymentMethod → derived from /services/2/vaulted-shoppers
 *
 * Money: BlueSnap works in decimal MAJOR units; the transform layer scales
 * to/from canonical integer minor units.
 *
 * Docs: https://developers.bluesnap.com/reference/about
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — no dedicated Payment API endpoint; data
 *   only accessible via the separate Reporting API (TransactionDetail report).
 * Unavailable: dispute — BlueSnap chargebacks have only a representment-upload
 *   endpoint (/services/2/chargeback/upload_representment); no list/get API.
 * Unavailable: invoice — BlueSnap invoicing is a separate AR product with no
 *   Payment API endpoint for list/get of invoices.
 * Unavailable: payout — payout data is accessible only via the Reporting API
 *   (Payout Detail report), not as a REST resource endpoint.
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
  type BaseAdapter,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'
import type { Plan } from '../../schema/plan'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import {
  TRANSACTIONS_PATH,
  VAULTED_SHOPPERS_PATH,
  RECURRING_SUBSCRIPTIONS_PATH,
  RECURRING_PLANS_PATH,
  SUBSCRIPTIONS_MAX_PAGE_SIZE,
  DEFAULT_LIST_PAGE_SIZE,
} from './constants'
import { buildCredentials, environmentOf } from './auth'
import { BluesnapClient } from './client'
import { parseBluesnapWebhookEvents, verifyBluesnapWebhook } from './webhook'

import { transformCharge, type RawBluesnapTransaction } from './transform/charge'
import { transformCustomer, type RawBluesnapVaultedShopper } from './transform/customer'
import { transformRefund } from './transform/refund'
import { transformPlan, type RawBluesnapPlan } from './transform/plan'
import {
  transformSubscription,
  type RawBluesnapSubscription,
} from './transform/subscription'
import { transformPaymentMethodsFromShopper } from './transform/payment-method'

/** BlueSnap works in decimal major units; canonical amounts are minor units. */
function toMajorUnits(minor: number | null | undefined): number {
  return Math.round(minor ?? 0) / 100
}

export class BluesnapAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'bluesnap'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error(
      'BlueSnap uses API username + password (HTTP Basic); submit them via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('BlueSnap uses HTTP Basic auth; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiUsername',
        label: 'API username',
        type: 'text',
        required: true,
        helpText: 'From the Merchant Portal under Settings → API Settings.',
      },
      {
        name: 'apiPassword',
        label: 'API password',
        type: 'password',
        required: true,
        helpText: 'The API password paired with your API username.',
      },
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        helpText: 'Sandbox and production have separate API credentials.',
        options: [
          { value: 'sandbox', label: 'Sandbox' },
          { value: 'production', label: 'Production' },
        ],
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
    return verifyBluesnapWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseBluesnapWebhookEvents(payload)
  }

  private client(credentials: Credentials): BluesnapClient {
    return new BluesnapClient(credentials)
  }

  // ── Charges (transactions) ────────────────────────────────────────────────

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawBluesnapTransaction>(
      `${TRANSACTIONS_PATH}/${id}`,
    )
    return transformCharge(raw)
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    if (data.amount == null) throw new Error('amount required for BlueSnap transaction')
    if (!data.currency) throw new Error('currency required for BlueSnap transaction')
    const body: Record<string, unknown> = {
      amount: toMajorUnits(data.amount),
      currency: data.currency,
      // A captured charge maps to AUTH_CAPTURE; an uncaptured one to AUTH_ONLY.
      cardTransactionType: data.captured === false ? 'AUTH_ONLY' : 'AUTH_CAPTURE',
    }
    if (data.statementDescriptor) body.softDescriptor = data.statementDescriptor
    if (data.customerId) body.vaultedShopperId = Number(data.customerId)
    const raw = await this.client(credentials).post<RawBluesnapTransaction>(
      TRANSACTIONS_PATH,
      body,
    )
    return transformCharge(raw)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId required for BlueSnap refund')
    const params: Record<string, unknown> = {}
    // Omit amount for a full refund; BlueSnap expects decimal major units.
    if (data.amount != null) params.amount = toMajorUnits(data.amount)
    if (data.reason) params.reason = data.reason
    await this.client(credentials).put<unknown>(
      `${TRANSACTIONS_PATH}/${data.chargeId}/refund`,
      undefined,
      params,
    )
    // The refund call returns 200 with no body; re-read the transaction to
    // surface the refunded amount and confirm the synchronous result.
    const tx = await this.client(credentials)
      .get<RawBluesnapTransaction>(`${TRANSACTIONS_PATH}/${data.chargeId}`)
      .catch(() => undefined)
    // transformRefund expects BlueSnap-shaped (decimal major-unit) amounts:
    // canonical `data.amount` is minor units → scale down; `refundedAmount`
    // from the transaction is already major units → pass through.
    return transformRefund({
      transactionId: data.chargeId,
      amount: data.amount != null ? data.amount / 100 : (tx?.refundedAmount ?? 0),
      currency: data.currency ?? tx?.currency,
      reason: data.reason,
    })
  }

  // ── Customers (vaulted shoppers) ──────────────────────────────────────────

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawBluesnapVaultedShopper>(
      `${VAULTED_SHOPPERS_PATH}/${id}`,
    )
    return transformCustomer(raw)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const [firstName, ...rest] = (data.name ?? '').trim().split(/\s+/)
    const body: Record<string, unknown> = {}
    if (firstName) body.firstName = firstName
    if (rest.length) body.lastName = rest.join(' ')
    if (data.email) body.email = data.email
    if (data.phone) body.phone = data.phone
    if (data.currency) body.shopperCurrency = data.currency
    const raw = await this.client(credentials).post<RawBluesnapVaultedShopper>(
      VAULTED_SHOPPERS_PATH,
      body,
    )
    return transformCustomer(raw)
  }

  // ── Payment methods (derived from vaulted shopper) ────────────────────────

  async listPaymentMethods(credentials: Credentials, params: QueryParams): Promise<PaymentMethod[]> {
    // BlueSnap has no standalone payment-method list endpoint. Payment methods
    // are embedded in the vaulted shopper. Require customerId to fetch them.
    const customerId = (params as Record<string, unknown>).customerId
    if (!customerId) return []
    const shopper = await this.client(credentials).get<RawBluesnapVaultedShopper>(
      `${VAULTED_SHOPPERS_PATH}/${customerId}`,
    )
    return transformPaymentMethodsFromShopper(shopper)
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    // Synthesised ID format: `{shopperId}-card-{index}`.
    const [shopperId] = id.split('-card-')
    if (!shopperId) throw new Error(`Cannot resolve vaultedShopperId from paymentMethod id: ${id}`)
    const shopper = await this.client(credentials).get<RawBluesnapVaultedShopper>(
      `${VAULTED_SHOPPERS_PATH}/${shopperId}`,
    )
    const methods = transformPaymentMethodsFromShopper(shopper)
    const found = methods.find((m) => m.id === id)
    if (!found) throw new Error(`Payment method ${id} not found on vaulted shopper ${shopperId}`)
    return found
  }

  /**
   * One caller page of a recurring list (subscriptions or plans).
   *
   * Both endpoints page by id keyset, newest first: page N starts `after` the
   * last id of page N − 1, so {@link pageByCursor} walks the chain. The end is
   * the envelope's `lastPage`, which "Appears only if the `gettotal=true`
   * parameter was included in the request" — hence `gettotal=true`. Where it
   * is still absent, a full page is taken to mean more may follow.
   *
   * The pager scope is the environment plus a fingerprint of the stored
   * credential (base64 `username:password`), so no secret reaches the key.
   */
  private async pageRecurring<R extends Record<string, unknown>>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    listField: 'subscriptions' | 'plans',
    idField: 'subscriptionId' | 'planId',
    maxPageSize?: number,
  ): Promise<R[]> {
    const asked =
      typeof params.limit === 'number' && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_LIST_PAGE_SIZE
    const pagesize = maxPageSize === undefined ? asked : Math.min(asked, maxPageSize)
    const client = this.client(credentials)
    const key = cursorPagerKey(
      connectionScope(`bluesnap:${environmentOf(credentials)}`, credentials),
      listField,
      { limit: pagesize },
    )
    const { items, hasMore } = await pageByCursor<R>(key, params.page, async (after) => {
      const query: Record<string, unknown> = { pagesize, gettotal: true }
      if (after !== undefined) query.after = after
      const envelope = await client.get<{ lastPage?: boolean } & Record<string, unknown>>(
        path,
        query,
      )
      const rows = (envelope[listField] as R[] | undefined) ?? []
      const lastId = rows.length > 0 ? rows[rows.length - 1]![idField] : undefined
      const more =
        typeof envelope.lastPage === 'boolean' ? !envelope.lastPage : rows.length >= pagesize
      return { items: rows, next: more && lastId != null ? String(lastId) : undefined }
    })
    reportUpstreamPage(params, pagesize < asked ? { hasMore, pageSize: pagesize } : { hasMore })
    return items
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  /**
   * GET /services/2/recurring/subscriptions, paged by id keyset: `after` is
   * "Subscription ID. The response will get the page of results after the
   * specified ID (exclusive)." and `pagesize` "Default is **10** if not set.
   * Maximum is **500**." See {@link pageRecurring}.
   * https://developers.bluesnap.com/v8976-JSON/reference/retrieve-all-subscriptions
   */
  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const rows = await this.pageRecurring<RawBluesnapSubscription>(
      credentials,
      params,
      RECURRING_SUBSCRIPTIONS_PATH,
      'subscriptions',
      'subscriptionId',
      SUBSCRIPTIONS_MAX_PAGE_SIZE,
    )
    return rows.map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const raw = await this.client(credentials).get<RawBluesnapSubscription>(
      `${RECURRING_SUBSCRIPTIONS_PATH}/${id}`,
    )
    return transformSubscription(raw)
  }

  // ── Plans ─────────────────────────────────────────────────────────────────

  /**
   * GET /services/2/recurring/plans, paged by id keyset like subscriptions:
   * `after` is "Plan ID. The response will get the page of results after the
   * specified ID (exclusive)." The plans reference states no maximum
   * `pagesize`, so the caller's limit is sent as is.
   * https://developers.bluesnap.com/v8976-JSON/reference/retrieve-all-plans
   */
  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const rows = await this.pageRecurring<RawBluesnapPlan>(
      credentials,
      params,
      RECURRING_PLANS_PATH,
      'plans',
      'planId',
    )
    return rows.map(transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const raw = await this.client(credentials).get<RawBluesnapPlan>(
      `${RECURRING_PLANS_PATH}/${id}`,
    )
    return transformPlan(raw)
  }
}
