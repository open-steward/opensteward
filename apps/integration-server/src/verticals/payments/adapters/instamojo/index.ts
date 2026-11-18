/**
 * Instamojo adapter: payments vertical, on the Mojo Developers Program (MDP)
 * v2 API with the merchant's OAuth token.
 *
 * Reads: charges (List Payments) and payouts (List Payouts). Customers and
 * refunds have no list the MDP token can call, so those methods refuse.
 *
 * Docs index: https://docs.instamojo.com/v2-mdp/llms.txt
 */

import { connectionScope, cursorPagerKey, pageByRows } from '@opensteward/shared'
import type { Credentials, CursorPage, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Customer } from '../../schema/customer'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Payout } from '../../schema/payout'

import { buildAuthUrl, exchangeCode as doExchange, refreshCredentials as doRefresh } from './auth'
import { InstamojoClient, type ListEnvelope } from './client'
import { DEFAULT_SCOPES } from './constants'

import { transformCharge, type RawInstamojoPayment } from './transform/charge'
import { transformPayout, type RawInstamojoPayout } from './transform/payout'

/** https://docs.instamojo.com/v2-mdp/reference/payments: GET /v2/payments/ */
const PAYMENTS_PATH = '/v2/payments/'
/** https://docs.instamojo.com/v2-mdp/reference/payouts: GET /v2/payouts/ */
const PAYOUTS_PATH = '/v2/payouts/'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

/**
 * The query of a DRF `next` link, as params for the same path on our own host.
 *
 * The documented example is "next": "https://test.instamojo.com/v2/payments/?page=2".
 * Only its query is used, so the Bearer token is never sent to whatever host
 * a next link names.
 */
function nextParams(next: string): Record<string, string> {
  return Object.fromEntries(new URL(next).searchParams)
}

export interface InstamojoAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class InstamojoAdapter implements PaymentsAdapter {
  readonly platform = 'instamojo'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: InstamojoAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return doExchange(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): InstamojoClient {
    return new InstamojoClient(credentials)
  }

  /**
   * One caller page of a DRF-paginated MDP list.
   *
   * Neither List Payments nor List Payouts documents a page-size parameter,
   * so the upstream page is whatever size Instamojo serves. pageByRows walks
   * the `next` chain (cursor = the next link's query) and cuts exactly the
   * caller's rows out of it, reporting `hasMore` from `next` being null.
   */
  private async listPaged<K extends string, R, T>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    envelope: K,
    filters: Record<string, string>,
    transform: (raw: R) => T,
  ): Promise<T[]> {
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope('instamojo', credentials), path, filters)
    const { items } = await pageByRows<T, string>(
      key,
      params,
      async (cursor): Promise<CursorPage<T, string>> => {
        const query = cursor === undefined ? filters : nextParams(cursor)
        const body = await client.get<ListEnvelope<K, R>>(path, query)
        const rows = body[envelope] ?? []
        return {
          items: (rows as R[]).map(transform),
          next: typeof body.next === 'string' && body.next !== '' ? body.next : null,
        }
      },
    )
    return items
  }

  /** Read one row through the list's documented `id` query filter. */
  private async getById<K extends string, R, T>(
    credentials: Credentials,
    path: string,
    envelope: K,
    id: string,
    transform: (raw: R) => T,
    what: string,
  ): Promise<T> {
    const body = await this.client(credentials).get<ListEnvelope<K, R>>(path, { id })
    const rows = (body[envelope] ?? []) as Array<R & { id?: unknown }>
    const hit = rows.find((r) => r.id === id)
    if (!hit) throw notFound(`Instamojo ${what} ${id} not found`)
    return transform(hit)
  }

  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported(
      'Instamojo cannot list customers: no v1.1, v2 or MDP reference page documents a customers ' +
        'resource; the MDP User APIs "pertains to the Users on the Instamojo Platform" (the ' +
        'connected merchant), not its buyers',
    )
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported(
      'Instamojo cannot read customers: no v1.1, v2 or MDP reference page documents a customers resource',
    )
  }

  /**
   * GET https://api.instamojo.com/v2/payments/
   * (https://docs.instamojo.com/v2-mdp/reference/payments). `updatedAfter`
   * maps to the documented `min_updated_at` filter.
   */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const filters: Record<string, string> = {}
    if (params.updatedAfter instanceof Date) {
      filters['min_updated_at'] = params.updatedAfter.toISOString()
    }
    return this.listPaged<'payments', RawInstamojoPayment, Charge>(
      credentials,
      params,
      PAYMENTS_PATH,
      'payments',
      filters,
      transformCharge,
    )
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    return this.getById<'payments', RawInstamojoPayment, Charge>(
      credentials,
      PAYMENTS_PATH,
      'payments',
      id,
      transformCharge,
      'payment',
    )
  }

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported(
      'Instamojo cannot list refunds with an MDP OAuth token: the MDP reference documents only ' +
        '"Create a Refund", and the v1.1 "List of refunds" requires "X-Api-Key" and "X-Auth-Token"',
    )
  }

  async getRefund(_credentials: Credentials, _id: string): Promise<Refund> {
    throw notSupported(
      'Instamojo cannot read refunds with an MDP OAuth token: v2 "Get details of a refund" needs ' +
        'token scope "cases:read", which is not one of the MDP scopes, and v1.1 "Details of a ' +
        'refund" requires "X-Api-Key" and "X-Auth-Token"',
    )
  }

  /**
   * GET https://api.instamojo.com/v2/payouts/
   * (https://docs.instamojo.com/v2-mdp/reference/payouts). Its only filters
   * are id, start_time and end_time (paid-out time), so `updatedAfter` is
   * not sent and the full collection is served.
   */
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    return this.listPaged<'payouts', RawInstamojoPayout, Payout>(
      credentials,
      params,
      PAYOUTS_PATH,
      'payouts',
      {},
      transformPayout,
    )
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    return this.getById<'payouts', RawInstamojoPayout, Payout>(
      credentials,
      PAYOUTS_PATH,
      'payouts',
      id,
      transformPayout,
      'payout',
    )
  }
}
