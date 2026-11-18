/**
 * Authorize.Net adapter — payments vertical (US SMB gateway).
 *
 * Long-running US gateway (Visa-owned). JSON API at /xml/v1/request.api;
 * every request wraps a single operation key + merchantAuthentication
 * block. Charge.currency defaults to USD (merchant-account default;
 * Authorize.Net does not echo per-transaction currency in responses).
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: balance-transaction — Authorize.Net exposes only batch-level settlement summaries (getSettledBatchListRequest), not per-transaction fee/net records; no balance-transaction concept exists in the API.
// Unavailable: dispute — Authorize.Net has no public API for dispute/chargeback retrieval; chargebacks are managed only via the merchant portal.
// Unavailable: invoice — Authorize.Net has no invoice resource or endpoint; merchants generate invoices outside the gateway.
// Unavailable: payout — Authorize.Net has no payout API; settlement funds are deposited automatically with no API-accessible payout objects.
// Unavailable: plan — Authorize.Net has no plan/product catalog API; ARB subscriptions are configured per-subscription with inline pricing, not via reusable plan objects.

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import { callerLimit, pageLocally, reportUpstreamPage } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import { authBlockFrom, buildCredentials } from './auth'
import { AuthNetClient } from './client'
import { parseAuthorizeNetWebhookEvents, verifyAuthorizeNetWebhook } from './webhook'

import { transformCharge, type RawAuthNetTransaction } from './transform/charge'
import { transformRefund, type RawAuthNetRefund } from './transform/refund'
import { transformCustomer, type RawAuthNetCustomerProfile } from './transform/customer'
import { transformPaymentMethod, type RawAuthNetPaymentProfile } from './transform/payment-method'
import {
  transformSubscriptionDetail,
  transformSubscriptionMasked,
  type RawAuthNetSubscriptionDetail,
  type RawAuthNetSubscriptionMasked,
} from './transform/subscription'

/**
 * ARBGetSubscriptionListRequest paging.limit: "You can request up to 1000
 * subscriptions per page of results." The adapter's other list methods page
 * locally (listPaymentMethods) or serve nothing (listCharges), so this is the
 * adapter-wide maximum.
 */
const MAX_PAGE_SIZE = 1000
/** ARBGetSubscriptionListRequest paging.offset: "Decimal, between 1 and 100000." */
const MAX_PAGE_NUMBER = 100_000

export class AuthorizeNetAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'authorize-net'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error(
      'Authorize.Net uses an API Login ID + Transaction Key; submit via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Authorize.Net uses API credentials; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'sandbox', label: 'Sandbox' },
          { value: 'live', label: 'Production' },
        ],
      },
      { name: 'loginId', label: 'API Login ID', type: 'text', required: true },
      { name: 'transactionKey', label: 'Transaction Key', type: 'password', required: true },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyAuthorizeNetWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseAuthorizeNetWebhookEvents(payload)
  }

  private client(credentials: Credentials): AuthNetClient {
    return new AuthNetClient(credentials)
  }

  // ── Charges ─────────────────────────────────────────────────────────────

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).call<{
      transaction?: RawAuthNetTransaction
    }>('getTransactionDetailsRequest', {
      merchantAuthentication: authBlockFrom(credentials),
      transId: id,
    })
    return transformCharge(res.transaction ?? {})
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    // Authorize.Net's transaction-list endpoint (getTransactionListRequest)
    // is batch-scoped and date-bounded; v1 surfaces transactions via
    // webhooks + getCharge by ID.
    return []
  }

  // ── Refunds ─────────────────────────────────────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (refTransId) required for Authorize.Net refund')
    const res = await this.client(credentials).call<{ transactionResponse?: RawAuthNetRefund }>(
      'createTransactionRequest',
      {
        merchantAuthentication: authBlockFrom(credentials),
        transactionRequest: {
          transactionType: 'refundTransaction',
          amount: ((data.amount ?? 0) / 100).toFixed(2),
          refTransId: data.chargeId,
        },
      },
    )
    return transformRefund({
      ...(res.transactionResponse ?? {}),
      refTransId: data.chargeId,
    })
  }

  // ── Customers (Customer Profiles) ───────────────────────────────────────

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).call<{ profile?: RawAuthNetCustomerProfile }>(
      'getCustomerProfileRequest',
      { merchantAuthentication: authBlockFrom(credentials), customerProfileId: id },
    )
    return transformCustomer(res.profile ?? {})
  }

  // ── Payment Methods (Customer Payment Profiles / CIM) ────────────────────

  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    // Authorize.Net does not support listing all payment profiles globally.
    // Requires a customerProfileId; return empty list when not provided.
    const customerId = (params as Record<string, unknown>)['customerId'] as string | undefined
    if (!customerId) return []
    const res = await this.client(credentials).call<{
      profile?: { paymentProfiles?: RawAuthNetPaymentProfile[] }
    }>('getCustomerProfileRequest', {
      merchantAuthentication: authBlockFrom(credentials),
      customerProfileId: customerId,
    })
    // getCustomerProfileRequest has no paging: one response holds the
    // customer's whole paymentProfiles array, so the caller's page is cut here.
    return pageLocally(
      (res.profile?.paymentProfiles ?? []).map((p) =>
        transformPaymentMethod({ ...p, customerProfileId: customerId }),
      ),
      params,
    )
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    // id format: "customerProfileId:customerPaymentProfileId"
    const [customerProfileId, paymentProfileId] = id.split(':')
    if (!customerProfileId || !paymentProfileId) {
      throw new Error(
        `Authorize.Net: payment method id must be "customerProfileId:paymentProfileId", got "${id}"`,
      )
    }
    const res = await this.client(credentials).call<{
      paymentProfile?: RawAuthNetPaymentProfile
    }>('getCustomerPaymentProfileRequest', {
      merchantAuthentication: authBlockFrom(credentials),
      customerProfileId,
      customerPaymentProfileId: paymentProfileId,
    })
    return transformPaymentMethod({
      ...(res.paymentProfile ?? {}),
      customerProfileId,
    })
  }

  // ── Subscriptions (ARB — Automated Recurring Billing) ────────────────────

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    // ARBGetSubscriptionListRequest pages by page number: despite its name,
    // paging.offset is "The number of the page to return results from"
    // (1-based), and paging.limit is 1..1000. totalNumInResultSet is non-zero
    // "only for the first page of results, that is, if offset equals 1".
    const page = typeof params.page === 'number' && params.page >= 1 ? Math.floor(params.page) : 1
    const asked = Math.max(1, Math.floor(callerLimit(params)))
    const limit = Math.min(asked, MAX_PAGE_SIZE)
    const sized = limit < asked ? { pageSize: limit } : {}
    if (page > MAX_PAGE_NUMBER) {
      // The platform rejects an offset past 100000, so nothing beyond it is
      // reachable: answer empty instead of sending a request that fails.
      reportUpstreamPage(params, { ...sized, hasMore: false })
      return []
    }
    const client = this.client(credentials)
    const fetchPage = (paging: { limit: number; offset: number }) =>
      client.call<{
        subscriptionDetails?: RawAuthNetSubscriptionDetail[]
        totalNumInResultSet?: number | string
      }>('ARBGetSubscriptionListRequest', {
        // Element order matters: the JSON is translated to XML, which
        // requires strict ordering.
        merchantAuthentication: authBlockFrom(credentials),
        searchType: 'subscriptionActive',
        sorting: { orderBy: 'id', orderDescending: false },
        paging,
      })
    const res = await fetchPage({ limit, offset: page })
    const rows = (res.subscriptionDetails ?? []).map((s) => transformSubscriptionDetail(s))
    if (page === 1) {
      // Only offset 1 carries a count, and 0 there means none reported.
      const total = Number(res.totalNumInResultSet ?? 0)
      reportUpstreamPage(params, total > 0 ? { ...sized, totalCount: total } : sized)
    } else if (rows.length < limit) {
      reportUpstreamPage(params, { ...sized, hasMore: false })
    } else {
      // A full later page carries no count. Ask for the count the only way
      // the platform gives one (offset 1, smallest page) so hasMore is exact
      // rather than a guess. Not published as totalCount: it comes from a
      // second request, and page 1 is where the count belongs.
      const probe = await fetchPage({ limit: 1, offset: 1 })
      // The count "Defaults to 0", so a missing or zero count is no count:
      // report no hasMore then, leaving a full page open-ended instead of
      // declaring it the end.
      const total = Number(probe.totalNumInResultSet ?? 0)
      reportUpstreamPage(params, total > 0 ? { ...sized, hasMore: page * limit < total } : sized)
    }
    return rows
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).call<{
      subscription?: RawAuthNetSubscriptionMasked
    }>('ARBGetSubscriptionRequest', {
      merchantAuthentication: authBlockFrom(credentials),
      subscriptionId: id,
      includeTransactions: false,
    })
    return transformSubscriptionMasked(id, res.subscription ?? {})
  }
}
