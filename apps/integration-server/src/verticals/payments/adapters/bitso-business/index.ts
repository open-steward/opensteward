/**
 * Bitso Business adapter — payments vertical (LatAm crypto-rails anchor).
 *
 * Bitso Business is the institutional product behind Bitso, the largest crypto
 * exchange in Latin America. It moves fiat and digital assets across Mexico,
 * Argentina, Brazil and Colombia via SPEI, PIX, and on-chain rails. Its v3 REST
 * API exposes account-level money movement rather than card-style charges, so
 * we map its primitives onto the canonical payments resources:
 *
 *   - fundings    (incoming deposits / pay-ins) → Charges  (list, get)
 *   - withdrawals (outgoing payouts / pay-outs)  → Payouts  (list, get)
 *   - ledger      (account entries)              → BalanceTransactions (list)
 *
 * Bitso has no customer, refund, subscription, invoice, dispute, or
 * plan/price/product resource, so those methods are intentionally absent and
 * the router auto-returns 501 for them.
 *
 * Auth: API-key request-signing — `Authorization: Bitso <key>:<nonce>:<sig>`
 * (HMAC-SHA256 over `nonce + method + path + body`). Collected through the
 * Connect Link form (api key + secret + environment); see `./auth.ts`.
 *
 * Webhooks: Bitso posts `{ event, payload }` notifications for funding /
 * withdrawal status changes but does NOT document a signature scheme, so only
 * `parseWebhookEvents` is implemented (no `verifyWebhook`).
 *
 * Docs: https://docs.bitso.com/bitso-business/docs
 */

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   balance-transaction (ledger), charge (fundings), payout (withdrawals)
// Unverified:  customer — customer management endpoints exist in a gated money-transmitter tier; no public path or response schema accessible
// Unavailable: dispute    — no dispute/chargeback mechanism on crypto/fiat rails
// Unavailable: invoice    — no invoicing concept; Bitso moves funds, not invoices
// Unavailable: payment-method — uses SPEI/PIX/blockchain addresses, not stored payment methods
// Unavailable: plan       — no subscription plan or pricing concept
// Unavailable: refund     — no refund endpoint; fundings (pay-ins) cannot be reversed via API
// Unavailable: subscription — no recurring billing concept

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Payout } from '../../schema/payout'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, PRODUCTION_BASE_URL } from './constants'
import { CREDENTIAL_FORM } from './auth'
import { BitsoClient, type BitsoEnvelope } from './client'

import { transformFunding, type RawBitsoFunding } from './transform/funding'
import { transformWithdrawal, type RawBitsoWithdrawal } from './transform/withdrawal'
import { transformLedger, type RawBitsoLedgerEntry } from './transform/ledger'

const WEBHOOK_RESOURCE_MAP: Record<string, WebhookResourceType> = {
  funding: 'charges',
  withdrawal: 'payouts',
}

const WEBHOOK_ACTION_MAP: Record<string, WebhookAction> = {
  complete: 'succeeded',
  completed: 'succeeded',
  pending: 'created',
  in_progress: 'created',
  processing: 'created',
  failed: 'failed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
}

export class BitsoBusinessAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'bitso-business'
  readonly version = '0.1.0'
  /** Every list endpoint documents `limit` as "Maximum is 100." */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(): string {
    throw new Error(
      'Bitso Business uses API-key request-signing; submit credentials via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Bitso Business uses an API key; call exchangeCredentials instead.')
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

  // ── Webhooks (parse only — no documented signature scheme) ─────────────────

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const event = String(payload['event'] ?? '')
    const body = (payload['payload'] as Record<string, unknown> | undefined) ?? {}
    const resourceId = String(body['fid'] ?? body['wid'] ?? body['id'] ?? '')
    const status = String(body['status'] ?? '').toLowerCase()
    return [
      {
        platform: 'bitso-business',
        type: event,
        resourceType: WEBHOOK_RESOURCE_MAP[event.toLowerCase()] ?? 'unknown',
        action: WEBHOOK_ACTION_MAP[status] ?? 'unknown',
        resourceId,
        payload,
      },
    ]
  }

  // ── Helpers ─────────────────────────────────────────────────────────────--

  private client(credentials: Credentials): BitsoClient {
    return new BitsoClient(credentials)
  }

  /**
   * One page of a Bitso `marker` + `limit` keyset list.
   *
   * Fundings, withdrawals and the ledger all return `{ success, payload }`
   * with no next field: a payload shorter than `limit` is the end, otherwise
   * the next page's `marker` is the last row's id (`fid`, `wid`, `eid`). The
   * sync worker's 1-based `page` is walked through that chain by
   * `pageByCursor`; a caller-supplied `marker`/`cursor` is sent as-is.
   * `limit` is clamped to the documented maximum of 100.
   */
  private async listPage<R extends Record<string, unknown>>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    collection: string,
    idKey: 'fid' | 'wid' | 'eid',
  ): Promise<R[]> {
    const requested = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Number.isFinite(requested) && requested >= 1 ? Math.floor(requested) : DEFAULT_PAGE_SIZE,
    )
    const filters: Record<string, unknown> = {}
    if (typeof params['status'] === 'string') filters.status = params['status']
    if (typeof params['method'] === 'string') filters.method = params['method']

    const client = this.client(credentials)
    const fetch = async (marker: string | undefined) => {
      const query: Record<string, unknown> = { limit, ...filters }
      if (marker !== undefined) query.marker = marker
      const res = await client.get<BitsoEnvelope<R[]>>(path, query)
      const items = res.payload ?? []
      const lastId = items.length === limit ? items[items.length - 1]?.[idKey] : undefined
      // A full page whose last row carries no id cannot be continued: end
      // there rather than re-send the same request.
      const next = typeof lastId === 'string' && lastId !== '' ? lastId : undefined
      return { items, next }
    }

    const explicit = params['marker'] ?? params['cursor']
    let page: { items: R[]; hasMore: boolean }
    if (typeof explicit === 'string' && explicit !== '') {
      const res = await fetch(explicit)
      page = { items: res.items, hasMore: res.next !== undefined }
    } else {
      const account = String(credentials.extra?.['baseUrl'] ?? PRODUCTION_BASE_URL)
      const key = cursorPagerKey(connectionScope(account, credentials), collection, {
        ...filters,
        limit,
      })
      page = await pageByCursor<R, string>(key, params.page, fetch)
    }
    reportUpstreamPage(params, {
      hasMore: page.hasMore,
      ...(limit < requested ? { pageSize: limit } : {}),
    })
    return page.items
  }

  // ── Charges (Bitso fundings / pay-ins) ─────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.listPage<RawBitsoFunding & Record<string, unknown>>(
      credentials,
      params,
      '/v3/fundings/',
      'fundings',
      'fid',
    )
    return rows.map(transformFunding)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<BitsoEnvelope<RawBitsoFunding[]>>(
      `/v3/fundings/${id}/`,
    )
    const funding = (res.payload ?? [])[0] ?? {}
    return transformFunding(funding)
  }

  // ── Payouts (Bitso withdrawals / pay-outs) ─────────────────────────────────

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const rows = await this.listPage<RawBitsoWithdrawal & Record<string, unknown>>(
      credentials,
      params,
      '/v3/withdrawals/',
      'withdrawals',
      'wid',
    )
    return rows.map(transformWithdrawal)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<BitsoEnvelope<RawBitsoWithdrawal[]>>(
      `/v3/withdrawals/${id}/`,
    )
    const withdrawal = (res.payload ?? [])[0] ?? {}
    return transformWithdrawal(withdrawal)
  }

  // ── Balance transactions (Bitso ledger) ────────────────────────────────────

  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    const rows = await this.listPage<RawBitsoLedgerEntry & Record<string, unknown>>(
      credentials,
      params,
      '/v3/ledger/',
      'ledger',
      'eid',
    )
    return rows.map(transformLedger)
  }
}
