/**
 * Viva.com adapter — payments vertical.
 *
 * Every read goes through the one list Viva documents, "Transactions from Data
 * Service" in the Payment API spec (https://developer.viva.com/downloads/payment-api.yaml):
 * `POST /dataservices/v2/transactions/Search?PageSize=&Page=&OrderBy=` with a
 * JSON filter body. Charges and refunds are both transactions there, told apart
 * by the documented `TransactionTypeIds` body filter.
 *
 * "The Data Services APIs requires specific access credentials. To request
 * access, please speak to your sales representative", and "the time frame
 * that the Transactions from Data Service API can fetch data from is 240 days".
 *
 * Auth: OAuth2 client credentials only (see auth.ts). Viva documents no
 * authorization-code flow, so the connection form takes the merchant's
 * Client ID and Client Secret.
 *
 * Not supported (refused with 501 before any request):
 *   customers — the spec has no customer resource; its only customer tag,
 *     "Customers Timeline", is commented out of the published spec.
 *   getPayout — the account transactions search documents no id filter.
 *   listPayouts without updatedAfter — see listPayouts.
 *
 * Payouts are wallet ledger entries: "Account Transactions",
 * `POST /dataservices/v2/accounttransactions/Search`, filtered by SubTypeIds
 * 30 PayOutIban and 31 PayOutCard (see transform/payout.ts). DateFrom and
 * DateTo are required; see listPayouts for the window.
 */

import {
  DEFAULT_PAGE_LIMIT,
  connectionScope,
  pageByRows,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Customer } from '../../schema/customer'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Payout } from '../../schema/payout'

import { fetchToken } from './auth'
import { VivaComClient } from './client'
import {
  ACCOUNT_TRANSACTIONS_MAX_PAGE_SIZE,
  ACCOUNT_TRANSACTIONS_SEARCH_PATH,
  DEFAULT_PAGE_SIZE,
  TRANSACTIONS_SEARCH_PATH,
} from './constants'

import { transformCharge } from './transform/charge'
import { transformRefund } from './transform/refund'
import {
  PAYOUT_SUBTYPE_IDS,
  transformPayout,
  type RawVivaComAccountTransaction,
} from './transform/payout'
import {
  CHARGE_TYPE_IDS,
  REFUND_TYPE_IDS,
  type RawVivaComTransaction,
} from './transform/transaction'

/** Documented response of the transaction search (`data_services_retrieve_transactions_response`). */
interface VivaComSearchResponse {
  currentPage?: number
  pageSize?: number
  data?: RawVivaComTransaction[]
  /** "Array of pagination links." Items carry `self`, `next`, `previous`. */
  links?: Array<{ self?: string; next?: string; previous?: string }>
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400, code: 'BAD_REQUEST' })
}

/**
 * A Date in the format the spec's examples give DateFrom/DateTo:
 * "2018-01-20 13:45:03.5200000 +02:00" (here always in UTC, "+00:00").
 */
function vivaDateTime(d: Date): string {
  const iso = d.toISOString() // 2026-09-27T12:00:00.123Z
  return `${iso.slice(0, 10)} ${iso.slice(11, 23)}0000 +00:00`
}

/** One position in a payout walk: the window, frozen at the walk's first request, and the page. */
interface PayoutCursor {
  from: string
  to: string
  page: number
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

export class VivaComAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'viva-com'
  readonly version = '0.2.0'

  getAuthUrl(): string {
    throw new Error(
      'Viva.com uses OAuth2 client credentials; submit the Client ID and Secret via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Viva.com uses OAuth2 client credentials; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      { name: 'clientId', label: 'Client ID', type: 'text', required: true },
      { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return fetchToken(fields.clientId ?? '', fields.clientSecret ?? '')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
    const clientId = typeof extra.clientId === 'string' ? extra.clientId : ''
    const clientSecret = typeof extra.clientSecret === 'string' ? extra.clientSecret : ''
    return fetchToken(clientId, clientSecret)
  }

  private client(credentials: Credentials): VivaComClient {
    return new VivaComClient(credentials)
  }

  /**
   * One page of the transaction search, at the caller's page and limit.
   *
   * `Page` "If not specified, the default value is 1"; `PageSize` "If not
   * specified, the default value is 10" (no maximum documented, so the
   * caller's limit is sent as is). `OrderBy=Ascending` keeps page N stable
   * while new transactions arrive at the end. A "204 No Content" response,
   * or a page whose `links` carry no `next`, ends the collection.
   *
   * `updatedAfter` is not forwarded: the only documented date filters are the
   * creation time (`insDateFrom`) and the clearance time, and a creation-time
   * filter would drop older transactions whose status changed.
   */
  private async searchPage(
    credentials: Credentials,
    params: QueryParams,
    body: Record<string, unknown>,
  ): Promise<RawVivaComTransaction[]> {
    const page = Math.max(1, Math.floor(params.page ?? 1))
    const size = Math.max(1, Math.floor(params.limit ?? DEFAULT_PAGE_SIZE))
    const res = await this.client(credentials).search<VivaComSearchResponse>(
      TRANSACTIONS_SEARCH_PATH,
      { PageSize: size, Page: page, OrderBy: 'Ascending' },
      body,
    )
    const rows = res.status === 204 ? [] : (res.data?.data ?? [])
    const hasNext = (res.data?.links ?? []).some((l) => typeof l.next === 'string' && l.next !== '')
    reportUpstreamPage(params, { hasMore: rows.length > 0 && hasNext })
    return rows
  }

  /** Look one transaction up by the documented `TransactionIds` body filter. */
  private async findTransaction(
    credentials: Credentials,
    id: string,
    typeIds: readonly number[],
    what: string,
  ): Promise<RawVivaComTransaction> {
    const res = await this.client(credentials).search<VivaComSearchResponse>(
      TRANSACTIONS_SEARCH_PATH,
      { PageSize: 1, Page: 1 },
      { TransactionIds: [id], TransactionTypeIds: [...typeIds] },
    )
    const row = res.status === 204 ? undefined : res.data?.data?.[0]
    if (!row || row.TransactionId !== id) throw notFound(`Viva.com ${what} ${id} not found`)
    return row
  }

  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported(
      'Viva.com cannot list customers: its Payment API has no customer resource ("#- Customers Timeline" is commented out of the published spec)',
    )
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported('Viva.com cannot read customers: its Payment API has no customer resource')
  }

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.searchPage(credentials, params, {
      TransactionTypeIds: [...CHARGE_TYPE_IDS],
    })
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    return transformCharge(await this.findTransaction(credentials, id, CHARGE_TYPE_IDS, 'charge'))
  }

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const rows = await this.searchPage(credentials, params, {
      TransactionTypeIds: [...REFUND_TYPE_IDS],
    })
    return rows.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    return transformRefund(await this.findTransaction(credentials, id, REFUND_TYPE_IDS, 'refund'))
  }

  /**
   * Payouts, newest first, from the wallet ledger.
   *
   * One window, [DateFrom, DateTo]: DateFrom is `updatedAfter` (the only date
   * the search filters on is the creation date, so a payout is matched by when
   * it was created) and DateTo is now. The spec documents no cap on the window
   * (its example spans "2018-01-20" to "2024-04-27"), so the walk is one
   * window, not a series of them. The window is fixed at a walk's first
   * request and carried in the cursor, so later pages replay the same query.
   *
   * Without `updatedAfter` the list is refused (501, before any request).
   * DateFrom and DateTo are `required`, and the spec documents no retention
   * for this operation that would give DateFrom a floor: its "240 days"
   * belongs to "the Transactions from Data Service API"
   * (/dataservices/v2/transactions/Search), not to Account Transactions.
   *
   * `SubTypeIds` is sent as integers. The definition says "type: array of
   * strings", but its example (`[ 22, 25, 30 ]`) and all four code samples
   * (cURL, PHP, NodeJs, Java) send integers, and the row's `subTypeId` is
   * "type: integer".
   *
   * `OrderBy=Descending`; `PageSize` is the caller's limit, clamped to
   * "Maximum value = 500"; `Page` "Should be set to `1` and increased by one
   * until a "204 (No content)" message is received". pageByRows cuts the
   * caller's page out of those upstream pages and reports `hasMore`.
   */
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const after = params.updatedAfter
    if (after === undefined) {
      throw notSupported(
        'Viva.com cannot list payouts without updated_after: the account transactions search (POST /dataservices/v2/accounttransactions/Search) requires DateFrom and DateTo, and Viva documents no retention for it that would bound an unfiltered walk. Pass updated_after to set DateFrom.',
      )
    }
    if (Number.isNaN(new Date(after).getTime())) {
      throw badRequest('Viva.com payouts: updatedAfter is not a valid date')
    }
    const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
    if (typeof extra.clientId !== 'string' || extra.clientId === '') {
      throw Object.assign(
        new Error(
          "Viva.com payouts need the connection's Client ID; reconnect with the Client ID and Client Secret",
        ),
        { statusCode: 401, code: 'RECONNECT_REQUIRED' },
      )
    }
    const limit = Math.floor(Number(params.limit ?? DEFAULT_PAGE_LIMIT))
    const size = Math.min(ACCOUNT_TRANSACTIONS_MAX_PAGE_SIZE, Math.max(1, limit))
    const since = new Date(after).toISOString()
    const key = [
      'viva-com:payouts',
      connectionScope(extra.clientId, credentials),
      since,
      String(size),
    ].join('|')
    const client = this.client(credentials)
    const result = await pageByRows<Payout, PayoutCursor>(key, params, async (cursor) => {
      const at: PayoutCursor = cursor ?? {
        from: vivaDateTime(new Date(after)),
        to: vivaDateTime(new Date()),
        page: 1,
      }
      const res = await client.search<RawVivaComAccountTransaction[]>(
        ACCOUNT_TRANSACTIONS_SEARCH_PATH,
        { PageSize: size, Page: at.page, OrderBy: 'Descending' },
        { DateFrom: at.from, DateTo: at.to, SubTypeIds: [...PAYOUT_SUBTYPE_IDS] },
      )
      if (res.status === 204) return { items: [], next: undefined }
      if (!Array.isArray(res.data)) {
        throw new Error(
          `Viva.com account transactions search returned status ${res.status} with a body that is not an array of transactions`,
        )
      }
      const items = res.data.map(transformPayout)
      // A 204 ends the walk; an empty page has nothing after it either.
      return { items, next: items.length === 0 ? undefined : { ...at, page: at.page + 1 } }
    })
    return result.items
  }

  async getPayout(_credentials: Credentials, _id: string): Promise<Payout> {
    throw notSupported(
      'Viva.com cannot read a payout by id: the account transactions search (POST /dataservices/v2/accounttransactions/Search) has no id filter; its body takes only DateFrom, DateTo, WalletId, SubTypeIds, AmountFrom and AmountTo',
    )
  }
}
