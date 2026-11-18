/**
 * Nuvei adapter — payments vertical.
 *
 * Nuvei (formerly SafeCharge) is a global card + APM gateway. This adapter
 * targets the REST 1.0 server-to-server API: a JSON-over-HTTPS surface of
 * `.do` actions signed per-request with a SHA-256 checksum (no OAuth, no
 * bearer token). The merchant supplies `merchantId`, `merchantSiteId`,
 * `merchantSecretKey`, and an environment via the Connect Link form.
 *
 * Supported canonical resources map to Nuvei transaction actions:
 *   - createCharge   → payment.do              (Sale/Auth)
 *   - captureCharge  → settleTransaction.do    (capture an Auth)
 *   - cancelCharge   → voidTransaction.do      (void an un-settled Auth)
 *   - getCharge      → getPaymentStatus.do     (status of the open session)
 *   - createRefund   → refundTransaction.do    (referenced credit)
 *   - getCustomer    → getUserDetails.do       (user profile by userTokenId)
 *   - listPaymentMethods → getUserUPOs.do      (UPOs for a user)
 *   - listSubscriptions  → getSubscriptionsList.do
 *   - listPlans / getPlan → getPlansList.do
 *   - getPayout          → getPayoutStatus.do
 *
 * Auth: api_key (merchantId + merchantSiteId + merchantSecretKey checksum).
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: balance-transaction — Nuvei REST 1.0 has no ledger/balance-transaction endpoint; settlement reporting is only accessible via the Control Panel.
 * Unavailable: invoice — Nuvei has no invoice concept in its S2S REST API; billing is subscription-based with no invoice objects.
 * Unavailable: dispute — Nuvei does not expose a chargeback/dispute REST API; disputes are managed exclusively through the Nuvei Control Panel.
 */

import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Payout } from '../../schema/payout'
import type { Plan } from '../../schema/plan'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import {
  ENDPOINT_CANCEL_SUBSCRIPTION,
  ENDPOINT_GET_PAYMENT_STATUS,
  ENDPOINT_GET_PAYOUT_STATUS,
  ENDPOINT_GET_SUBSCRIPTIONS_LIST,
  ENDPOINT_GET_PLANS_LIST,
  ENDPOINT_GET_USER_DETAILS,
  ENDPOINT_GET_USER_UPOS,
  ENDPOINT_PAYMENT,
  ENDPOINT_REFUND_TRANSACTION,
  ENDPOINT_SETTLE_TRANSACTION,
  ENDPOINT_VOID_TRANSACTION,
  DEFAULT_PAGE_SIZE,
  REBILLING_TIMESTAMP_OFFSET_HOURS,
  SUBSCRIPTIONS_LIST_MAX_PAGE_SIZE,
} from './constants'
import { NUVEI_CREDENTIAL_FIELDS, buildCredentials } from './auth'
import { NuveiClient } from './client'
import { parseNuveiWebhookEvents, verifyNuveiWebhook } from './webhook'

import { transformCharge, type RawNuveiTransaction } from './transform/charge'
import { transformRefund, type RawNuveiRefund } from './transform/refund'
import { transformCustomer, type RawNuveiGetUserDetailsResponse } from './transform/customer'
import {
  transformPaymentMethod,
  type RawNuveiGetUserUPOsResponse,
  type RawNuveiUPO,
} from './transform/payment-method'
import {
  transformSubscription,
  type RawNuveiGetSubscriptionsListResponse,
  type RawNuveiSubscription,
} from './transform/subscription'
import {
  transformPlan,
  type RawNuveiGetPlansListResponse,
  type RawNuveiPlan,
} from './transform/plan'
import { transformPayout, type RawNuveiPayout } from './transform/payout'

/** A whole number ≥ 1 from `value`, or `fallback` when it is not one. */
function wholeOr(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n >= 1 ? n : fallback
}

/** A finite number read from a numeric or numeric-string field, else undefined. */
function numericField(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

/** Nuvei money on the wire is a decimal major-unit string (e.g. "10.50"). */
function toMajorUnitString(minor: number | undefined): string | undefined {
  if (minor === undefined) return undefined
  return (minor / 100).toFixed(2)
}

export class NuveiAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'nuvei'
  readonly version = '0.1.0'

  // ── Auth ────────────────────────────────────────────────────────────────

  getAuthUrl(): string {
    throw new Error(
      'Nuvei uses a merchant-secret checksum; submit credentials via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Nuvei does not use OAuth; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return NUVEI_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static merchant secret — nothing to refresh.
    return credentials
  }

  // ── Webhooks (DMN) ────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyNuveiWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseNuveiWebhookEvents(payload)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private client(credentials: Credentials): NuveiClient {
    return new NuveiClient(credentials)
  }

  // ── Charges ───────────────────────────────────────────────────────────────

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    // `getPaymentStatus` reports on the most recent transaction of the open
    // session; `id` is echoed back so the caller can correlate.
    const res = await this.client(credentials).post<RawNuveiTransaction>(
      ENDPOINT_GET_PAYMENT_STATUS,
      { sessionToken: id },
    )
    return transformCharge({ ...res, transactionId: res.transactionId ?? id })
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const amount = toMajorUnitString(data.amount)
    const currency = data.currency?.toUpperCase() ?? ''
    if (!amount || !currency) {
      throw new Error('Nuvei createCharge requires amount and currency.')
    }
    // payment.do checksum order (after the common prefix/suffix): amount, currency.
    const res = await this.client(credentials).post<RawNuveiTransaction>(
      ENDPOINT_PAYMENT,
      {
        amount,
        currency,
        ...(data.paymentMethodId ? { userTokenId: data.paymentMethodId } : {}),
        ...(data.description ? { merchantDetails: { customField1: data.description } } : {}),
      },
      [amount, currency],
    )
    return transformCharge(res)
  }

  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const amount = toMajorUnitString(data?.amount)
    const body: Record<string, unknown> = { relatedTransactionId: id }
    if (amount) body.amount = amount
    // settleTransaction.do checksum order: relatedTransactionId, [amount].
    const checksumFields: Array<string | number> = amount ? [id, amount] : [id]
    const res = await this.client(credentials).post<RawNuveiTransaction>(
      ENDPOINT_SETTLE_TRANSACTION,
      body,
      checksumFields,
    )
    return transformCharge({ ...res, transactionType: res.transactionType ?? 'Settle' })
  }

  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    // voidTransaction.do checksum order: relatedTransactionId.
    const res = await this.client(credentials).post<RawNuveiTransaction>(
      ENDPOINT_VOID_TRANSACTION,
      { relatedTransactionId: id },
      [id],
    )
    return transformCharge({ ...res, transactionType: res.transactionType ?? 'Void' })
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId)
      throw new Error('Nuvei createRefund requires chargeId (relatedTransactionId).')
    const amount = toMajorUnitString(data.amount)
    const currency = data.currency?.toUpperCase() ?? ''
    if (!amount || !currency) {
      throw new Error('Nuvei createRefund requires amount and currency.')
    }
    // refundTransaction.do checksum order: amount, currency, relatedTransactionId.
    const res = await this.client(credentials).post<RawNuveiRefund>(
      ENDPOINT_REFUND_TRANSACTION,
      { amount, currency, relatedTransactionId: data.chargeId },
      [amount, currency, data.chargeId],
    )
    return transformRefund({
      ...res,
      relatedTransactionId: res.relatedTransactionId ?? data.chargeId,
    })
  }

  // ── Customers ─────────────────────────────────────────────────────────────
  // Nuvei identifies users by a merchant-assigned `userTokenId`. `getCustomer`
  // maps id → userTokenId and calls getUserDetails.do.

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    // getUserDetails.do checksum order: merchantId, merchantSiteId, userTokenId, timeStamp
    // — userTokenId is the only method-specific field.
    const res = await this.client(credentials).post<RawNuveiGetUserDetailsResponse>(
      ENDPOINT_GET_USER_DETAILS,
      { userTokenId: id },
      [id],
    )
    return transformCustomer({ ...res, userTokenId: res.userTokenId ?? id })
  }

  // ── Payment Methods ───────────────────────────────────────────────────────
  // Nuvei stores saved payment methods as UPOs (User Payment Options).
  // getUserUPOs.do requires a `userTokenId`; we use params.customerId when
  // present, otherwise params.userId, falling back to an empty string.
  // The endpoint has no paging fields and returns every UPO of the user
  // (https://docs.nuvei.com/api/advanced/indexAdvanced.html#getuserupos), so
  // the caller's page is sliced from that whole list.

  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const userTokenId =
      ((params as Record<string, unknown>).customerId as string | undefined) ??
      ((params as Record<string, unknown>).userId as string | undefined) ??
      ''
    // getUserUPOs.do checksum order: userTokenId is the only method field.
    const res = await this.client(credentials).post<RawNuveiGetUserUPOsResponse>(
      ENDPOINT_GET_USER_UPOS,
      { userTokenId },
      [userTokenId],
    )
    const upos: RawNuveiUPO[] = res.paymentMethods ?? []
    return pageLocally(
      upos.map((u) => transformPaymentMethod(u, userTokenId)),
      params,
    )
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  /**
   * getSubscriptionsList.do pages by offset: the request takes `firstResult`
   * and `maxResults` (typed ^String), the response carries `total`, and "a
   * maximum of 1000 results per call can be displayed at one time" —
   * https://docs.nuvei.com/api/advanced/indexAdvanced.html#getsubscriptionslist.
   * The docs' parameter table spells the offset `firstResults`; the request
   * example (and getPlansList's table) say `firstResult`, which is used here.
   * Neither field is part of the documented checksum.
   */
  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const size = Math.min(
      wholeOr(params.limit ?? SUBSCRIPTIONS_LIST_MAX_PAGE_SIZE, 1),
      SUBSCRIPTIONS_LIST_MAX_PAGE_SIZE,
    )
    const offset = pageOffset(params, size)
    const res = await this.client(credentials).post<RawNuveiGetSubscriptionsListResponse>(
      ENDPOINT_GET_SUBSCRIPTIONS_LIST,
      { firstResult: String(offset), maxResults: String(size) },
    )
    const subs: RawNuveiSubscription[] =
      res.subscriptions ?? (res.subscription ? [res.subscription] : [])
    const total = numericField(res.total)
    reportUpstreamPage(params, {
      ...(total !== undefined ? { totalCount: total, hasMore: offset + subs.length < total } : {}),
      pageSize: size,
    })
    return subs.map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).post<RawNuveiGetSubscriptionsListResponse>(
      ENDPOINT_GET_SUBSCRIPTIONS_LIST,
      { subscriptionId: id },
    )
    const sub: RawNuveiSubscription | undefined = (res.subscriptions ?? [])[0] ?? res.subscription
    if (!sub) throw new Error(`Nuvei: subscription ${id} not found.`)
    return transformSubscription(sub)
  }

  async cancelSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    // cancelSubscription.do checksum order: subscriptionId is the only method field.
    await this.client(credentials).post(ENDPOINT_CANCEL_SUBSCRIPTION, { subscriptionId: id }, [id])
    // Re-fetch to return the updated record.
    return this.getSubscription(credentials, id)
  }

  // ── Plans ─────────────────────────────────────────────────────────────────

  /**
   * getPlansList.do pages by offset — the example request sends
   * `"firstResult": "0"` and `"maxResults": "10"` and the example response
   * carries `"total": 1` beside the `plans` array
   * (https://docs.nuvei.com/api/advanced/indexAdvanced.html#getplanslist).
   * The parameter table spells the size `maxResult`; the example request and
   * getSubscriptionsList say `maxResults`, which is sent here. No maximum page
   * size is documented, so the caller's limit is sent as asked.
   *
   * The request carries no filter, so the documented checksum "merchantId,
   * merchantSiteId, planIds, currency, planStatus, timeStamp,
   * merchantSecretKey" reduces to merchantId, merchantSiteId, timeStamp (the
   * hashing guide: fields not sent are left out of the concatenation), and
   * no clientRequestId is sent or signed.
   */
  private async plansPage(
    credentials: Credentials,
    offset: number,
    size: number,
  ): Promise<{ plans: RawNuveiPlan[]; total: number | undefined }> {
    const res = await this.client(credentials).postWithoutRequestId<RawNuveiGetPlansListResponse>(
      ENDPOINT_GET_PLANS_LIST,
      { firstResult: String(offset), maxResults: String(size) },
      [],
      REBILLING_TIMESTAMP_OFFSET_HOURS,
    )
    if (res.status !== undefined && res.status !== 'SUCCESS') {
      throw new Error(`Nuvei getPlansList failed: ${res.reason ?? res.status}`)
    }
    return { plans: res.plans ?? [], total: numericField(res.total) }
  }

  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const size = wholeOr(params.limit ?? DEFAULT_PAGE_SIZE, 1)
    const offset = pageOffset(params, size)
    const { plans, total } = await this.plansPage(credentials, offset, size)
    if (total !== undefined) {
      reportUpstreamPage(params, { totalCount: total, hasMore: offset + plans.length < total })
    }
    return plans.map(transformPlan)
  }

  /**
   * getPlansList.do is the only documented plan read, and filtering it by
   * `planIds` would put an array into the checksum, whose concatenation the
   * docs do not define. So the unfiltered list is walked by offset until the
   * plan turns up or `total` is reached.
   */
  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    let offset = 0
    for (;;) {
      const { plans, total } = await this.plansPage(credentials, offset, DEFAULT_PAGE_SIZE)
      const hit = plans.find((p) => p.planId !== undefined && String(p.planId) === id)
      if (hit) return transformPlan(hit)
      offset += plans.length
      if (plans.length === 0 || total === undefined || offset >= total) break
    }
    throw Object.assign(new Error(`Nuvei: plan ${id} not found.`), { statusCode: 404 })
  }

  // ── Payouts ───────────────────────────────────────────────────────────────

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    // getPayoutStatus.do checksum order: clientUniqueId is the only method field.
    const res = await this.client(credentials).post<RawNuveiPayout>(
      ENDPOINT_GET_PAYOUT_STATUS,
      { clientUniqueId: id },
      [id],
    )
    return transformPayout({ ...res, transactionId: res.transactionId ?? id })
  }
}
