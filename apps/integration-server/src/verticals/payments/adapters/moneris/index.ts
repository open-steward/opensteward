/**
 * Moneris adapter — payments vertical.
 *
 * The Moneris API 2.15.1 (https://developer.moneris.com/moneris-api/llms.txt)
 * on https://api.moneris.io. Auth: an API key in `X-Api-Key`, plus the
 * required `X-Merchant-Id` and `Api-Version` headers (see `client.ts`).
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:   charge, customer, refund, subscription
// Unavailable: balance-transaction — Moneris provides no balance/ledger API endpoint; settlement data is only accessible via the Merchant Direct reporting portal
// Unavailable: invoice — Moneris has no invoice concept in its payment API
// Unavailable: payout — llms.txt documents only "Create Payouts … Issue payouts to merchants"; there is no list or retrieve
// Unavailable: plan — Moneris has no separate plan/pricing catalog; subscriptions are created directly with inline amounts/schedules
// Not built:   dispute — llms.txt documents "Accept Dispute", "Dispute Details" (by case id and record number), "Upload Images" and "Check image upload status"; no dispute list
// Not built:   payment-method — llms.txt documents "List payment methods … Retrieves a paginated list of payment methods." and "Retrieve Payment Method"; this adapter does not implement them yet

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

import { API_BASE_URL, LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT, WINDOW_MS } from './constants'
import { buildCredentials, merchantIdOf } from './auth'
import { MonerisClient } from './client'

import { transformCustomer, type RawMonerisCustomer } from './transform/customer'
import { transformCharge, type RawMonerisPayment } from './transform/charge'
import { transformRefund, type RawMonerisRefund } from './transform/refund'
import { transformSubscription, type RawMonerisSubscription } from './transform/subscription'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * The list envelope every documented list shares (`customerList`,
 * `paymentList`, `refundList`, `subscriptionList`): `"required": ["data"]`,
 * with `next`, "Pagination link pointing to the next page." (`uri-reference`,
 * nullable).
 */
interface MonerisList<T> {
  data: T[]
  next?: string | null
}

/**
 * Position in a walk. `anchor` is the time the walk's first request was built
 * at, so every window of one walk is cut from the same clock; `w` is the
 * window, in UTC days back from the anchor's; `cursor` is the documented
 * `cursor` ("Pagination cursor to return items located after it.") inside it.
 */
interface WindowCursor {
  anchor: number
  w: number
  cursor?: string
}

function utcDayStart(ms: number): number {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** The `cursor` query parameter of a documented `next` link, e.g. `/payments?cursor=d41d8cd98f00b&limit=50`. */
function cursorOf(next: string | null | undefined, path: string): string | undefined {
  if (next === null || next === undefined || next === '') return undefined
  const cursor = new URL(next, API_BASE_URL).searchParams.get('cursor')
  if (!cursor) throw new Error(`Moneris ${path} returned a next link without a cursor: ${next}`)
  return cursor
}

export class MonerisAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'moneris'
  readonly version = '0.2.0'

  getAuthUrl(): string {
    throw new Error('Moneris uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Moneris uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        helpText: 'Sent as the X-Api-Key header.',
      },
      {
        name: 'merchantId',
        label: 'Merchant ID',
        type: 'text',
        required: true,
        helpText: 'The thirteen-character identification code provided by Moneris (X-Merchant-Id).',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): MonerisClient {
    return new MonerisClient(credentials)
  }

  /**
   * One of the four documented lists (`GET /customers`, `/payments`,
   * `/refunds`, `/subscriptions`), which share their query parameters:
   * `cursor`, `limit` (`"maximum": 20`), `created_from` ("Returns items created
   * after the specified date, defaults to the current date starting from 12
   * AM.") and `created_to` ("Returns items created before the specified date,
   * … must be no more than 1 day later than `created_from` date.").
   *
   * An unfiltered call therefore reaches only today's rows, and one request
   * covers at most one day. The docs name no retention or lookback limit, so a
   * call without `updatedAfter` is refused before any request. With it, the
   * walk runs over UTC calendar days, newest first, each day paged by the
   * `cursor` of its `next` link until `next` is null. The oldest window
   * starts at `updatedAfter`. `pageByRows` cuts the caller's pages out of the
   * stream.
   *
   * The only date filter is on creation, so `updatedAfter` bounds the
   * creation date: a row created before it and modified after is not listed.
   */
  private async listWindowed<R, T>(
    credentials: Credentials,
    params: QueryParams,
    path: '/customers' | '/payments' | '/refunds' | '/subscriptions',
    resource: string,
    toRow: (raw: R) => T,
  ): Promise<T[]> {
    if (!params.updatedAfter) {
      throw notSupported(
        `Moneris cannot list ${resource} without updated_after: GET ${path} filters by ` +
          'created_from, which "defaults to the current date starting from 12 AM", and ' +
          'created_to "must be no more than 1 day later than `created_from` date", and the docs ' +
          'name no lookback limit. Pass updated_after to walk the days since then.',
      )
    }
    const lower = params.updatedAfter.getTime()
    const started = Date.now()
    if (lower > started) {
      reportUpstreamPage(params, { hasMore: false })
      return []
    }
    const client = this.client(credentials)
    const asked = Math.floor(params.limit ?? LIST_DEFAULT_LIMIT)
    const size = Math.min(Math.max(asked, 1), LIST_MAX_LIMIT)
    const today = utcDayStart(started)
    const account = connectionScope(`moneris:${merchantIdOf(credentials)}`, credentials)
    const key = `${account}:${path}:${lower}:${today}:${size}`
    const windowsFrom = (anchor: number): number =>
      Math.round((utcDayStart(anchor) - utcDayStart(lower)) / WINDOW_MS) + 1
    const { items } = await pageByRows<T, WindowCursor>(
      key,
      params,
      async (position) => {
        const { anchor, w, cursor } = position ?? { anchor: Date.now(), w: 0 }
        const dayStart = utcDayStart(anchor) - w * WINDOW_MS
        const query: Record<string, unknown> = {
          created_from: new Date(Math.max(dayStart, lower)).toISOString(),
          created_to: new Date(w === 0 ? anchor : dayStart + WINDOW_MS).toISOString(),
          limit: size,
        }
        if (cursor !== undefined) query.cursor = cursor
        const res = await client.get<MonerisList<R>>(path, query)
        const rows = (res.data ?? []).map(toRow)
        const nextCursor = cursorOf(res.next, path)
        let next: WindowCursor | null = null
        if (nextCursor !== undefined) next = { anchor, w, cursor: nextCursor }
        else if (w + 1 < windowsFrom(anchor)) next = { anchor, w: w + 1 }
        return { items: rows, next }
      },
      // One request per day at least, plus the pages of the busier days.
      { maxUpstreamPages: windowsFrom(started) + 1_000, defaultLimit: LIST_DEFAULT_LIMIT },
    )
    return items
  }

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    return this.listWindowed(credentials, params, '/customers', 'customers', transformCustomer)
  }

  /** "Retrieve a customer by their Id." `GET /customers/{customer-id}` returns a `customer`. */
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawMonerisCustomer>(
      `/customers/${encodeURIComponent(id)}`,
    )
    return transformCustomer(raw)
  }

  /** Charges are Moneris payments: "List Payments … Returns a paginated list of payments." */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    return this.listWindowed(credentials, params, '/payments', 'charges', transformCharge)
  }

  /** "Retrieve a payment by its payment Id." `GET /payments/{payment-id}` returns a `payment`. */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawMonerisPayment>(
      `/payments/${encodeURIComponent(id)}`,
    )
    return transformCharge(raw)
  }

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    return this.listWindowed(credentials, params, '/refunds', 'refunds', transformRefund)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawMonerisRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? ({} as RawMonerisRefund))
  }

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    return this.listWindowed(
      credentials,
      params,
      '/subscriptions',
      'subscriptions',
      transformSubscription,
    )
  }

  /** "Retrieve a Subscription details by Id". `GET /subscriptions/{subscription-id}` returns a `subscription`. */
  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const raw = await this.client(credentials).get<RawMonerisSubscription>(
      `/subscriptions/${encodeURIComponent(id)}`,
    )
    return transformSubscription(raw)
  }
}
