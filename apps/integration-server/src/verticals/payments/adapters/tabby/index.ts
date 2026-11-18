/**
 * Tabby adapter — payments vertical (buy-now-pay-later, MENA anchor).
 *
 * Tabby is payment-centric: a **payment** (`GET /api/v2/payments/{id}`) carries
 * the amount, currency, buyer, order, and the authorize → capture → refund
 * lifecycle, so it maps onto the canonical **Charge**. Captures and refunds are
 * taken against a payment; both return the whole payment object, which the
 * adapter re-reads to surface the canonical view.
 *
 * Auth: a static secret-key bearer token (`Authorization: Bearer <secret_key>`).
 * Tabby derives test-vs-live from the key; the merchant only picks a region
 * (AE/KW `.ai` vs. KSA `.sa`) on the Connect form, stashed on
 * `credentials.extra.region`.
 *
 * Webhooks: Tabby echoes a merchant-configured custom header value on every
 * delivery; we verify it by constant-time comparison (see webhook.ts).
 *
 * Docs: https://docs.tabby.ai/api-reference/overview
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — Tabby has no balance/ledger transaction API
 * Unavailable: customer — buyer is embedded in the payment object; no standalone customer resource
 * Unavailable: invoice — Tabby has no invoice concept in its API
 * Unavailable: payment-method — Tabby has no payment method management API
 * Unavailable: payout — Tabby has no payout/settlement API
 * Unavailable: plan — Tabby is BNPL only; no subscription plan/pricing API
 * Unavailable: subscription — Tabby is BNPL only; no recurring subscription API
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Dispute } from '../../schema/dispute'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import {
  DEFAULT_PAGE_SIZE,
  DISPUTES_PATH,
  MAX_PAGE_SIZE,
  PAYMENTS_PATH,
  paymentPath,
  paymentCapturesPath,
  paymentRefundsPath,
} from './constants'
import { TabbyCredentialForm } from './auth'
import { TabbyClient } from './client'
import { parseTabbyWebhookEvents, verifyTabbyWebhook } from './webhook'

import { transformCharge, type RawTabbyPayment, type RawTabbyRefundEntry } from './transform/charge'
import { transformRefund } from './transform/refund'
import { transformDispute, type RawTabbyDispute, type RawTabbyDisputeList } from './transform/dispute'
import { pickCurrency, toMajorString } from './transform/shared'

/** GET /api/v2/payments: `{ payments, pagination: { limit, offset, total_count } }`. */
interface RawTabbyPaymentList {
  payments?: RawTabbyPayment[] | null
  pagination?: { limit?: number; offset?: number; total_count?: number }
}

export class TabbyAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'tabby'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Tabby uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Tabby uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return TabbyCredentialForm.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return TabbyCredentialForm.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static secret key — nothing to refresh.
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyTabbyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseTabbyWebhookEvents(payload)
  }

  private client(credentials: Credentials): TabbyClient {
    return new TabbyClient(credentials)
  }

  // ── Charges (Tabby payments) ────────────────────────────────────────────────
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    // Tabby pages by `limit` (maximum 20) + `offset` (0-based). The caller's
    // page is placed by the size actually sent, so a limit above 20 walks in
    // strides of 20, and that size is reported so the router judges a full
    // page against 20. Not an adapter-wide maxPageSize: listDisputes has a
    // fixed upstream batch and pages by rows instead.
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const offset = pageOffset(params, limit)
    const res = await this.client(credentials).get<RawTabbyPaymentList | RawTabbyPayment[]>(
      PAYMENTS_PATH,
      { limit, offset },
    )
    // Documented as `{ payments, pagination }`; a bare array is still accepted.
    const rows = Array.isArray(res) ? res : (res?.payments ?? [])
    const total = Array.isArray(res) ? undefined : res?.pagination?.total_count
    reportUpstreamPage(params, {
      pageSize: limit,
      ...(typeof total === 'number'
        ? { totalCount: total, hasMore: offset + rows.length < total }
        : {}),
    })
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawTabbyPayment>(paymentPath(id))
    return transformCharge(res ?? {})
  }

  /** Capture an authorized payment, then return the refreshed canonical view. */
  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const current = await this.client(credentials).get<RawTabbyPayment>(paymentPath(id))
    const currency = pickCurrency(current?.currency)
    // Default to the full outstanding amount when no partial amount is given.
    const amount = data?.amount != null ? toMajorString(data.amount, currency) : current?.amount
    const updated = await this.client(credentials).post<RawTabbyPayment>(paymentCapturesPath(id), {
      amount,
    })
    return transformCharge(updated ?? current ?? {})
  }

  /**
   * Tabby has no dedicated void endpoint; an uncaptured authorization is
   * released by closing it. Re-fetch to surface the cancelled charge.
   */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    await this.client(credentials).post(paymentPath(id) + '/close', {})
    return this.getCharge(credentials, id)
  }

  // ── Refunds (POST /api/v2/payments/{id}/refunds) ────────────────────────────
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const paymentId = data.chargeId
    if (!paymentId) throw new Error('chargeId (Tabby payment id) is required for a refund')

    // Resolve currency: prefer the caller's, else read it from the payment.
    let currency = data.currency
    if (!currency) {
      const payment = await this.client(credentials).get<RawTabbyPayment>(paymentPath(paymentId))
      currency = pickCurrency(payment?.currency)
    }

    const referenceId = `refund-${Date.now()}`
    const updated = await this.client(credentials).post<RawTabbyPayment>(
      paymentRefundsPath(paymentId),
      {
        amount: toMajorString(data.amount, currency),
        reference_id: referenceId,
        reason: data.reason,
      },
    )

    // The refund endpoint returns the whole payment; resolve the entry we
    // just created (by our idempotency key, else the newest one).
    const refunds = updated?.refunds ?? []
    const created: RawTabbyRefundEntry =
      refunds.find((r) => r.reference_id === referenceId) ??
      refunds[refunds.length - 1] ??
      { amount: toMajorString(data.amount, currency), reference_id: referenceId, reason: data.reason }

    return transformRefund(created, { paymentId, currency })
  }

  // ── Disputes (GET /api/v1/disputes) ─────────────────────────────────────────
  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    // Tabby returns disputes in fixed batches of 100 with no size parameter,
    // and the next batch by the opaque `next_page_token` (empty on the last
    // page). One batch is not one caller page, so the caller's page is cut
    // from the batches. The region picks the host, so it is part of the key.
    const region = (credentials.extra as { region?: string } | undefined)?.region ?? 'ae'
    const key = cursorPagerKey(connectionScope(`tabby:${region}`, credentials), DISPUTES_PATH, {})
    const client = this.client(credentials)
    const { items } = await pageByRows<Dispute>(
      key,
      params,
      async (pageToken) => {
        const res = await client.get<RawTabbyDisputeList>(DISPUTES_PATH, {
          ...(pageToken !== undefined ? { page_token: pageToken } : {}),
        })
        return {
          items: (res?.disputes ?? []).map(transformDispute),
          next: res?.next_page_token || undefined,
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const res = await this.client(credentials).get<RawTabbyDispute>(`/api/v1/disputes/${id}`)
    return transformDispute(res ?? {})
  }
}
