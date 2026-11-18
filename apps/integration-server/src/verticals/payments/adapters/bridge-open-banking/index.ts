/**
 * Bridge (Bridgeapi) adapter — payments vertical.
 *
 * Reads payment-request transactions as charges and payment-account payouts.
 *
 * Auth is the application's `Client-Id` / `Client-Secret` pair on every
 * request (https://docs.bridgeapi.io/docs/basics.md), entered through the
 * Connect Link form. Bridge documents no OAuth authorize endpoint.
 *
 * Paging (docs/basics.md): "Bridge uses a cursor-based pagination via the
 * `after` parameter.", `limit` "Accepted values: 1 - 500. Default 50.", and
 * `next_uri` "Can be `null` if there are no more results in the list."
 * Both lists walk `after` (read from `next_uri`) with `pageByRows`: payment
 * requests hold one or more transactions each, so one upstream page is not
 * one caller page of charges.
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Payout } from '../../schema/payout'

import { buildCredentials } from './auth'
import { BridgeOpenBankingClient, nextAfter, type BridgeListResponse } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformCharge,
  transformPaymentRequest,
  type RawBridgePaymentRequest,
} from './transform/charge'
import { transformPayout, type RawBridgeOpenBankingPayout } from './transform/payout'

const PAYMENT_REQUESTS = '/payment/payment-requests'
const PAYOUTS = '/payment/payment-account/payouts'

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

export class BridgeOpenBankingAdapter implements PaymentsAdapter {
  readonly platform = 'bridge-open-banking'
  readonly version = '0.2.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error(
      'Bridge authenticates with Client-Id/Client-Secret headers; submit them via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error(
      'Bridge authenticates with Client-Id/Client-Secret headers; call exchangeCredentials instead.',
    )
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'clientId',
        label: 'Client ID',
        type: 'text',
        required: true,
        helpText: 'Your Bridge application client id (sent as the Client-Id header).',
      },
      {
        name: 'clientSecret',
        label: 'Client secret',
        type: 'password',
        required: true,
        helpText: 'Your Bridge application client secret (sent as the Client-Secret header).',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Application client credentials do not expire; nothing to refresh.
    return credentials
  }

  private client(credentials: Credentials): BridgeOpenBankingClient {
    return new BridgeOpenBankingClient(credentials)
  }

  /**
   * The caller's page of rows cut from a Bridge list walked by `after`.
   * `limit` is the caller's limit capped at the documented 500 and is part of
   * the walk's key, since a cursor minted under one limit is another position
   * under another.
   */
  private async listByAfter<R, T>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    toRows: (raw: R) => T[],
  ): Promise<T[]> {
    const limit = Math.min(
      Math.max(1, Math.floor(params.limit ?? DEFAULT_PAGE_SIZE)),
      MAX_PAGE_SIZE,
    )
    const key = cursorPagerKey(connectionScope('bridge-open-banking', credentials), path, { limit })
    const client = this.client(credentials)
    const { items } = await pageByRows<T>(
      key,
      params,
      async (after) => {
        const res = await client.get<BridgeListResponse<R>>(path, {
          limit,
          ...(after !== undefined ? { after } : {}),
        })
        return {
          items: (res.resources ?? []).flatMap(toRows),
          next: nextAfter(res.pagination?.next_uri),
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  /** GET /v3/payment/payment-requests — one Charge per payment-request transaction. */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    return this.listByAfter<RawBridgePaymentRequest, Charge>(
      credentials,
      params,
      PAYMENT_REQUESTS,
      transformPaymentRequest,
    )
  }

  /** GET /v3/payment/payment-requests/{id}, then the transaction named by the Charge id. */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const sep = id.indexOf(':')
    if (sep <= 0 || sep === id.length - 1) {
      throw notFound(
        `Bridge charge id must be '<payment request id>:<transaction id>', got '${id}'`,
      )
    }
    const requestId = id.slice(0, sep)
    const transactionId = id.slice(sep + 1)
    const request = await this.client(credentials).get<RawBridgePaymentRequest>(
      `${PAYMENT_REQUESTS}/${encodeURIComponent(requestId)}`,
    )
    const tx = (request.transactions ?? []).find((t) => t.id === transactionId)
    if (!tx)
      throw notFound(`Bridge payment request ${requestId} has no transaction ${transactionId}`)
    return transformCharge(request, tx)
  }

  /** GET /v3/payment/payment-account/payouts */
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    return this.listByAfter<RawBridgeOpenBankingPayout, Payout>(
      credentials,
      params,
      PAYOUTS,
      (raw) => [transformPayout(raw)],
    )
  }

  /** GET /v3/payment/payment-account/payouts/{id} */
  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const raw = await this.client(credentials).get<RawBridgeOpenBankingPayout>(
      `${PAYOUTS}/${encodeURIComponent(id)}`,
    )
    return transformPayout(raw)
  }
}
