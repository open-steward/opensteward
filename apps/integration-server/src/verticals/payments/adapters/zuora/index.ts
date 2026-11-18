/**
 * Zuora adapter — payments vertical.
 *
 * Reads customers (Zuora Accounts), charges (Zuora Payments) and refunds
 * through the v1 Object Query API. Zuora has no payout resource.
 *
 * Auth is OAuth client credentials against the connection's environment host
 * (see auth.ts and constants.ts).
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Customer } from '../../schema/customer'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Payout } from '../../schema/payout'

import { fetchToken } from './auth'
import { ZuoraClient, baseUrlOf } from './client'
import {
  DEFAULT_ENVIRONMENT,
  DEFAULT_PAGE_SIZE,
  ENVIRONMENT_LABELS,
  HOSTS,
  MAX_PAGE_SIZE,
  isZuoraEnvironment,
} from './constants'

import { transformCustomer, type RawZuoraAccount } from './transform/customer'
import { transformCharge, type RawZuoraPayment } from './transform/charge'
import { transformRefund, type RawZuoraRefund } from './transform/refund'

/** An Object Query list response: `data` and, "if it exists", `nextPage`. */
interface ObjectQueryList<T> {
  data?: T[]
  nextPage?: string | null
}

/**
 * Query pairs that pick WHICH rows an Object Query list returns, fixed per
 * resource. Every one is documented on its operation page:
 *   accounts: `expand[]` enum includes "billto"
 *   refunds:  `expand[]` enum includes "refundapplications"; `filter[]`
 *             filterable fields include "sourcetype", whose values are
 *             "Payment", "CreditBalance", "CreditMemo". Only a refund of a
 *             payment refunds a charge, so the other two are not listed.
 * The operator syntax (`<field>.EQ:<value>`, `updateddate.GE:…`) is from
 * https://developer.zuora.com/docs/guides/expand-filter-fields-sort.md.
 */
const LIST_QUERY: Record<'accounts' | 'payments' | 'refunds', Array<[string, string]>> = {
  accounts: [['expand[]', 'billto']],
  payments: [],
  refunds: [
    ['filter[]', 'sourcetype.EQ:Payment'],
    ['expand[]', 'refundapplications'],
  ],
}

/** The expansions a single-record read needs for the same transform. */
const GET_QUERY: Record<'accounts' | 'payments' | 'refunds', Array<[string, string]>> = {
  accounts: [['expand[]', 'billto']],
  payments: [],
  refunds: [['expand[]', 'refundapplications']],
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * The cursor-pager scope of one connection: its host plus a fingerprint of
 * its OAuth client. A client-credentials connection has no refresh token and
 * mints a new access token on every refresh, so fingerprinting the access
 * token (connectionScope's fallback) would restart every walk after a
 * refresh. The client ID and secret are what stay fixed for the connection;
 * connectionScope hashes them, so neither lands in a key. A connection stored
 * without them falls back to its tokens.
 */
function pagerScope(credentials: Credentials): string {
  const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
  const clientId = typeof extra.clientId === 'string' ? extra.clientId : ''
  const clientSecret = typeof extra.clientSecret === 'string' ? extra.clientSecret : ''
  const account = `zuora:${baseUrlOf(credentials)}`
  return clientId && clientSecret
    ? connectionScope(account, { accessToken: '', refreshToken: `${clientId}:${clientSecret}` })
    : connectionScope(account, credentials)
}

/** ISO-8601 without milliseconds, the form the filter guide shows (`2024-01-01T00:00:00Z`). */
function filterTimestamp(value: Date): string {
  return value.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export class ZuoraAdapter implements PaymentsAdapter {
  readonly platform = 'zuora'
  readonly version = '0.2.0'
  /** Object Query: "the maximum value for `pageSize` is 99". */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error(
      'Zuora uses OAuth client credentials; submit the client ID and secret via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Zuora uses OAuth client credentials; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: (Object.keys(HOSTS) as Array<keyof typeof HOSTS>).map((value) => ({
          value,
          label: `${ENVIRONMENT_LABELS[value]} — ${HOSTS[value]}`,
        })),
        helpText: 'The Zuora environment your tenant runs in; each has its own REST base URL.',
      },
      {
        name: 'clientId',
        label: 'OAuth client ID',
        type: 'text',
        required: true,
        helpText: 'Created by a Zuora administrator in the Zuora UI.',
      },
      { name: 'clientSecret', label: 'OAuth client secret', type: 'password', required: true },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    const env = fields.environment || DEFAULT_ENVIRONMENT
    if (!isZuoraEnvironment(env)) throw new Error(`Unknown Zuora environment: ${env}`)
    return fetchToken(fields.clientId ?? '', fields.clientSecret ?? '', HOSTS[env])
  }

  /** Client-credentials tokens have no refresh token: mint a new one from the stored client. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
    return fetchToken(
      String(extra.clientId ?? ''),
      String(extra.clientSecret ?? ''),
      baseUrlOf(credentials),
    )
  }

  private client(credentials: Credentials): ZuoraClient {
    return new ZuoraClient(credentials)
  }

  /**
   * One caller page of an Object Query list.
   *
   * Every Object Query list documents `pageSize` ("If the specified pageSize
   * is less than 1 or greater than 99, Zuora will return a 400 error") and
   * `cursor`, and returns `nextPage`: "A string that can be used as the
   * cursor value to retrieve the next page of the response if it exists;
   * otherwise absent." Page N is reached through {@link pageByCursor}; the
   * end is `nextPage`'s absence. A limit above 99 is clamped and the size
   * sent is reported.
   *
   * `updatedAfter` becomes `filter[]=updateddate.GE:<ISO>`: `updateddate` is
   * a filterable field of accounts, payments and refunds alike.
   */
  private async pageList<T>(
    credentials: Credentials,
    params: QueryParams,
    resource: 'accounts' | 'payments' | 'refunds',
  ): Promise<T[]> {
    const asked =
      typeof params.limit === 'number' && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_PAGE_SIZE
    const limit = Math.min(asked, MAX_PAGE_SIZE)
    const fixed: Array<[string, string]> = [...LIST_QUERY[resource]]
    if (params.updatedAfter instanceof Date) {
      fixed.push(['filter[]', `updateddate.GE:${filterTimestamp(params.updatedAfter)}`])
    }
    const path = `/object-query/${resource}`
    const client = this.client(credentials)
    const key = cursorPagerKey(pagerScope(credentials), path, {
      query: fixed.map(([k, v]) => `${k}=${v}`).join('&'),
      limit,
    })
    const { items, hasMore } = await pageByCursor<T>(key, params.page, async (cursor) => {
      const query = new URLSearchParams(fixed)
      query.set('pageSize', String(limit))
      if (cursor !== undefined) query.set('cursor', cursor)
      const res = await client.get<ObjectQueryList<T>>(path, query)
      return { items: res.data ?? [], next: res.nextPage || undefined }
    })
    reportUpstreamPage(params, limit < asked ? { hasMore, pageSize: limit } : { hasMore })
    return items
  }

  /** `GET /object-query/<resource>/{key}` — "Object ID or Number." */
  private async getOne<T>(
    credentials: Credentials,
    resource: 'accounts' | 'payments' | 'refunds',
    id: string,
  ): Promise<T> {
    return this.client(credentials).get<T>(
      `/object-query/${resource}/${encodeURIComponent(id)}`,
      GET_QUERY[resource].length ? new URLSearchParams(GET_QUERY[resource]) : undefined,
    )
  }

  // ── Customers (Zuora Accounts) ──────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await this.pageList<RawZuoraAccount>(credentials, params, 'accounts')
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    return transformCustomer(await this.getOne<RawZuoraAccount>(credentials, 'accounts', id))
  }

  // ── Charges (Zuora Payments) ────────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.pageList<RawZuoraPayment>(credentials, params, 'payments')
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    return transformCharge(await this.getOne<RawZuoraPayment>(credentials, 'payments', id))
  }

  // ── Refunds ─────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const rows = await this.pageList<RawZuoraRefund>(credentials, params, 'refunds')
    return rows.map(transformRefund)
  }

  /**
   * A refund whose `sourceType` is not "Payment" ("CreditBalance",
   * "CreditMemo") refunds no charge, so listRefunds filters it out; reading
   * one by id answers 404, as its absence from the list does, rather than
   * failing the transform with a 500.
   */
  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const raw = await this.getOne<RawZuoraRefund>(credentials, 'refunds', id)
    if (raw.sourceType !== 'Payment') {
      throw Object.assign(
        new Error(
          `Zuora refund ${id} has sourceType ${String(raw.sourceType)}, not Payment, so it refunds no charge`,
        ),
        { statusCode: 404, code: 'NOT_FOUND' },
      )
    }
    return transformRefund(raw)
  }

  // ── Payouts ─────────────────────────────────────────────────────────────

  /**
   * Zuora's v1 and Quickstart API references have no payout resource; the
   * word appears only as a field on payments and refunds: `payoutId`, "The
   * payout ID of the payment from the gateway side."
   */
  async listPayouts(_credentials: Credentials, _params: QueryParams): Promise<Payout[]> {
    throw notSupported(
      'Zuora cannot list payouts: its API has no payout resource, only a `payoutId` field described as "The payout ID of the payment from the gateway side."',
    )
  }

  async getPayout(_credentials: Credentials, _id: string): Promise<Payout> {
    throw notSupported(
      'Zuora cannot read payouts: its API has no payout resource, only a `payoutId` field described as "The payout ID of the payment from the gateway side."',
    )
  }
}
