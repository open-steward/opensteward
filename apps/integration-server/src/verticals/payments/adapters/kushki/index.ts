/**
 * Kushki adapter — payments vertical.
 *
 * Auth: the merchant's Private Key in the `Private-Merchant-Id` header.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:   charge, refund (from GET /analytics/v2/transactions-list), subscription (get by id only)
// Unavailable: customer — Kushki documents no customer resource
// Unavailable: balance-transaction — no transaction-level balance ledger; only a scalar merchant-balance endpoint exists
// Unavailable: dispute — not implemented here; Kushki documents Query Chargebacks at
//   POST /data/v1/chargebacks/search (mexico/online-payments/chargebacks/list.md)
// Unavailable: invoice — Kushki has no invoice concept or endpoint
// Unavailable: payment-method — no standalone payment-method list endpoint; stored cards addressed via subscription tokens
// Unavailable: payout — payout initiation flow only; no confirmed listing/get endpoint for historical payouts
// Unavailable: plan — plans are a string field on subscriptions, not a first-class API resource

import {
  connectionScope,
  pageByRows,
  reportUpstreamPage,
  type BaseAdapter,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import { TRANSACTIONS_LIST_DEFAULT_LIMIT, TRANSACTIONS_LIST_MAX_LIMIT } from './constants'
import { buildCredentials } from './auth'
import { KushkiClient } from './client'
import { verifyKushkiWebhook, parseKushkiWebhookEvents } from './webhook'

import { transformCharge } from './transform/charge'
import { transformRefund, type RawKushkiRefund } from './transform/refund'
import { transformSubscription, type RawKushkiSubscription } from './transform/subscription'
import { present, type RawKushkiTransaction } from './transform/shared'

const TRANSACTIONS_LIST = '/analytics/v2/transactions-list'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** `YYYY-MM-DDTHH:MM:SS`, the documented `from`/`to` format ("AAAA-MM-DDTHH:MM:SS"), in UTC. */
function kushkiDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19)
}

/** Start of the UTC calendar month `delta` months from the one holding `ms`. */
function monthStart(ms: number, delta = 0): number {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1)
}

interface TransactionsListResponse {
  /** "Total number of matching records" */
  total?: number
  /** "Array of transaction objects for the current page" */
  data?: RawKushkiTransaction[]
}

/** Position in the walk: `w` months back from the newest window, `offset` rows into it. */
interface WindowCursor {
  w: number
  offset: number
}

export class KushkiAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'kushki'
  readonly version = '0.2.0'

  getAuthUrl(): string {
    throw new Error('Kushki uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Kushki uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'Private Key',
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
    return verifyKushkiWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseKushkiWebhookEvents(payload)
  }

  private client(credentials: Credentials): KushkiClient {
    return new KushkiClient(credentials)
  }

  /**
   * Transactions of one `transaction_type` since `params.updatedAfter`, from
   * `GET /analytics/v2/transactions-list`
   * (https://api-docs.kushkipagos.com/mexico/online-payments/analytics/transactions-list-v2.md),
   * the only transaction list Kushki documents.
   *
   * `from` and `to` are `required: true` and the docs name no retention or
   * lookback limit, so a call without `updatedAfter` is refused before any
   * request. With it, the walk runs over UTC calendar months, newest first
   * ("Transactions are returned in descending order, with the most recent
   * ones appearing first"), each month paged by `offset` ("starting record
   * index (0-based)", https://api-docs.kushkipagos.com/mexico/online-payments/analytics.md)
   * and `limit` (at most 600) until `total` ("Total number of matching
   * records") is reached. The oldest window starts at `updatedAfter`.
   * `pageByRows` cuts the caller's pages out of the stream.
   *
   * "Transactions can only be queried through this endpoint `90 seconds`
   * after their creation", so a row created less than 90 s before a call is
   * not in that call's result. A caller that advances updated_after to the
   * time of its previous call can miss such rows; it should overlap by at
   * least 90 s.
   */
  private async listTransactions<T>(
    credentials: Credentials,
    params: QueryParams,
    transactionType: 'SALE' | 'REFUND',
    resource: string,
    toRow: (raw: RawKushkiTransaction) => T | undefined,
  ): Promise<T[]> {
    if (!params.updatedAfter) {
      throw notSupported(
        `Kushki cannot list ${resource} without updated_after: its only transaction list, ` +
          'GET /analytics/v2/transactions-list, requires a from/to date window (both ' +
          '"required: true") and documents no lookback limit. Pass updated_after to walk ' +
          'the months since then.',
      )
    }
    const lower = params.updatedAfter.getTime()
    const now = Date.now()
    if (lower > now) {
      reportUpstreamPage(params, { hasMore: false })
      return []
    }
    const top = monthStart(now, 1)
    const newest = monthStart(now)
    const oldest = monthStart(lower)
    const d0 = new Date(oldest)
    const d1 = new Date(newest)
    const windows =
      (d1.getUTCFullYear() - d0.getUTCFullYear()) * 12 + (d1.getUTCMonth() - d0.getUTCMonth()) + 1
    const asked = Math.floor(params.limit ?? TRANSACTIONS_LIST_DEFAULT_LIMIT)
    const size = Math.min(Math.max(asked, 1), TRANSACTIONS_LIST_MAX_LIMIT)
    const client = this.client(credentials)
    const key =
      `kushki:${connectionScope('kushki', credentials)}:transactions-list:` +
      `${transactionType}:${lower}:${top}:${size}`
    const { items } = await pageByRows<T, WindowCursor>(
      key,
      params,
      async (cursor) => {
        const { w, offset } = cursor ?? { w: 0, offset: 0 }
        const start = monthStart(now, -w)
        const end = monthStart(now, -w + 1) - 1000
        const res = await client.get<TransactionsListResponse>(TRANSACTIONS_LIST, {
          from: kushkiDate(Math.max(start, lower)),
          to: kushkiDate(end),
          transaction_type: transactionType,
          offset,
          limit: size,
        })
        const data = res.data ?? []
        const seen = offset + data.length
        const total = typeof res.total === 'number' ? res.total : seen
        const rows: T[] = []
        for (const raw of data) {
          const row = toRow(raw)
          if (row !== undefined) rows.push(row)
        }
        let next: WindowCursor | null = null
        if (data.length > 0 && seen < total) next = { w, offset: seen }
        else if (w + 1 < windows) next = { w: w + 1, offset: 0 }
        return { items: rows, next }
      },
      // One request per month at least, plus pages of rows skipped for lacking a ticket_number.
      { maxUpstreamPages: windows + 1_000 },
    )
    return items
  }

  async listCustomers(): Promise<Customer[]> {
    throw notSupported(
      'Kushki cannot list customers: its API index (https://api-docs.kushkipagos.com/llms.txt) ' +
        'documents no customer resource; a customer exists only as the tokenized card of a ' +
        'charge or recurring charge.',
    )
  }

  async getCustomer(): Promise<Customer> {
    throw notSupported(
      'Kushki cannot get a customer: its API index (https://api-docs.kushkipagos.com/llms.txt) ' +
        'documents no customer resource.',
    )
  }

  /**
   * `transaction_type=SALE` rows. A row without `ticket_number` is skipped:
   * "The `ticketNumber` is provided when a charge or a deferred charge is
   * successful" (card-payments/refund.md), and the page's own declined SALE
   * example carries none, so such a row has no id the charge, void and refund
   * endpoints share.
   */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    return this.listTransactions(credentials, params, 'SALE', 'charges', (raw) =>
      present(raw.ticket_number) === undefined ? undefined : transformCharge(raw),
    )
  }

  async getCharge(): Promise<Charge> {
    throw notSupported(
      'Kushki cannot get a charge by id: it documents no charge lookup, and its only ' +
        'transaction read, GET /analytics/v2/transactions-list, requires a from/to date window.',
    )
  }

  /**
   * `transaction_type=REFUND` rows ("Allowed values:
   * `SALE`,`CAPTURE`,`VOID`,`DEFERRED`,`PREAUTHORIZATION`,`REFUND`,`CHARGEBACK`,`PAYOUT`").
   * A row without `ticket_number` has no id and is skipped, as for charges.
   */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    return this.listTransactions(credentials, params, 'REFUND', 'refunds', (raw) =>
      present(raw.ticket_number) === undefined ? undefined : transformRefund(raw),
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawKushkiRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }

  async listSubscriptions(): Promise<Subscription[]> {
    throw notSupported(
      'Kushki cannot list subscriptions: /subscriptions/v1/card is documented only as POST ' +
        '("Create a recurring charge with a `token` provided by Kushki"), and every other ' +
        'subscription endpoint takes one subscriptionId.',
    )
  }

  /**
   * `GET /subscriptions/v1/card/search/{subscriptionId}` ("Get the information
   * that belongs to a specific recurring charge."), whose 200 body is the
   * subscription itself, not a `data` envelope.
   */
  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<RawKushkiSubscription>(
      `/subscriptions/v1/card/search/${encodeURIComponent(id)}`,
    )
    return transformSubscription(res)
  }
}
