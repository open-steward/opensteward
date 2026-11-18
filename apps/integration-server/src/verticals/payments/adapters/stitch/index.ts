/**
 * Stitch adapter — payments vertical.
 *
 * Stitch's API is GraphQL (POST https://api.stitch.money/graphql). Charges are
 * Pay By Bank payment requests (Client.paymentInitiationRequests) and payouts are
 * disbursements (Client.disbursements), both Relay connections paged with
 * `first` / `after` and `pageInfo { hasNextPage endCursor }`
 * (https://docs.stitch.money/graphql/pagination, https://docs.stitch.money/api/objects/client).
 * Single records are read with the `node(id:)` query, as in the documented
 * GetDisbursementStatus and GetPaymentRequestStatus queries.
 *
 * Auth: a client token from the OAuth 2.0 client-credentials flow, minted from the
 * merchant's Stitch client_id / client_secret entered on the Connect Link form
 * (https://docs.stitch.money/authentication/client-tokens).
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
  type BaseAdapter,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Payout } from '../../schema/payout'

import { exchangeCredentials, readExtra, refreshCredentials as doRefresh } from './auth'
import { StitchClient, type Connection } from './client'
import { DEFAULT_PAGE_SIZE, DISBURSEMENTS_MAX_FIRST, MAX_PAGE_SIZE } from './constants'

import { transformCharge, type RawStitchPaymentRequest } from './transform/charge'
import { transformPayout, type RawStitchDisbursement } from './transform/payout'

const PAYMENT_REQUEST_FIELDS = `
  id
  created
  updated
  amount
  beneficiaryReference
  externalReference
  metadata
  state {
    __typename
    ... on PaymentInitiationRequestCompleted { date }
    ... on PaymentInitiationRequestCancelled { date reason }
    ... on PaymentInitiationRequestExpired { date }
  }`

const DISBURSEMENT_FIELDS = `
  id
  created
  amount
  nonce
  externalReference
  beneficiaryReference
  linkedAccountId
  status {
    __typename
    ... on DisbursementPending { date }
    ... on DisbursementSubmitted { date }
    ... on DisbursementCompleted { date expectedSettlement }
    ... on DisbursementError { date disbursementErrorReason disbursementErrorDescription }
    ... on DisbursementPaused { date disbursementPausedReason }
    ... on DisbursementReversed { date disbursementReversedDescription disbursementReversedReason }
    ... on DisbursementCancelled { date disbursementCancelledReason }
  }`

export const LIST_PAYMENT_REQUESTS_QUERY = `query ListPaymentRequests($first: UInt!, $after: Cursor, $filter: PaymentInitiationRequestFilterInput) {
  client {
    paymentInitiationRequests(first: $first, after: $after, filter: $filter) {
      edges { node {${PAYMENT_REQUEST_FIELDS}
      } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

export const GET_PAYMENT_REQUEST_QUERY = `query GetPaymentRequest($id: ID!) {
  node(id: $id) {
    __typename
    ... on PaymentInitiationRequest {${PAYMENT_REQUEST_FIELDS}
    }
  }
}`

export const LIST_DISBURSEMENTS_QUERY = `query ListDisbursements($first: UInt!, $after: Cursor) {
  client {
    disbursements(first: $first, after: $after) {
      edges { node {${DISBURSEMENT_FIELDS}
      } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

export const GET_DISBURSEMENT_QUERY = `query GetDisbursement($id: ID!) {
  node(id: $id) {
    __typename
    ... on Disbursement {${DISBURSEMENT_FIELDS}
    }
  }
}`

function notFound(what: string, id: string): Error {
  return Object.assign(new Error(`Stitch ${what} ${id} not found`), {
    statusCode: 404,
    code: 'NOT_FOUND',
  })
}

export class StitchAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'stitch'
  readonly version = '0.2.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('Stitch uses client credentials; submit them via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Stitch uses client credentials; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'clientId',
        label: 'Client ID',
        type: 'text',
        required: true,
        helpText: 'The Stitch client_id issued to you by the Stitch team.',
      },
      {
        name: 'clientSecret',
        label: 'Client secret',
        type: 'password',
        required: true,
        helpText:
          'The Stitch client_secret. The client needs the client_paymentrequest and client_disbursement scopes.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  private client(credentials: Credentials): StitchClient {
    return new StitchClient(credentials)
  }

  private scope(credentials: Credentials): string {
    return connectionScope(`stitch:${readExtra(credentials).clientId}`, credentials)
  }

  /** The caller's exact limit, clamped to the field's maximum `first` (see constants). */
  private pageSize(params: QueryParams, max: number): number {
    const asked =
      typeof params.limit === 'number' && params.limit > 0
        ? Math.floor(params.limit)
        : DEFAULT_PAGE_SIZE
    const size = Math.min(asked, max)
    if (typeof params.limit === 'number' && size < params.limit)
      reportUpstreamPage(params, { pageSize: size })
    return size
  }

  /**
   * Client.paymentInitiationRequests(first, after, filter): "Payment requests are
   * ordered in *reverse chronological* order." `updatedAfter` becomes the documented
   * filter `{ updated: { gte } }` (PaymentInitiationRequestFilterInput.updated : DateFilterInput).
   */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const first = this.pageSize(params, MAX_PAGE_SIZE)
    const filter =
      params.updatedAfter instanceof Date
        ? { updated: { gte: params.updatedAfter.toISOString() } }
        : undefined
    const client = this.client(credentials)
    const key = cursorPagerKey(this.scope(credentials), 'paymentInitiationRequests', {
      first,
      filter,
    })
    const { items, hasMore } = await pageByCursor<RawStitchPaymentRequest>(
      key,
      params.page,
      async (after) => {
        const data = await client.query<{
          client: { paymentInitiationRequests: Connection<RawStitchPaymentRequest> }
        }>(LIST_PAYMENT_REQUESTS_QUERY, {
          first,
          ...(after ? { after } : {}),
          ...(filter ? { filter } : {}),
        })
        const conn = data.client.paymentInitiationRequests
        return {
          items: (conn.edges ?? []).map((e) => e.node),
          next:
            conn.pageInfo.hasNextPage && conn.pageInfo.endCursor ? conn.pageInfo.endCursor : null,
        }
      },
    )
    reportUpstreamPage(params, { hasMore })
    return items.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    readExtra(credentials) // a pre-rebuild user-token connection is 401 REAUTH_REQUIRED
    const data = await this.client(credentials).query<{
      node: (RawStitchPaymentRequest & { __typename?: string }) | null
    }>(GET_PAYMENT_REQUEST_QUERY, { id })
    if (!data.node || data.node.__typename !== 'PaymentInitiationRequest')
      throw notFound('payment request', id)
    return transformCharge(data.node)
  }

  /**
   * Client.disbursements(first, after). DisbursementFilterInput has only `created`,
   * not an updated date, and a disbursement's status changes after creation, so
   * `updatedAfter` is not narrowed upstream: the full collection is a superset.
   */
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const first = this.pageSize(params, DISBURSEMENTS_MAX_FIRST)
    const client = this.client(credentials)
    const key = cursorPagerKey(this.scope(credentials), 'disbursements', { first })
    const { items, hasMore } = await pageByCursor<RawStitchDisbursement>(
      key,
      params.page,
      async (after) => {
        const data = await client.query<{
          client: { disbursements: Connection<RawStitchDisbursement> }
        }>(LIST_DISBURSEMENTS_QUERY, { first, ...(after ? { after } : {}) })
        const conn = data.client.disbursements
        return {
          items: (conn.edges ?? []).map((e) => e.node),
          next:
            conn.pageInfo.hasNextPage && conn.pageInfo.endCursor ? conn.pageInfo.endCursor : null,
        }
      },
    )
    reportUpstreamPage(params, { hasMore })
    return items.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    readExtra(credentials) // a pre-rebuild user-token connection is 401 REAUTH_REQUIRED
    const data = await this.client(credentials).query<{
      node: (RawStitchDisbursement & { __typename?: string }) | null
    }>(GET_DISBURSEMENT_QUERY, { id })
    if (!data.node || data.node.__typename !== 'Disbursement') throw notFound('disbursement', id)
    return transformPayout(data.node)
  }
}
