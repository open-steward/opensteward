/**
 * Paysafe adapter — payments vertical (global card + alternative payments).
 *
 * Paysafe exposes a unified, resource-oriented Payments API. A **Payment**
 * (`/paymenthub/v1/payments`) carries the amount, currency, customer reference
 * and overall status, so it maps onto the canonical **Charge**. Customers are
 * Customer Vault **profiles** (`/customervault/v1/profiles`); **Refunds** are
 * credits against a settlement (`/paymenthub/v1/settlements/{id}/refunds`).
 *
 * Plans and Subscriptions live under the separate Payment Scheduler API
 * (`/subscriptionsplans/v1/`), reachable at the same base host, so the same
 * client and credentials are reused.
 *
 * Money is reported in minor units (a consistent 2-decimal shift across every
 * currency), matching the canonical contract — no scaling in the transforms.
 *
 * Auth: HTTP Basic — a Key ID + Key password pair, Base64-encoded. The pair is
 * environment-bound (Test vs Production), selected on the Connect Link form.
 * No OAuth, no refresh token.
 *
 * Webhooks: HMAC-SHA256 over the raw JSON body, base64 in the `Signature`
 * header (see webhook.ts).
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: balance-transaction — Paysafe exposes no balance/ledger REST endpoint; reporting is portal-only
 * Unavailable: dispute — chargebacks are managed via the Business Portal only; no REST dispute API is documented
 * Unavailable: invoice — Paysafe has no invoice concept in its REST API
 * Unavailable: payment-method — no flat list endpoint for payment handles across all customers; requires a customerId per-request
 * Unavailable: payout — standalonecredits is write-only (POST); no confirmed GET list endpoint
 */

import {
  pageOffset,
  type BaseAdapter,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Plan } from '../../schema/plan'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PAYMENTS_PATH,
  PLANS_PATH,
  PROFILES_PATH,
  REFUNDS_PATH,
  SETTLEMENTS_PATH,
  SUBSCRIPTIONS_PATH,
} from './constants'
import { CREDENTIAL_FIELDS, buildCredentials } from './auth'
import { PaysafeClient, clampLimit, type PaysafePagingMeta } from './client'
import { parsePaysafeWebhookEvents, verifyPaysafeWebhook } from './webhook'

import { transformCustomer, type RawPaysafeProfile } from './transform/customer'
import { transformCharge, type RawPaysafePayment } from './transform/charge'
import { transformPlan, type RawPaysafePlan } from './transform/plan'
import { transformRefund, type RawPaysafeRefund } from './transform/refund'
import { transformSubscription, type RawPaysafeSubscription } from './transform/subscription'

/** Paysafe list envelopes wrap records under a resource-named array + `meta`. */
interface PaymentsEnvelope {
  payments?: RawPaysafePayment[]
  meta?: PaysafePagingMeta
}
interface RefundsEnvelope {
  refunds?: RawPaysafeRefund[]
  meta?: PaysafePagingMeta
}
/** Payment Scheduler list envelopes. */
interface PlansEnvelope {
  plans?: RawPaysafePlan[]
  meta?: PaysafePagingMeta
}
interface SubscriptionsEnvelope {
  subscriptions?: RawPaysafeSubscription[]
  meta?: PaysafePagingMeta
}

export class PaysafeAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'paysafe'
  readonly version = '0.1.0'
  /** `limit`: "Max = 50." — the sync must not read a clamped 50 as a short last page. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('Paysafe uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Paysafe uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // The Basic key pair is long-lived; nothing to refresh.
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPaysafeWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePaysafeWebhookEvents(payload)
  }

  private client(credentials: Credentials): PaysafeClient {
    return new PaysafeClient(credentials)
  }

  /**
   * Paysafe paginates with `limit` (max 50) + `offset`, "the starting position,
   * where 0 is the first record". Page N starts (N - 1) × the limit actually sent.
   */
  private offsetParams(params: QueryParams): Record<string, unknown> {
    const limit = clampLimit(params.limit, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE)
    return { limit, offset: pageOffset(params, limit) }
  }

  // ── Charges (Paysafe Payments) ──────────────────────────────────────────────
  /**
   * Known gap, separate from paging: Paysafe documents GET /payments only as
   * "Get Payments Using Merchant Reference Number", with `merchantRefNum`
   * required, and this list-all call sends none.
   */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const res = await this.client(credentials).get<PaymentsEnvelope>(
      PAYMENTS_PATH,
      this.offsetParams(params),
    )
    return (res.payments ?? []).map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawPaysafePayment>(`${PAYMENTS_PATH}/${id}`)
    return transformCharge(res ?? {})
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    if (!data.paymentMethodId) {
      throw new Error('paymentMethodId (Paysafe paymentHandleToken) is required to create a payment')
    }
    const res = await this.client(credentials).post<RawPaysafePayment>(PAYMENTS_PATH, {
      merchantRefNum: data.id ?? `pay_${Date.now()}`,
      amount: data.amount,
      currencyCode: data.currency,
      settleWithAuth: true,
      paymentHandleToken: data.paymentMethodId,
      description: data.description ?? undefined,
      dupCheck: true,
    })
    return transformCharge(res ?? {})
  }

  // ── Customers (Paysafe Customer Vault profiles) ─────────────────────────────
  /**
   * Refused before any request. The Customer Vault documents GET on /v1/profiles
   * only as "Get Profile Using Merchant Customer ID" — "This is how you look up
   * a profile using the Merchant Customer ID that was used in the original
   * request.", with `merchantCustomerId` required and no limit or offset
   * (https://github.com/paysafegroup/paysafe_api_customervault_v1) — so there is
   * no list of profiles to page.
   */
  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw Object.assign(
      new Error(
        'Paysafe cannot list customers: the Customer Vault documents GET /v1/profiles only as ' +
          '"Get Profile Using Merchant Customer ID", a lookup of one profile by a required ' +
          'merchantCustomerId with no limit or offset.',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawPaysafeProfile>(`${PROFILES_PATH}/${id}`)
    return transformCustomer(res ?? {})
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const [firstName, ...rest] = (data.name ?? '').trim().split(/\s+/)
    const res = await this.client(credentials).post<RawPaysafeProfile>(PROFILES_PATH, {
      merchantCustomerId: data.id ?? `cust_${Date.now()}`,
      firstName: firstName || undefined,
      lastName: rest.length > 0 ? rest.join(' ') : undefined,
      email: data.email ?? undefined,
      phone: data.phone ?? undefined,
      locale: 'en_US',
    })
    return transformCustomer(res ?? {})
  }

  // ── Refunds ─────────────────────────────────────────────────────────────────
  /**
   * Known gap, separate from paging: Paysafe documents GET /refunds only as
   * "Get Refunds Using Merchant Reference Number", with `merchantRefNum`
   * required, and this list-all call sends none.
   */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const res = await this.client(credentials).get<RefundsEnvelope>(
      REFUNDS_PATH,
      this.offsetParams(params),
    )
    return (res.refunds ?? []).map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<RawPaysafeRefund>(`${REFUNDS_PATH}/${id}`)
    return transformRefund(res ?? {})
  }

  /**
   * Refunds are issued against a settlement:
   *   POST /paymenthub/v1/settlements/{settlementId}/refunds
   * The canonical `chargeId` carries that settlement id.
   */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) {
      throw new Error('chargeId (Paysafe settlementId) is required to create a refund')
    }
    const res = await this.client(credentials).post<RawPaysafeRefund>(
      `${SETTLEMENTS_PATH}/${data.chargeId}/refunds`,
      {
        merchantRefNum: data.id ?? `refund_${Date.now()}`,
        amount: data.amount,
        currencyCode: data.currency,
        dupCheck: true,
      },
    )
    return transformRefund(res ?? {})
  }

  // ── Plans (Paysafe Payment Scheduler) ───────────────────────────────────────
  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const res = await this.client(credentials).get<PlansEnvelope>(
      PLANS_PATH,
      this.offsetParams(params),
    )
    return (res.plans ?? []).map(transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const res = await this.client(credentials).get<RawPaysafePlan>(`${PLANS_PATH}/${id}`)
    return transformPlan(res ?? {})
  }

  // ── Subscriptions (Paysafe Payment Scheduler) ────────────────────────────────
  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const res = await this.client(credentials).get<SubscriptionsEnvelope>(
      SUBSCRIPTIONS_PATH,
      this.offsetParams(params),
    )
    return (res.subscriptions ?? []).map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<RawPaysafeSubscription>(`${SUBSCRIPTIONS_PATH}/${id}`)
    return transformSubscription(res ?? {})
  }
}
