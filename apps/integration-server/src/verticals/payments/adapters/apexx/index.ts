/**
 * APEXX Global adapter — payments vertical.
 *
 * APEXX Global is a UK-based payment orchestration platform: a single Atomic
 * REST API routes card payments (plus APMs like PayPal, Klarna, iDEAL) to many
 * downstream acquirers. A canonical "charge" maps to an APEXX *transaction*; a
 * refund is a transaction with `transaction_type: 'REFUND'`.
 *
 * Auth: a static API key sent in the `x-apikey` header (no OAuth). The key and
 * the merchant `account` id are collected through the Connect Link form (see
 * `auth.ts`). APEXX requires at least TLS 1.2 on every connection.
 *
 * Resources implemented (only what the Atomic API exposes; the rest auto-501):
 *   - Charges: list, get, create, captureCharge, cancelCharge
 *   - Refunds: createRefund
 *
 * APEXX has no discrete customer resource (transactions carry a `customer_id`
 * and inline billing address), and its only signing mechanism — an HMAC over a
 * fixed field list — secures the Hosted-Payment-Page redirect, not raw webhook
 * bodies, so it doesn't fit the synchronous `verifyWebhook(payload, headers,
 * secret)` contract. Neither customers nor webhook verification are implemented.
 *
 * Docs: https://support.apexx.global/support/solutions/articles/19000111097-apexx-api-reference
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — APEXX is a payment-routing layer with no balance or ledger API.
 * Unavailable: customer — no discrete customer resource; customer_id and billing address are embedded inline on each transaction.
 * Unavailable: dispute — chargebacks arrive only through reconciliation files and webhook notifications, not a queryable REST endpoint.
 * Unavailable: invoice — APEXX has no invoicing or billing engine; no invoice endpoints exist.
 * Unavailable: payout — OCT/payout transactions are submitted via Virtual Terminal UI; no list or get REST endpoint is documented.
 * Unavailable: plan — APEXX has no subscription billing engine; no plan/price/product endpoints exist.
 * Unavailable: subscription — APEXX has no subscription billing engine; no subscription endpoints exist.
 * Unverified:  payment-method — APEXX supports card tokenisation but the full API Swagger UI was not publicly accessible to confirm a token-listing endpoint.
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'

import { DEFAULT_PAGE_SIZE } from './constants'
import { CREDENTIAL_FIELDS, buildCredentials } from './auth'
import { ApexxClient } from './client'

import {
  transformCharge,
  untransformCharge,
  type RawApexxTransaction,
} from './transform/charge'
import { transformRefund, type RawApexxRefund } from './transform/refund'

/** `GET /transactions` returns either a bare array or a `{ data | items }` wrapper. */
type ApexxList<T> = T[] | { data?: T[]; items?: T[]; transactions?: T[] }

function listItems<T>(res: ApexxList<T>): T[] {
  if (Array.isArray(res)) return res
  return res.data ?? res.items ?? res.transactions ?? []
}

function account(credentials: Credentials): string | undefined {
  const value = credentials.extra?.account
  return typeof value === 'string' ? value : undefined
}

export class ApexxAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'apexx'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('APEXX uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('APEXX uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): ApexxClient {
    return new ApexxClient(credentials)
  }

  // ── Charges (Atomic transactions) ─────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const res = await this.client(credentials).get<ApexxList<RawApexxTransaction>>('/transactions', {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page !== undefined ? { page: params.page } : {}),
    })
    return listItems(res).map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawApexxTransaction>(`/transactions/${id}`)
    return transformCharge(res ?? {})
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    if (data.amount === undefined) throw new Error('amount required to create an APEXX transaction')
    if (!data.currency) throw new Error('currency required to create an APEXX transaction')
    const body: Record<string, unknown> = { ...untransformCharge(data) }
    const acct = account(credentials)
    if (acct) body.account = acct
    const res = await this.client(credentials).post<RawApexxTransaction>('/payment/direct', body)
    return transformCharge(res ?? {})
  }

  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const body: Record<string, unknown> = {}
    const acct = account(credentials)
    if (acct) body.account = acct
    if (data?.amount !== undefined) body.amount = data.amount
    const res = await this.client(credentials).post<RawApexxTransaction>(`/capture/${id}`, body)
    return transformCharge(res ?? {})
  }

  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const body: Record<string, unknown> = {}
    const acct = account(credentials)
    if (acct) body.account = acct
    const res = await this.client(credentials).post<RawApexxTransaction>(
      `/cancel/payment/${id}`,
      body,
    )
    return transformCharge(res ?? {})
  }

  // ── Refunds (a transaction with type REFUND) ──────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId required for APEXX refund')
    const body: Record<string, unknown> = {}
    const acct = account(credentials)
    if (acct) body.account = acct
    if (data.amount !== undefined) body.amount = data.amount
    const res = await this.client(credentials).post<RawApexxRefund>(
      `/refund/${data.chargeId}`,
      body,
    )
    return transformRefund(res ?? {}, data.chargeId)
  }
}
