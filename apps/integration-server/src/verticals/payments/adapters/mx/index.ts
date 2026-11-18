/**
 * MX adapter — payments vertical.
 *
 * Source: the MX Platform API spec, https://docs.mx.com/openapi/platform-api/v20250224.yaml
 * ("The MX Platform API is a powerful, fully-featured API designed to make
 * aggregating and enhancing financial data easy and reliable.").
 *
 * Auth: HTTP Basic, `client_id:api_key` (see auth.ts), with the
 * `Accept-Version: v20250224` header on every request (see client.ts).
 *
 * MX is a financial data aggregation / open-banking platform, not a payment
 * processor. Its resources hang off users: GET /users, then
 * GET /users/{user_identifier}/accounts.
 *
 * - customer        GET /users ("list every user you've created"),
 *                   GET /users/{user_identifier}
 * - payment-method  GET /users/{user_identifier}/accounts for every user,
 *                   GET /users/{user_guid}/accounts/{account_guid}
 * - charge, refund  refused with 501: the spec has no path containing
 *                   "charge" or "refund"; MX moves no money.
 *
 * Paging: `page` ("Results are paginated. Specify current page.") and
 * `records_per_page` ("Defaults to `25`. The valid range is from `10` to
 * `1000`. If the value exceeds `1000`, the default value of `25` will be used
 * instead."), answered with `pagination` {current_page, per_page,
 * total_entries, total_pages}.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — MX has no gateway-ledger balance-transaction concept; it is a data-aggregation platform
 * Unavailable: charge             — MX's API has no charge resource; it aggregates bank data and moves no money
 * Unavailable: dispute            — MX has no chargeback/dispute system
 * Unavailable: invoice            — MX has no invoice concept
 * Unavailable: payout             — MX has no payout concept
 * Unavailable: plan               — MX has no subscription billing plans
 * Unavailable: refund             — MX's API has no refund resource
 * Unavailable: subscription       — MX has no subscription concept
 */

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
import type { PaymentMethod } from '../../schema/payment-method'

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { MxClient } from './client'

import { transformCustomer, type RawMxUser } from './transform/customer'
import { transformRefund, type RawMxRefund } from './transform/refund'
import { transformPaymentMethod, type RawMxAccount } from './transform/payment-method'

const USERS = '/users'

/** PaginationResponse (components.schemas.PaginationResponse). */
interface MxPagination {
  current_page?: number
  per_page?: number
  total_entries?: number
  total_pages?: number
}

/** UsersResponseBody: `{ users: UserResponse[], pagination }`. */
interface MxUsersResponse {
  users?: RawMxUser[]
  pagination?: MxPagination
}

/** AccountsResponseBody: `{ accounts: AccountResponse[], pagination }`. */
interface MxAccountsResponse {
  accounts?: RawMxAccount[]
  pagination?: MxPagination
}

/**
 * Where the payment-method stream stands: a page of users (loaded, or to be
 * loaded when `users` is absent), the user within it, and that user's page of
 * accounts. Replayable: fetching it again asks for the same pages.
 */
interface AccountCursor {
  usersPage: number
  users?: string[]
  usersMore?: boolean
  index: number
  accountsPage: number
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** The page after this one, from `current_page` and `total_pages`; undefined at the end. */
function nextPage(pagination: MxPagination | undefined): number | undefined {
  const current = pagination?.current_page
  const total = pagination?.total_pages
  if (typeof current !== 'number' || typeof total !== 'number') {
    throw new Error('MX list response carried no pagination.current_page/total_pages')
  }
  return current < total ? current + 1 : undefined
}

function userGuid(user: RawMxUser): string {
  if (typeof user.guid !== 'string' || user.guid === '') {
    throw new Error('MX user has no guid; cannot list its accounts')
  }
  return user.guid
}

function askedLimit(params: QueryParams): number {
  const n = Math.floor(Number(params.limit))
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_PAGE_SIZE
}

export class MxAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'mx'
  readonly version = '0.2.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('MX uses a client_id and API key; submit them via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('MX uses a client_id and API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'clientId',
        label: 'Client ID',
        type: 'text',
        required: true,
      },
      {
        name: 'apiKey',
        label: 'API Key',
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

  private client(credentials: Credentials): MxClient {
    return new MxClient(credentials)
  }

  // ── Customers: GET /users ────────────────────────────────────────────────

  /**
   * GET /users with `page` and `records_per_page`. MX takes 10 to 1,000 a
   * page ("The valid range is from `10` to `1000`. If the value exceeds
   * `1000`, the default value of `25` will be used instead."), so the
   * caller's limit is sent clamped to that range, and `pageByRows` cuts the
   * caller's page out of those MX pages: one MX page per caller page from 10
   * to 1,000, pages of 10 below that, pages of 1,000 joined above it.
   */
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const client = this.client(credentials)
    const size = Math.min(Math.max(askedLimit(params), MIN_PAGE_SIZE), MAX_PAGE_SIZE)
    const { items } = await pageByRows<RawMxUser, number>(
      cursorPagerKey(connectionScope('mx', credentials), USERS, { records_per_page: size }),
      params,
      async (page) => {
        const res = await client.get<MxUsersResponse>(USERS, {
          page: page ?? 1,
          records_per_page: size,
        })
        return { items: res.users ?? [], next: nextPage(res.pagination) }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items.map(transformCustomer)
  }

  /** GET /users/{user_identifier} → `{ user }` (UserResponseBody). */
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ user?: RawMxUser }>(
      `${USERS}/${encodeURIComponent(id)}`,
    )
    if (!res.user) throw new Error(`MX returned no user for ${id}`)
    return transformCustomer(res.user)
  }

  // ── Charges and refunds: not in the API ──────────────────────────────────

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    throw notSupported(
      'MX cannot list charges: the MX Platform API (v20250224) has no charge resource; it aggregates financial data and moves no money.',
    )
  }

  async getCharge(_credentials: Credentials, _id: string): Promise<Charge> {
    throw notSupported(
      'MX cannot read charges: the MX Platform API (v20250224) has no charge resource; it aggregates financial data and moves no money.',
    )
  }

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported(
      'MX cannot list refunds: the MX Platform API (v20250224) has no refund resource; it aggregates financial data and moves no money.',
    )
  }

  // Out of scope for the list rebuild: POST /refunds is not in the MX spec either.
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawMxRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }

  // ── Payment methods: accounts under each user ────────────────────────────

  /**
   * Every user's accounts: GET /users (page by page), then
   * GET /users/{user_identifier}/accounts for each user ("a list of all the
   * accounts associated with the specified `user`"). Accounts come out of
   * pages of users, 0 or many to a user, so `pageByRows` cuts the caller's
   * page out of the stream. Both lists are asked for 1,000 a page, the
   * documented maximum.
   */
  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const client = this.client(credentials)
    const size = MAX_PAGE_SIZE
    const { items } = await pageByRows<PaymentMethod, AccountCursor>(
      cursorPagerKey(connectionScope('mx', credentials), '/users/*/accounts', {
        records_per_page: size,
      }),
      params,
      async (cursor) => {
        let at: AccountCursor = cursor ?? { usersPage: 1, index: 0, accountsPage: 1 }
        if (!at.users) {
          const res = await client.get<MxUsersResponse>(USERS, {
            page: at.usersPage,
            records_per_page: size,
          })
          const users = (res.users ?? []).map(userGuid)
          const usersMore = nextPage(res.pagination) !== undefined
          if (users.length === 0) {
            return {
              items: [],
              next: usersMore
                ? { usersPage: at.usersPage + 1, index: 0, accountsPage: 1 }
                : undefined,
            }
          }
          at = { usersPage: at.usersPage, users, usersMore, index: 0, accountsPage: 1 }
        }
        const users = at.users!
        const res = await client.get<MxAccountsResponse>(
          `${USERS}/${encodeURIComponent(users[at.index]!)}/accounts`,
          { page: at.accountsPage, records_per_page: size },
        )
        const more = nextPage(res.pagination)
        let next: AccountCursor | undefined
        if (more !== undefined) next = { ...at, accountsPage: more }
        else if (at.index + 1 < users.length) next = { ...at, index: at.index + 1, accountsPage: 1 }
        else if (at.usersMore) next = { usersPage: at.usersPage + 1, index: 0, accountsPage: 1 }
        return { items: (res.accounts ?? []).map(transformPaymentMethod), next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  /**
   * GET /users/{user_guid}/accounts/{account_guid} → `{ account }`. An account
   * is read only under its user, so the id is `userGuid:accountGuid`, as
   * listPaymentMethods returns it.
   */
  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const sep = id.indexOf(':')
    const user = sep > 0 ? id.slice(0, sep) : ''
    const account = sep > 0 ? id.slice(sep + 1) : ''
    if (!user || !account) {
      throw Object.assign(
        new Error('MX getPaymentMethod requires the composite id `userGuid:accountGuid`.'),
        { statusCode: 400, code: 'INVALID_ID' },
      )
    }
    const res = await this.client(credentials).get<{ account?: RawMxAccount }>(
      `${USERS}/${encodeURIComponent(user)}/accounts/${encodeURIComponent(account)}`,
    )
    if (!res.account) throw new Error(`MX returned no account for ${id}`)
    return transformPaymentMethod(res.account)
  }
}
