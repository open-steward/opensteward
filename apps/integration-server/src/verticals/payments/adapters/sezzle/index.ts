/**
 * Sezzle adapter — payments vertical (buy-now-pay-later, US/CA anchor).
 *
 * Sezzle is order-centric: an **Order** carries the amount, currency,
 * customer, and the authorize → capture → refund / release lifecycle, so it
 * maps onto the canonical **Charge**. Refunds and captures are taken against
 * an order; both return only a uuid, so the adapter re-fetches the order to
 * return the full canonical object. Tokenized **customers** are a first-class
 * resource.
 *
 * Auth: a public/private key pair (minted per-environment in the Sezzle
 * dashboard) is exchanged at `/v2/authentication` for a short-lived bearer
 * token (~120 min). The originating keys + chosen environment are stashed on
 * `credentials.extra` so the token can be re-minted on refresh and the private
 * key reached for webhook verification.
 *
 * Webhooks: HMAC-SHA256 over the raw body, keyed on the merchant private key,
 * in the `Sezzle-Signature` header (see webhook.ts).
 *
 * Methods deliberately left off (auto-501): list/get charges (Sezzle has no
 * order-list endpoint and an order is fetched by its uuid), standalone
 * refund list/get, payment methods, subscriptions, invoices, disputes,
 * plans/prices/products, and balance transactions — Sezzle either does not
 * expose them or models them differently.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: balance-transaction — No balance-transaction list endpoint; GET /v2/interest/balance returns a single scalar, not a transaction history
// Unavailable: dispute — Sezzle has no dispute/chargeback API endpoint; chargebacks appear only in settlement CSV reports
// Unavailable: invoice — Sezzle has no invoice concept or endpoint
// Unavailable: payment-method — Sezzle is BNPL-only; tokenized customers carry no card data; no dedicated payment-method endpoint
// Unavailable: plan — Sezzle has no subscription plans or recurring billing
// Unavailable: subscription — Sezzle has no subscription concept or endpoint

import { connectionScope, cursorPagerKey, pageByRows, pageLocally } from '@opensteward/shared'
import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import {
  CUSTOMERS_PATH,
  SETTLEMENTS_DEFAULT_START_DATE,
  SETTLEMENTS_PAGE_SIZE,
  SETTLEMENTS_SUMMARIES_PATH,
  customerPath,
  orderPath,
  orderCapturePath,
  orderReleasePath,
  orderRefundPath,
} from './constants'
import {
  SEZZLE_CREDENTIAL_FIELDS,
  type SezzleCredentialExtra,
  exchangeSezzleCredentials,
  refreshSezzleCredentials,
} from './auth'
import { SezzleClient } from './client'
import { parseSezzleWebhookEvents, verifySezzleWebhook } from './webhook'

import { transformCustomer, type RawSezzleCustomer } from './transform/customer'
import { transformCharge, orderCurrency, type RawSezzleOrder } from './transform/charge'
import { transformPayout, type RawSezzleSettlementSummary } from './transform/payout'
import { transformRefund, type RawSezzleRefundResponse } from './transform/refund'

export class SezzleAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'sezzle'
  readonly version = '0.1.0'
  /**
   * Settlement summaries come at most 30 to a response; customers are
   * unpaged and sliced locally, so every list honours this maximum.
   */
  readonly capabilities = { maxPageSize: SETTLEMENTS_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('Sezzle uses API keys; submit them via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Sezzle uses API keys; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return SEZZLE_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeSezzleCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshSezzleCredentials(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySezzleWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSezzleWebhookEvents(payload)
  }

  private client(credentials: Credentials): SezzleClient {
    return new SezzleClient(credentials)
  }

  // ── Charges (Sezzle Orders) ─────────────────────────────────────────────────
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawSezzleOrder>(orderPath(id))
    return transformCharge(res ?? {})
  }

  /** Capture an authorized order, then re-fetch it for the canonical view. */
  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const order = await this.client(credentials).get<RawSezzleOrder>(orderPath(id))
    const currency = orderCurrency(order ?? {})
    const amount = data?.amount ?? order?.order_amount?.amount_in_cents
    await this.client(credentials).post(orderCapturePath(id), {
      capture_amount: { amount_in_cents: amount, currency },
    })
    return this.getCharge(credentials, id)
  }

  /** Release (void) an uncaptured authorization, then re-fetch the order. */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    await this.client(credentials).post(orderReleasePath(id), {})
    return this.getCharge(credentials, id)
  }

  // ── Refunds (POST /v2/order/{uuid}/refund) ──────────────────────────────────
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const orderId = data.chargeId
    if (!orderId) throw new Error('chargeId (Sezzle order uuid) is required for a refund')

    // Resolve currency: prefer the caller's, else read it from the order.
    let currency = data.currency
    if (!currency) {
      const order = await this.client(credentials).get<RawSezzleOrder>(orderPath(orderId))
      currency = orderCurrency(order ?? {})
    }

    const res = await this.client(credentials).post<RawSezzleRefundResponse>(
      orderRefundPath(orderId),
      { amount_in_cents: data.amount, currency },
    )
    return transformRefund(res ?? {}, {
      orderId,
      amountInCents: data.amount,
      currency,
      reason: data.reason,
    })
  }

  // ── Payouts (settlement summaries) ─────────────────────────────────────────
  /**
   * `offset` is a row skip and every response holds up to 30 rows, with no
   * size parameter, so one upstream page is not one caller page.
   * `pageByRows` walks the fixed 30-row windows (the next one starts after
   * the rows the last one returned; a short window is the end) and cuts the
   * caller's rows out of them, peeking at the next window when a page ends on
   * a boundary, so `hasMore` is exact.
   */
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const client = this.client(credentials)
    const extra = credentials.extra as Partial<SezzleCredentialExtra> | undefined
    const account = `${extra?.environment ?? 'production'}:${extra?.publicKey ?? 'sezzle'}`
    const startDate = SETTLEMENTS_DEFAULT_START_DATE
    const key = cursorPagerKey(connectionScope(account, credentials), 'settlement-summaries', {
      startDate,
      window: SETTLEMENTS_PAGE_SIZE,
    })
    const { items } = await pageByRows<RawSezzleSettlementSummary, number>(
      key,
      params,
      async (cursor) => {
        const offset = cursor ?? 0
        const res = await client.get<RawSezzleSettlementSummary[]>(SETTLEMENTS_SUMMARIES_PATH, {
          'start-date': startDate,
          offset,
        })
        const rows = Array.isArray(res) ? res : []
        return {
          items: rows,
          next: rows.length >= SETTLEMENTS_PAGE_SIZE ? offset + rows.length : undefined,
        }
      },
      { defaultLimit: SETTLEMENTS_PAGE_SIZE },
    )
    return items.map(transformPayout)
  }

  // ── Customers (tokenized) ───────────────────────────────────────────────────
  /** `GET /v2/customer` takes no parameters and returns every customer. */
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).get<RawSezzleCustomer[]>(CUSTOMERS_PATH)
    return pageLocally(Array.isArray(res) ? res : [], params).map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawSezzleCustomer>(customerPath(id))
    return transformCustomer(res ?? {})
  }
}
