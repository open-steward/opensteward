/**
 * Circle adapter — payments vertical.
 *
 * Circle Mint is a stablecoin payments platform: merchants accept card / wire /
 * crypto payments that settle into USDC (and EURC) and pay out to bank or
 * blockchain destinations. A "charge" maps to a Circle *payment*; a refund is a
 * payment with `type: 'refund'`; payouts are first-class.
 *
 * Auth: server-side API key sent as `Authorization: Bearer <API_KEY>` (no
 * OAuth). The key is collected through the Connect Link form via the shared
 * `simpleApiKey` template. Every response is wrapped in a `{ data }` envelope;
 * lists are cursor-paginated (`pageSize` + `pageAfter` / `pageBefore`).
 *
 * Resources implemented (only what Circle Mint exposes; the rest auto-501):
 *   - Charges: list, get, create, createRefund  (Payments API)
 *   - Payouts: list, get                         (Payouts API)
 *
 * Circle Mint has no customer resource, and its webhook notifications are
 * signed with an asymmetric ECDSA key fetched per key-id — which does not fit
 * the synchronous HMAC `verifyWebhook(payload, headers, secret)` contract — so
 * neither customers nor webhook verification are implemented here.
 *
 * Docs: https://developers.circle.com/circle-mint
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: balance-transaction — no individual ledger-entry API; only aggregate wallet balances via GET /v1/businessAccount/balances
// Unavailable: customer           — B2B institutional platform with no customer management concept
// Unavailable: dispute            — Cards API removed April 2025; card chargebacks/disputes not supported
// Unavailable: invoice            — no invoice or billing concept
// Unavailable: payment-method     — Cards API removed April 2025; no stored payment-method endpoint
// Unavailable: plan               — no subscription billing or plan concept
// Unavailable: subscription       — no subscription or recurring billing concept

import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  type BaseAdapter,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Payout } from '../../schema/payout'

import { DEFAULT_PAGE_SIZE } from './constants'
import { CREDENTIAL_FORM } from './auth'
import { CircleClient, type CircleEnvelope } from './client'

import { transformCharge, type RawCirclePayment } from './transform/charge'
import { transformRefund, type RawCircleRefund } from './transform/refund'
import { transformPayout, type RawCirclePayout } from './transform/payout'

export class CircleAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'circle'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Circle uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Circle uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return CREDENTIAL_FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return CREDENTIAL_FORM.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): CircleClient {
    return new CircleClient(credentials)
  }

  /**
   * The caller's page of a Circle list, walked by `pageAfter`.
   *
   * Every Mint list is id-keyset paged: `pageAfter` "marks the exclusive begin
   * of a page. When provided, the collection resource will return the next `n`
   * items after the id, with `n` being specified by `pageSize`."
   * (https://developers.circle.com/api-reference/circle-mint/payments/list-payments).
   * The response is a bare `{ data }` with no next token, and `pageSize` may be
   * silently capped: "Some collections have a strict upper bound that will
   * disregard this value." No bound is documented, so a short upstream page
   * does not prove the end; only an empty one does. `pageByRows` therefore
   * follows the last id of every non-empty page and fills the caller's page
   * across capped upstream pages, reporting `hasMore` exactly.
   */
  private async listByPageAfter<R extends { id?: string }, T>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    transform: (raw: R) => T,
  ): Promise<T[]> {
    const pageSize = params.limit ?? DEFAULT_PAGE_SIZE
    const key = cursorPagerKey(connectionScope('circle', credentials), path, { pageSize })
    const client = this.client(credentials)
    const { items } = await pageByRows<T>(
      key,
      params,
      async (pageAfter) => {
        const res = await client.get<CircleEnvelope<R[]>>(path, {
          pageSize,
          ...(pageAfter !== undefined ? { pageAfter } : {}),
        })
        const rows = res.data ?? []
        const last = rows[rows.length - 1]?.id
        return { items: rows.map(transform), next: last ? String(last) : undefined }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  // ── Charges (Payments API) ──────────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    return this.listByPageAfter<RawCirclePayment, Charge>(
      credentials,
      params,
      '/v1/payments',
      transformCharge,
    )
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<CircleEnvelope<RawCirclePayment>>(
      `/v1/payments/${id}`,
    )
    return transformCharge(res.data ?? {})
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    if (data.amount === undefined) throw new Error('amount required to create a Circle payment')
    if (!data.currency) throw new Error('currency required to create a Circle payment')
    if (!data.paymentMethodId) throw new Error('paymentMethodId (source) required to create a Circle payment')
    const body: Record<string, unknown> = {
      amount: { amount: toAmountString(data.amount), currency: data.currency.toUpperCase() },
      source: { id: data.paymentMethodId, type: 'card' },
      autoCapture: data.captured !== false,
    }
    if (data.description) body.description = data.description
    if (data.receiptEmail) body.metadata = { email: data.receiptEmail }
    const res = await this.client(credentials).post<CircleEnvelope<RawCirclePayment>>(
      '/v1/payments',
      body,
    )
    return transformCharge(res.data ?? {})
  }

  // ── Refunds (a payment with type: 'refund') ─────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (payment id) required for Circle refund')
    const body: Record<string, unknown> = {}
    if (data.amount !== undefined) {
      body.amount = {
        amount: toAmountString(data.amount),
        currency: (data.currency ?? 'USD').toUpperCase(),
      }
    }
    const res = await this.client(credentials).post<CircleEnvelope<RawCircleRefund>>(
      `/v1/payments/${data.chargeId}/refund`,
      body,
    )
    return transformRefund(res.data ?? {}, data.chargeId)
  }

  // ── Payouts ─────────────────────────────────────────────────────────────

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    return this.listByPageAfter<RawCirclePayout, Payout>(
      credentials,
      params,
      '/v1/payouts',
      transformPayout,
    )
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<CircleEnvelope<RawCirclePayout>>(
      `/v1/payouts/${id}`,
    )
    return transformPayout(res.data ?? {})
  }
}

/**
 * The canonical schema carries amounts as integer minor units; Circle expects a
 * decimal major-unit string (`314` → `"3.14"`). Inverse of `toMinorUnits`.
 */
function toAmountString(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2)
}
