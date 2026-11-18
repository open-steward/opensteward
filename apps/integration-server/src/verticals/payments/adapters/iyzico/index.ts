/**
 * iyzico adapter — payments vertical (Türkiye anchor, MENA + Europe reach).
 *
 * iyzico (a PayU company) is the leading card-acquiring gateway in Türkiye.
 * Methods: cards (incl. installments), PayWithiyzico/CheckoutForm hosted pages,
 * BKM Express, bank transfer, stored cards. TRY-first, multi-currency settling.
 *
 * API shape: the payment API is RPC-style POST-only, fetching resources one at a
 * time by id. The subscription v2 API (/v2/subscription/*) uses standard REST
 * (GET/POST) with the same IYZWSv2 HMACSHA256 auth (empty body for GETs).
 *
 * Implemented resources:
 *   - getCharge         → POST /payment/detail
 *   - cancelCharge      → POST /payment/cancel   (full void of an unsettled payment)
 *   - createRefund      → POST /payment/refund   (per basket item / paymentTransactionId)
 *   - listCustomers     → GET  /v2/subscription/customers
 *   - getCustomer       → GET  /v2/subscription/customers/{id}
 *   - listSubscriptions → GET  /v2/subscription/subscriptions
 *   - getSubscription   → GET  /v2/subscription/subscriptions/{id}
 *   - getPlan           → GET  /v2/subscription/pricing-plans/{id}
 *
 * Auth: per-request HMACSHA256 signature (`IYZWSv2`), submitted via the Connect
 * Link form (apiKey + secretKey + environment).
 *
 * Docs: https://docs.iyzico.com/en
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: balance-transaction — no balance ledger API; reporting is date-based daily batch only
 * Unavailable: dispute — no API endpoint; chargebacks handled in merchant panel only
 * Unavailable: invoice — no invoice/billing document API
 * Unavailable: payment-method — card storage requires per-user cardUserKey lookup, no global list endpoint
 * Unavailable: payout — mass payout retrieve requires merchant-assigned externalId; no list endpoint
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
import type { Plan } from '../../schema/plan'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_LOCALE, ENDPOINTS } from './constants'
import { FORM } from './auth'
import { IyzicoClient } from './client'
import { parseIyzicoWebhookEvents, verifyIyzicoWebhook } from './webhook'

import { transformCharge, type RawIyzicoPayment } from './transform/charge'
import { transformRefund, type RawIyzicoRefund } from './transform/refund'
import {
  transformCustomer,
  type RawIyzicoSubscriberListResponse,
  type RawIyzicoSubscriberDetailResponse,
} from './transform/customer'
import {
  transformSubscription,
  type RawIyzicoSubscriptionListResponse,
  type RawIyzicoSubscriptionDetailResponse,
} from './transform/subscription'
import {
  transformPlan,
  type RawIyzicoPlanDetailResponse,
} from './transform/plan'

/** Assert the top-level request status, surfacing iyzico's error fields. */
function assertOk(res: { status?: string; errorCode?: string; errorMessage?: string }): void {
  if ((res.status ?? '').toLowerCase() === 'failure') {
    throw new Error(
      `iyzico error ${res.errorCode ?? ''}: ${res.errorMessage ?? 'request failed'}`.trim(),
    )
  }
}

export class IyzicoAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'iyzico'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('iyzico uses an API key + secret; submit them via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('iyzico uses an API key + secret; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return FORM.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static API key + secret — nothing to refresh.
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyIyzicoWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseIyzicoWebhookEvents(payload)
  }

  private client(credentials: Credentials): IyzicoClient {
    return new IyzicoClient(credentials)
  }

  // ── Charges ─────────────────────────────────────────────────────────────

  /** Retrieve a settled payment by its iyzico paymentId. */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<RawIyzicoPayment>(ENDPOINTS.paymentDetail, {
      locale: DEFAULT_LOCALE,
      paymentId: id,
    })
    assertOk(res)
    return transformCharge(res)
  }

  /** Cancel (full void) an unsettled payment — same-day reversal of the auth. */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<RawIyzicoPayment>(ENDPOINTS.cancel, {
      locale: DEFAULT_LOCALE,
      paymentId: id,
    })
    assertOk(res)
    // The cancel response is a thin payment echo; mark it cancelled explicitly
    // since iyzico drops `paymentStatus` from the cancel acknowledgement.
    return { ...transformCharge(res), status: 'cancelled', captured: false }
  }

  // ── Refunds ─────────────────────────────────────────────────────────────

  /**
   * Refund a payment. iyzico refunds per basket item, identified by
   * `paymentTransactionId` — supplied here as the canonical `chargeId`. The
   * amount is sent in major units (iyzico expects decimals, not minor units).
   */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) {
      throw new Error('chargeId (iyzico paymentTransactionId) required for iyzico refund')
    }
    const body: Record<string, unknown> = {
      locale: DEFAULT_LOCALE,
      paymentTransactionId: data.chargeId,
    }
    if (data.amount != null) body['price'] = (data.amount / 100).toFixed(2)
    if (data.currency) body['currency'] = data.currency
    const res = await this.client(credentials).post<RawIyzicoRefund>(ENDPOINTS.refund, body)
    assertOk(res)
    return transformRefund(res)
  }

  // ── Customers (subscribers) ──────────────────────────────────────────────
  // iyzico "subscribers" are customers created through the subscription v2 API.
  // Docs: https://docs.iyzico.com/en/products/subscription/subscription-implementation/subscriber-transactions

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).get<RawIyzicoSubscriberListResponse>(
      ENDPOINTS.customerList,
      {
        ...(params.page != null ? { page: params.page } : {}),
        ...(params.limit != null ? { count: params.limit } : {}),
      },
    )
    assertOk(res)
    return (res.data?.items ?? []).map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawIyzicoSubscriberDetailResponse>(
      ENDPOINTS.customerDetail(id),
    )
    assertOk(res)
    if (!res.data) throw new Error(`iyzico: subscriber ${id} not found`)
    return transformCustomer(res.data)
  }

  // ── Subscriptions ────────────────────────────────────────────────────────
  // Docs: https://docs.iyzico.com/en/products/subscription/subscription-implementation/subscription-transactions

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const res = await this.client(credentials).get<RawIyzicoSubscriptionListResponse>(
      ENDPOINTS.subscriptionList,
      {
        ...(params.page != null ? { page: params.page } : {}),
        ...(params.limit != null ? { count: params.limit } : {}),
      },
    )
    assertOk(res)
    return (res.data?.items ?? []).map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<RawIyzicoSubscriptionDetailResponse>(
      ENDPOINTS.subscriptionDetail(id),
    )
    assertOk(res)
    const item = res.data?.items?.[0]
    if (!item) throw new Error(`iyzico: subscription ${id} not found`)
    return transformSubscription(item)
  }

  // ── Plans (pricing plans) ────────────────────────────────────────────────
  // iyzico pricing plans map to the canonical Plan resource.
  // Listing plans requires a productReferenceCode; getPlan works standalone.
  // Docs: https://docs.iyzico.com/en/products/subscription/subscription-implementation/payment-plan

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const res = await this.client(credentials).get<RawIyzicoPlanDetailResponse>(
      ENDPOINTS.planDetail(id),
    )
    assertOk(res)
    if (!res.data) throw new Error(`iyzico: pricing plan ${id} not found`)
    return transformPlan(res.data)
  }
}
