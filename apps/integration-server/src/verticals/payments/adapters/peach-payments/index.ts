/**
 * Peach Payments adapter — payments vertical.
 *
 * Auth: an access token sent as `Authorization: Bearer`, plus the channel's
 * `entityId` on every request ("The entity required to authorise the
 * request. This should be the channel entity identifier.").
 * https://developer.peachpayments.com/docs/oppwa-references-api
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:   charge, refund (GET /v3/query, date window required)
// Unavailable: customer — "Customer" is a group of customer.* parameters sent with a payment, not a listable object
// Unavailable: balance-transaction — no balance-transaction ledger API; Reconciliation API returns per-transaction settlement data only
// Unavailable: dispute — chargebacks managed via dashboard only; no public REST API endpoint
// Unavailable: invoice — no invoice resource; Xero integration is dashboard-only
// Unavailable: payment-method — card registrations can be created but no GET/LIST endpoint is documented
// Unavailable: plan — no billing-plan catalog resource exists
// Unavailable: subscription — recurring billing uses stored tokens + merchant scheduling; no subscription object or endpoint
// Unverified:  payout — Payouts API exists (payouts.peachpayments.com) but uses separate OAuth auth incompatible with adapter credentials

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
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'

import {
  CHARGE_PAYMENT_TYPES,
  DEFAULT_PAGE_SIZE,
  QUERY_PAGE_SIZE,
  REFUND_PAYMENT_TYPES,
} from './constants'
import { buildCredentials, entityIdOf } from './auth'
import { PeachPaymentsClient } from './client'

import { transformCharge } from './transform/charge'
import { transformRefund, type RawPeachRefund } from './transform/refund'
import type { RawPeachQueryResponse, RawPeachTransaction } from './transform/shared'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const CUSTOMER_REASON =
  'Peach Payments cannot list customers: its API reference has no customer resource. "The ' +
  'customer data structure holds information about the customer such as their name, ' +
  'identification documents, and contact details" is a group of customer.* parameters sent ' +
  'with a payment, not an object the API can list or read back.'

/** First instant of `d`'s UTC calendar month, `months` months later. */
function utcMonth(d: Date, months = 0): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1))
}

/** `date.from` / `date.to` format: "yyyy-MM-dd HH:mm:ss". */
function queryTime(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

export class PeachPaymentsAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'peach-payments'
  readonly version = '0.2.0'

  getAuthUrl(): string {
    throw new Error('Peach Payments uses an access token; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Peach Payments uses an access token; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'accessToken',
        label: 'Access token',
        type: 'password',
        required: true,
      },
      {
        name: 'entityId',
        label: 'Entity ID (channel)',
        type: 'text',
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

  private client(credentials: Credentials): PeachPaymentsClient {
    return new PeachPaymentsClient(credentials)
  }

  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported(CUSTOMER_REASON)
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported(CUSTOMER_REASON)
  }

  /**
   * Transactions of the given payment types from GET /v3/query, one UTC
   * calendar month per window, walked newest-first, each window paged by
   * `pageNo`.
   *
   * "The request must include either `merchantTransactionId` or
   * `date.to`/`date.from` parameters." "For large result sets, use pagination
   * by specifying the page number with `pageNo`. The system sets the page
   * size to 100 and ignores the `limit` parameter." The paged response
   * carries `"pages":"8"`, the window's page count.
   * https://developer.peachpayments.com/docs/oppwa-integrations-reporting
   *
   * Peach documents no retention or lookback limit to walk back to, so a
   * call without `updatedAfter` is refused. With it, windows run from the
   * current UTC month back to the month holding `updatedAfter`, whose window
   * starts at `updatedAfter` itself. Both ends are in the pager key, so page
   * N is stable within a UTC month.
   */
  private async queryTransactions<T>(
    credentials: Credentials,
    params: QueryParams,
    paymentTypes: readonly string[],
    resource: string,
    transform: (raw: RawPeachTransaction) => T,
  ): Promise<T[]> {
    if (!params.updatedAfter) {
      throw notSupported(
        `Peach Payments cannot list ${resource} without updated_after: GET /v3/query "must ` +
          'include either `merchantTransactionId` or `date.to`/`date.from` parameters", and ' +
          'Peach documents no retention limit to walk back to. Pass updated_after to bound the walk.',
      )
    }
    const entityId = entityIdOf(credentials)
    const floor = params.updatedAfter
    const oldest = utcMonth(floor)
    const newest = utcMonth(new Date())
    const types = paymentTypes.join(',')
    const client = this.client(credentials)
    const key = cursorPagerKey(
      connectionScope(`peach-payments:${entityId}`, credentials),
      `v3/query:${types}`,
      { from: floor, newest },
    )
    const { items } = await pageByRows<T, string>(
      key,
      params,
      async (cursor) => {
        const [monthIso, pageText] = cursor ? cursor.split('|') : [newest.toISOString(), '1']
        const start = new Date(monthIso!)
        const pageNo = Number(pageText)
        if (start.getTime() < oldest.getTime()) return { items: [], next: undefined }
        const from = start.getTime() < floor.getTime() ? floor : start
        const res = await client.get<RawPeachQueryResponse>('/v3/query', {
          entityId,
          'date.from': queryTime(from),
          'date.to': queryTime(utcMonth(start, 1)),
          paymentTypes: types,
          pageNo,
        })
        const records = Array.isArray(res?.records) ? res.records : []
        // `pages` is shown only in the paginated sample. Without it, a full
        // page (QUERY_PAGE_SIZE rows) may not be the last, so probe pageNo+1
        // rather than end the window and drop its remaining rows.
        const pages = Number(res?.pages)
        const morePages =
          res?.pages !== undefined && Number.isInteger(pages)
            ? pageNo < pages
            : records.length >= QUERY_PAGE_SIZE
        const next = morePages
          ? `${monthIso}|${pageNo + 1}`
          : start.getTime() > oldest.getTime()
            ? `${utcMonth(start, -1).toISOString()}|1`
            : undefined
        return { items: records.map(transform), next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    return this.queryTransactions(
      credentials,
      params,
      CHARGE_PAYMENT_TYPES,
      'charges',
      transformCharge,
    )
  }

  /**
   * GET /v3/query/{id}: "The `id` is a unique payment identifier generated by
   * the system. If this identifier is available, you can use it to query the
   * platform by adding it directly to the URL." The response carries the
   * transaction in `records`.
   * https://developer.peachpayments.com/docs/oppwa-integrations-reporting
   */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const entityId = entityIdOf(credentials)
    const res = await this.client(credentials).get<RawPeachQueryResponse>(
      `/v3/query/${encodeURIComponent(id)}`,
      { entityId },
    )
    const record = (Array.isArray(res?.records) ? res.records : []).find((r) => r.id === id)
    if (
      !record ||
      !(CHARGE_PAYMENT_TYPES as readonly string[]).includes(record.paymentType ?? '')
    ) {
      throw Object.assign(new Error(`Peach Payments charge ${id} not found`), { statusCode: 404 })
    }
    return transformCharge(record)
  }

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    return this.queryTransactions(
      credentials,
      params,
      REFUND_PAYMENT_TYPES,
      'refunds',
      transformRefund,
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawPeachRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }
}
