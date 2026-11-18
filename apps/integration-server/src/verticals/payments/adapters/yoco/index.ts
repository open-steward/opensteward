/**
 * Yoco adapter — payments vertical.
 *
 * Reads go to the Yoco API (https://api.yoco.com), whose first-party spec is
 * https://developer.yoco.com/openapi/yoco-api-reference.json. Auth is a Yoco
 * API key sent as a bearer token.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * charge             — GET /v1/payments/, GET /v1/payments/{payment_id}
 * refund             — GET /v1/refunds/
 * payout             — GET /v1/payouts/, GET /v1/payouts/{payout_id}
 * balance-transaction — GET /v1/payouts/{payout_id}/payout_entries, over every payout
 * Unavailable: customer       — neither Yoco spec has a customer path
 * Unavailable: dispute        — Yoco API has no disputes endpoint
 * Unavailable: invoice        — Yoco API has no invoices endpoint
 * Unavailable: payment-method — Yoco API has no payment-methods endpoint
 * Unavailable: plan           — Yoco API has no plans endpoint
 * Unavailable: subscription   — Yoco API has no subscription-billing endpoint (webhook subscriptions only)
 *
 * ── Paging ─────────────────────────────────────────────────────────
 * https://developer.yoco.com/docs/api/pagination.md: "If the `next_cursor` is
 * `null`, there are no more records to fetch." and "To fetch the next page of
 * data, provide the `cursor` value from the previous response as a query
 * parameter." Every list takes `limit` 1..100 (default 50).
 *
 * `updatedAfter` is not sent. The only documented filters are
 * `updated_at__gte`/`__lte`, and "If only one bound is provided, the other is
 * automatically set 31 days away", so a lone lower bound would silently
 * truncate the list to 31 days.
 */

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { YocoClient } from './client'
import { verifyYocoWebhook, parseYocoWebhookEvents } from './webhook'

import { transformCharge, type RawYocoPayment } from './transform/charge'
import { transformRefund, type RawYocoRefund } from './transform/refund'
import { transformPayout, type RawYocoPayout } from './transform/payout'
import { transformPayoutEntry, type RawYocoPayoutEntry } from './transform/balance-transaction'

/** `PaginatedResponse_*` in the spec: `"required":["data","next_cursor"]`. */
interface YocoPage<T> {
  data: T[]
  next_cursor: string | null
}

/** A documented page envelope, or a clear error for anything else. */
function readPage<T>(res: YocoPage<T>, path: string): YocoPage<T> {
  if (!res || !Array.isArray(res.data)) throw new Error(`Yoco ${path}: response has no data array`)
  return res
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** Position in the payout-entries stream: a payout page, a payout on it, and an entries cursor. */
interface EntryCursor {
  payouts?: string
  index: number
  entries?: string
}

export class YocoAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'yoco'
  readonly version = '0.2.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('Yoco uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Yoco uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'Yoco API key',
        type: 'password',
        required: true,
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
    return verifyYocoWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseYocoWebhookEvents(payload)
  }

  private client(credentials: Credentials): YocoClient {
    return new YocoClient(credentials)
  }

  private scope(credentials: Credentials): string {
    return connectionScope('yoco', credentials)
  }

  /**
   * One caller page of a documented cursor list: the caller's limit clamped to
   * 100, page N reached through the cursor pager, `hasMore` from `next_cursor`.
   */
  private async listPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const client = this.client(credentials)
    const asked = Math.max(1, Math.floor(Number(params.limit)) || DEFAULT_PAGE_SIZE)
    const limit = Math.min(asked, MAX_PAGE_SIZE)
    if (limit < asked) reportUpstreamPage(params, { pageSize: limit })
    const page = Math.max(1, Math.floor(Number(params.page)) || 1)
    const result = await pageByCursor<T, string>(
      cursorPagerKey(this.scope(credentials), path, { limit }),
      page,
      async (cursor) => {
        const res = readPage(
          await client.get<YocoPage<T>>(path, { limit, ...(cursor ? { cursor } : {}) }),
          path,
        )
        return { items: res.data, next: res.next_cursor ?? undefined }
      },
    )
    reportUpstreamPage(params, { hasMore: result.hasMore })
    return result.items
  }

  async listCustomers(): Promise<Customer[]> {
    throw notSupported(
      'Yoco cannot list customers: neither the Yoco API nor the Checkout API documents a customer endpoint',
    )
  }

  async getCustomer(): Promise<Customer> {
    throw notSupported(
      'Yoco cannot get a customer: neither the Yoco API nor the Checkout API documents a customer endpoint',
    )
  }

  /** GET /v1/payments/ — "List payments", scope `business/orders:read`. */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.listPage<RawYocoPayment>(credentials, '/v1/payments/', params)
    return rows.map(transformCharge)
  }

  /** GET /v1/payments/{payment_id} — "Fetch a payment". */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawYocoPayment>(
      `/v1/payments/${encodeURIComponent(id)}`,
    )
    return transformCharge(raw)
  }

  /** GET /v1/refunds/ — "List refunds", scope `business/orders:read`. */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const rows = await this.listPage<RawYocoRefund>(credentials, '/v1/refunds/', params)
    return rows.map(transformRefund)
  }

  // Out of scope for the read rebuild: POST /refunds is not a documented path
  // on the Yoco API (the Checkout API refunds via POST /api/checkouts/{id}/refund).
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawYocoRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? ({} as RawYocoRefund))
  }

  /** GET /v1/payouts/ — "List payouts", scope `business/payouts:read`. */
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const rows = await this.listPage<RawYocoPayout>(credentials, '/v1/payouts/', params)
    return rows.map(transformPayout)
  }

  /** GET /v1/payouts/{payout_id} — "Fetch a payout". */
  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const raw = await this.client(credentials).get<RawYocoPayout>(
      `/v1/payouts/${encodeURIComponent(id)}`,
    )
    return transformPayout(raw)
  }

  /**
   * Payout entries of every payout, as one stream: GET /v1/payouts/ walked by
   * cursor, and for each payout GET /v1/payouts/{payout_id}/payout_entries
   * walked by cursor, both at the documented maximum of 100. The caller's page
   * is cut from that stream by `pageByRows`, so `hasMore` is exact.
   */
  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    const client = this.client(credentials)
    // Payout pages fetched during this call, by the cursor that fetched them.
    const payoutPages = new Map<string, YocoPage<RawYocoPayout>>()
    const payoutPage = async (cursor: string | undefined): Promise<YocoPage<RawYocoPayout>> => {
      const k = cursor ?? ''
      const hit = payoutPages.get(k)
      if (hit) return hit
      const res = readPage(
        await client.get<YocoPage<RawYocoPayout>>('/v1/payouts/', {
          limit: MAX_PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
        }),
        '/v1/payouts/',
      )
      payoutPages.set(k, res)
      return res
    }

    const result = await pageByRows<BalanceTransaction, EntryCursor>(
      cursorPagerKey(this.scope(credentials), '/v1/payouts/*/payout_entries', {
        upstreamLimit: MAX_PAGE_SIZE,
      }),
      params,
      async (at) => {
        const pos: EntryCursor = at ?? { index: 0 }
        const payouts = await payoutPage(pos.payouts)
        const payout = payouts.data[pos.index]
        if (!payout) {
          // An empty payouts page: the stream ends, or continues on the next page.
          return {
            items: [],
            next: payouts.next_cursor ? { payouts: payouts.next_cursor, index: 0 } : undefined,
          }
        }
        const entriesPath = `/v1/payouts/${encodeURIComponent(payout.id)}/payout_entries`
        const entries = readPage(
          await client.get<YocoPage<RawYocoPayoutEntry>>(entriesPath, {
            limit: MAX_PAGE_SIZE,
            ...(pos.entries ? { cursor: pos.entries } : {}),
          }),
          entriesPath,
        )
        let next: EntryCursor | undefined
        if (entries.next_cursor) {
          next = { payouts: pos.payouts, index: pos.index, entries: entries.next_cursor }
        } else if (pos.index + 1 < payouts.data.length) {
          next = { payouts: pos.payouts, index: pos.index + 1 }
        } else if (payouts.next_cursor) {
          next = { payouts: payouts.next_cursor, index: 0 }
        }
        return { items: entries.data.map(transformPayoutEntry), next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return result.items
  }
}
