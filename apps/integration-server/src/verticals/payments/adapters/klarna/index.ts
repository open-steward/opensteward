/**
 * Klarna adapter — payments vertical (BNPL).
 *
 * Klarna's order surface maps to canonical Charge. Installment schedules
 * live on the upstream order payload (Charge.raw); the canonical Charge
 * exposes only the principal (`Charge.amount`).
 *
 * Auth: HTTP Basic from a Klarna Merchant Portal username:password pair,
 * routed against a country-specific host (EU / NA / OC, live or playground).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — no dedicated balance-transaction API; settlement transaction lines exist but do not map 1:1 to the canonical concept
 * Unavailable: customer — no customer management API; Klarna has no endpoint to list or retrieve customer profiles
 * Unavailable: dispute — dispute API v3 endpoints confirmed but exact base path and response field names could not be verified from public docs (API reference pages redirect to 404)
 * Unavailable: invoice — Klarna issues consumer invoices internally as part of BNPL; no merchant-facing invoice management API
 * Unavailable: payment-method — no list-payment-methods endpoint; individual customer token GET exists but requires a known token ID
 * Unavailable: plan — no plan/product catalog API; Klarna has no subscription plan management endpoint
 * Unavailable: subscription — subscriptions are managed via customer tokens; no list/get subscription endpoint exists
 */

import { pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { buildCredentials } from './auth'
import { PAYOUTS_DEFAULT_SIZE, PAYOUTS_MAX_SIZE } from './constants'
import { KlarnaClient } from './client'
import { parseKlarnaWebhookEvents, verifyKlarnaWebhook } from './webhook'

import { transformCharge, type RawKlarnaOrder } from './transform/charge'
import { transformRefund, type RawKlarnaRefund } from './transform/refund'
import { transformPayout, type RawKlarnaPayout, type RawKlarnaPayoutsResponse } from './transform/payout'

export class KlarnaAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'klarna'
  readonly version = '0.1.0'
  /**
   * GET /settlements/v1/payouts: "A maximum of 500 can be set" for `size`.
   * listPayouts pages at it; listCharges makes no request and returns [].
   */
  readonly capabilities = { maxPageSize: PAYOUTS_MAX_SIZE }

  getAuthUrl(): string {
    throw new Error('Klarna uses HTTP Basic; submit credentials via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Klarna uses HTTP Basic; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'region',
        label: 'Region',
        type: 'select',
        required: true,
        options: [
          { value: 'eu_playground', label: 'EU — Playground' },
          { value: 'eu_live', label: 'EU — Live' },
          { value: 'na_playground', label: 'North America — Playground' },
          { value: 'na_live', label: 'North America — Live' },
          { value: 'oc_playground', label: 'Oceania — Playground' },
          { value: 'oc_live', label: 'Oceania — Live' },
        ],
      },
      {
        name: 'username',
        label: 'API username',
        type: 'text',
        required: true,
        helpText: 'Klarna-issued ID in the Merchant Portal (looks like `PK12345_…`).',
      },
      { name: 'password', label: 'API password', type: 'password', required: true },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyKlarnaWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseKlarnaWebhookEvents(payload)
  }

  private client(credentials: Credentials): KlarnaClient {
    return new KlarnaClient(credentials)
  }

  // ── Charges (orders) ─────────────────────────────────────────────────────

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawKlarnaOrder>(
      `/ordermanagement/v1/orders/${id}`,
    )
    return transformCharge(raw)
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    // Klarna has no global "list orders" endpoint — orders are addressed
    // by order_id, distributed by webhooks. v1 surfaces them via getCharge.
    return []
  }

  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    await this.client(credentials).post(`/ordermanagement/v1/orders/${id}/cancel`)
    return this.getCharge(credentials, id)
  }

  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    await this.client(credentials).post(`/ordermanagement/v1/orders/${id}/captures`, {
      captured_amount: data?.amount,
    })
    return this.getCharge(credentials, id)
  }

  // ── Refunds ──────────────────────────────────────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (Klarna order_id) required for refund')
    const raw = await this.client(credentials).post<RawKlarnaRefund>(
      `/ordermanagement/v1/orders/${data.chargeId}/refunds`,
      { refunded_amount: data.amount },
    )
    return transformRefund({ ...raw, order_id: data.chargeId, currency: data.currency })
  }

  // ── Payouts (settlements) ─────────────────────────────────────────────────

  /**
   * Offset paging (https://docs.klarna.com/acquirer/klarna/api/settlements/):
   * `size` ("a default of 20 … A maximum of 500 can be set") and `offset`.
   * The 1-based `page` becomes an offset at the size actually sent. The end
   * comes from `pagination.total` when present (only `count` is required),
   * else from whether `pagination.next` is set.
   */
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const asked = params.limit ?? PAYOUTS_DEFAULT_SIZE
    const size = Math.min(
      Math.max(Math.floor(Number.isFinite(asked) ? asked : 1), 1),
      PAYOUTS_MAX_SIZE,
    )
    const offset = pageOffset(params, size)
    const resp = await this.client(credentials).get<RawKlarnaPayoutsResponse>(
      '/settlements/v1/payouts',
      { size, offset },
    )
    const payouts = resp.payouts ?? []
    const total = resp.pagination?.total
    // An empty page is the end even if `total` still claims rows remain (rows
    // removed between requests); otherwise every later page would report more.
    reportUpstreamPage(params, {
      hasMore:
        payouts.length > 0 &&
        (typeof total === 'number'
          ? offset + payouts.length < total
          : Boolean(resp.pagination?.next)),
      ...(typeof total === 'number' ? { totalCount: total } : {}),
      pageSize: size,
    })
    return payouts.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const raw = await this.client(credentials).get<RawKlarnaPayout>(
      `/settlements/v1/payouts/${id}`,
    )
    return transformPayout(raw)
  }
}
