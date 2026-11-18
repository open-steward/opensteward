/**
 * Thunes adapter — payments vertical.
 *
 * Money Transfer API v2 (https://docs.thunes.com/money-transfer/v2/). Auth is
 * HTTP Basic with "user-ID: API key" and "password: API secret", against the
 * per-account endpoint Thunes provides "upon account creation" (see auth.ts).
 *
 * Coverage:
 * - listBalanceTransactions → GET /v2/money-transfer/balances, then
 *   GET /v2/money-transfer/balances/{balance_id}/movements per balance, in
 *   UTC-day windows ("to_date should be within 24 hours of from_date"), so it
 *   is served only when the caller sends `updatedAfter`.
 * - Customers, charges, refunds: neither Thunes API (Money Transfer v2 or
 *   Accept v1) documents a list of them; refused before any request.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: dispute       — Thunes has no dispute/chargeback API in either Money Transfer v2 or Accept v1
// Unavailable: invoice       — Thunes has no invoice concept; billing is handled externally
// Unavailable: payment-method — Thunes does not expose stored payment methods as a first-class resource
// Unavailable: payout        — Accept API payout-requests has no list endpoint and uses a separate undisclosed base URL
// Unavailable: plan          — Thunes has no subscription billing or plan/price catalog
// Unavailable: subscription  — Thunes has no subscription concept

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import { connectionScope, pageByRows, reportUpstreamPage } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'

import { buildCredentials, readEndpoint } from './auth'
import { ThunesClient } from './client'
import {
  BALANCES_PATH,
  BALANCES_PER_PAGE,
  MOVEMENTS_LIMIT,
  MOVEMENT_WINDOW_MS,
  movementsPath,
} from './constants'
import {
  transformBalanceTransaction,
  type RawThunesBalanceMovement,
} from './transform/balance-transaction'
import { transformRefund, type RawThunesRefund } from './transform/refund'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** A documented "Balance" object: `{ id, currency, balance, pending, available, credit_facility }`. */
interface RawThunesBalance {
  id: number
  currency?: string
}

/** Where a movements walk stands: window `w` (0 = newest UTC day), balance index `i`, upstream cursor `c`. */
interface MovementPos {
  w: number
  i: number
  c?: string
}

/** ISO 8601 to the second, as in the documented example `from_date=2022-12-01T00:00:00Z`. */
function isoSeconds(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function header(headers: Record<string, unknown>, name: string): string | undefined {
  const v = headers[name.toLowerCase()] ?? headers[name]
  return typeof v === 'string' && v !== '' ? v : undefined
}

export class ThunesAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'thunes'
  readonly version = '0.2.0'

  getAuthUrl(): string {
    throw new Error('Thunes uses an API key and secret; submit them via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Thunes uses an API key and secret; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'text',
        required: true,
        helpText: 'Sent as the HTTP Basic user-ID.',
      },
      {
        name: 'apiSecret',
        label: 'API Secret',
        type: 'password',
        required: true,
        helpText: 'Sent as the HTTP Basic password.',
      },
      {
        name: 'apiEndpoint',
        label: 'API Endpoint',
        type: 'text',
        required: true,
        helpText:
          'The Money Transfer API host Thunes provided upon account creation (production or pre-production).',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): ThunesClient {
    return new ThunesClient(credentials)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(): Promise<Customer[]> {
    throw notSupported(
      'Thunes cannot list customers: neither the Money Transfer v2 nor the Accept v1 API has a customer endpoint; a customer appears only as the "customer" object of an Accept payment order ("id of the customer").',
    )
  }

  async getCustomer(): Promise<Customer> {
    throw notSupported(
      'Thunes cannot read customers: neither the Money Transfer v2 nor the Accept v1 API has a customer endpoint.',
    )
  }

  // ── Charges ───────────────────────────────────────────────────────────────

  async listCharges(): Promise<Charge[]> {
    throw notSupported(
      'Thunes cannot list charges: the Accept v1 API documents only "Retrieve a charge operation by operation id" (GET /v1/payment/charges/{id}) and a create; payment orders cannot be listed either.',
    )
  }

  /**
   * The documented read, GET /v1/payment/charges/{id}, belongs to the Accept
   * v1 API, a separate product whose endpoint is provided separately upon
   * account creation. This connection holds a Money Transfer v2 endpoint.
   */
  async getCharge(): Promise<Charge> {
    throw notSupported(
      'Thunes cannot read charges on this connection: the only charge read is Accept v1 "Retrieve a charge operation by operation id" (GET /v1/payment/charges/{id}), on the Accept API endpoint, not the Money Transfer endpoint this connection holds.',
    )
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(): Promise<Refund[]> {
    throw notSupported(
      'Thunes cannot list refunds: the Accept v1 API documents only "Retrieve a refund operation by operation id" (GET /v1/payment/refunds/{id}) and POST /v1/payment/payment-orders/{paymentOrderId}/refunds.',
    )
  }

  // Write method, out of scope for the paging rebuild. POST /refunds is not a
  // documented path: the documented create is
  // POST /v1/payment/payment-orders/{paymentOrderId}/refunds (Accept v1).
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawThunesRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }

  // ── Balance transactions (balance movements) ──────────────────────────────

  /** Every balance: GET /v2/money-transfer/balances, paged by page/per_page until no X-Next-Page. */
  private async listBalances(client: ThunesClient): Promise<RawThunesBalance[]> {
    const out: RawThunesBalance[] = []
    for (let page = 1; page <= 1000; page++) {
      const res = await client.get<RawThunesBalance[]>(BALANCES_PATH, {
        page,
        per_page: BALANCES_PER_PAGE,
      })
      if (!Array.isArray(res.data)) {
        throw new Error('Thunes balances response is not the documented array of balance objects.')
      }
      for (const b of res.data) {
        if (typeof b?.id !== 'number') throw new Error('Thunes balance has no numeric id.')
        out.push(b)
      }
      if (!header(res.headers, 'X-Next-Page')) return out
    }
    throw new Error('Thunes balances did not end within 1,000 pages.')
  }

  /**
   * GET /v2/money-transfer/balances/{balance_id}/movements requires from_date
   * and to_date ("to_date should be within 24 hours of from_date") and pages by
   * `limit` ("Default 100, Max 200") and `cursor` ("Base64 Encoded string, from
   * X-Next-Cursor response header field"). No retention or lookback limit is
   * documented, so an unfiltered call is refused. With `updatedAfter`, the
   * walk runs UTC-day windows newest-first, from today's UTC day down to the
   * day holding `updatedAfter` (whose window starts at `updatedAfter`), and
   * within each window every balance in the order the balances list returns.
   */
  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    const since = params.updatedAfter
    if (!(since instanceof Date) || Number.isNaN(since.getTime())) {
      throw notSupported(
        'Thunes cannot list balance movements without a date window: GET /v2/money-transfer/balances/{balance_id}/movements requires from_date and to_date ("to_date should be within 24 hours of from_date") and documents no lookback limit; pass updatedAfter.',
      )
    }
    const client = this.client(credentials)
    const sinceMs = since.getTime()
    const today = Math.floor(Date.now() / MOVEMENT_WINDOW_MS) * MOVEMENT_WINDOW_MS
    const sinceDay = Math.floor(sinceMs / MOVEMENT_WINDOW_MS) * MOVEMENT_WINDOW_MS
    if (sinceDay > today) {
      reportUpstreamPage(params, { hasMore: false })
      return []
    }
    const oldest = (today - sinceDay) / MOVEMENT_WINDOW_MS

    const balances = await this.listBalances(client)
    const key = [
      'thunes:balance-movements',
      connectionScope(readEndpoint(credentials) ?? '', credentials),
      isoSeconds(sinceMs),
      today,
      balances.map((b) => b.id).join(','),
      MOVEMENTS_LIMIT,
    ].join('|')

    const result = await pageByRows<BalanceTransaction>(key, params, async (cursor) => {
      if (balances.length === 0) return { items: [], next: null }
      const pos: MovementPos = cursor ? (JSON.parse(cursor) as MovementPos) : { w: 0, i: 0 }
      const dayStart = today - pos.w * MOVEMENT_WINDOW_MS
      const from = pos.w === oldest ? Math.max(dayStart, sinceMs) : dayStart
      const balance = balances[pos.i]!
      const query: Record<string, unknown> = {
        from_date: isoSeconds(from),
        to_date: isoSeconds(dayStart + MOVEMENT_WINDOW_MS),
        limit: MOVEMENTS_LIMIT,
      }
      if (pos.c) query['cursor'] = pos.c
      const res = await client.get<RawThunesBalanceMovement[]>(movementsPath(balance.id), query)
      if (!Array.isArray(res.data)) {
        throw new Error(
          'Thunes movements response is not the documented array of balance movements.',
        )
      }
      const items = res.data.map((m) => transformBalanceTransaction(m, balance.id))
      const nextCursor = header(res.headers, 'X-Next-Cursor')
      let next: MovementPos | null
      if (nextCursor) next = { w: pos.w, i: pos.i, c: nextCursor }
      else if (pos.i + 1 < balances.length) next = { w: pos.w, i: pos.i + 1 }
      else if (pos.w < oldest) next = { w: pos.w + 1, i: 0 }
      else next = null
      return { items, next: next ? JSON.stringify(next) : null }
    })
    return result.items
  }

  async getBalanceTransaction(): Promise<BalanceTransaction> {
    throw notSupported(
      'Thunes cannot read one balance movement: the docs have no lookup by balance_operation_number; movements are only listed per balance (GET /v2/money-transfer/balances/{balance_id}/movements) within a from_date/to_date window.',
    )
  }
}
