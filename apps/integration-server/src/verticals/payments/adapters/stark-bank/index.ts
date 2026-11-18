/**
 * Stark Bank adapter — payments vertical.
 *
 * Auth: every request is signed with the project's ECDSA private key
 * (Access-Id / Access-Time / Access-Signature, see auth.ts). There is no
 * bearer token and no OAuth.
 *
 * Lists page by cursor (https://docs.starkbank.com/api, Pagination): "List
 * endpoints return at most 100 objects per call, together with a cursor
 * string. To fetch the next batch, repeat the same request with the cursor in
 * the query string (?cursor=...), keeping every other filter unchanged. The
 * cursor comes back as null when there are no more results."
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: customer      — no customer resource in the API or its OpenAPI spec
// Unavailable: charge        — no charge resource in the API or its OpenAPI spec
// Unavailable: refund        — no refund resource in the API or its OpenAPI spec
// Unavailable: dispute      — Stark Bank has no dispute/chargeback API (PixChargeback lives in the separate Stark Infra product)
// Unavailable: payment-method — Stark Bank has no customer payment-method vault (no stored cards/bank accounts per customer)
// Unavailable: plan          — Stark Bank has no Plan/Price/Product catalog; billing is amount-per-subscription

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'
import type { Invoice } from '../../schema/invoice'
import type { Payout } from '../../schema/payout'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { accessIdFrom, buildCredentials } from './auth'
import { StarkBankClient } from './client'
import { verifyStarkBankWebhook, parseStarkBankWebhookEvents } from './webhook'

import { transformRefund, type RawStarkBankRefund } from './transform/refund'
import { transformInvoice, type RawStarkBankInvoice } from './transform/invoice'
import { transformPayout, type RawStarkBankTransfer } from './transform/payout'
import {
  transformBalanceTransaction,
  type RawStarkBankTransaction,
} from './transform/balance-transaction'
import {
  transformSubscription,
  type RawStarkBankInvoicePullSubscription,
} from './transform/subscription'

/** A list or lookup the Stark Bank API does not offer, refused before any request. */
function notSupported(what: string, reason: string): Error {
  return Object.assign(new Error(`Stark Bank cannot ${what}: ${reason}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

const NO_RESOURCE = (name: string): string =>
  `the API reference (https://docs.starkbank.com/api) and its OpenAPI spec ` +
  `(https://docs.starkbank.com/static/starkbank-openapi.yml) have no ${name} resource`

export class StarkBankAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'stark-bank'
  readonly version = '0.2.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('Stark Bank uses a signing key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Stark Bank uses a signing key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'projectId',
        label: 'Project ID',
        type: 'text',
        required: true,
        helpText: 'Sent as Access-Id project/{projectId} on every request.',
      },
      {
        name: 'apiKey',
        label: 'Project Private Key (PEM)',
        type: 'password',
        required: true,
        helpText:
          'The ECDSA (secp256k1) private key whose public key is registered on the project.',
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
    return verifyStarkBankWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseStarkBankWebhookEvents(payload)
  }

  private client(credentials: Credentials): StarkBankClient {
    return new StarkBankClient(credentials)
  }

  /**
   * One caller page of a Stark Bank list. Each list takes `cursor` ("String
   * used to get the next batch of results") and `limit` ("Number of results
   * per cursor. Max = 100."), and returns `{ cursor, <plural>: [...] }` with
   * the cursor null on the last page. One upstream page at the caller's
   * (clamped) limit is one caller page; `pageByCursor` carries the cursor to
   * reach page N.
   */
  private async listPaged<T>(
    credentials: Credentials,
    path: string,
    envelope: string,
    params: QueryParams,
  ): Promise<T[]> {
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    const limit = Number.isFinite(asked)
      ? Math.min(Math.max(Math.floor(asked), 1), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE
    const accessId = accessIdFrom(credentials)
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope(accessId, credentials), path, { limit })
    const result = await pageByCursor<T, string>(key, params.page, async (cursor) => {
      const res = await client.get<Record<string, unknown>>(path, {
        limit,
        ...(cursor !== undefined ? { cursor } : {}),
      })
      const rows = res[envelope]
      const next = res['cursor']
      return {
        items: Array.isArray(rows) ? (rows as T[]) : [],
        next: typeof next === 'string' && next !== '' ? next : undefined,
      }
    })
    reportUpstreamPage(params, {
      hasMore: result.hasMore,
      ...(limit < (params.limit ?? limit) ? { pageSize: limit } : {}),
    })
    return result.items
  }

  // ── Not offered by the API ───────────────────────────────────────────────────

  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported('list customers', NO_RESOURCE('customer'))
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported('get a customer', NO_RESOURCE('customer'))
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    throw notSupported('list charges', NO_RESOURCE('charge'))
  }

  async getCharge(_credentials: Credentials, _id: string): Promise<Charge> {
    throw notSupported('get a charge', NO_RESOURCE('charge'))
  }

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported('list refunds', NO_RESOURCE('refund'))
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawStarkBankRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }

  // ── Invoices (GET /v2/invoice) ───────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const rows = await this.listPaged<RawStarkBankInvoice>(
      credentials,
      '/invoice',
      'invoices',
      params,
    )
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).get<{ invoice?: RawStarkBankInvoice }>(
      `/invoice/${encodeURIComponent(id)}`,
    )
    if (!res.invoice) throw new Error(`Stark Bank returned no invoice for ${id}`)
    return transformInvoice(res.invoice)
  }

  // ── Payouts (GET /v2/transfer) ───────────────────────────────────────────────

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const rows = await this.listPaged<RawStarkBankTransfer>(
      credentials,
      '/transfer',
      'transfers',
      params,
    )
    return rows.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<{ transfer?: RawStarkBankTransfer }>(
      `/transfer/${encodeURIComponent(id)}`,
    )
    if (!res.transfer) throw new Error(`Stark Bank returned no transfer for ${id}`)
    return transformPayout(res.transfer)
  }

  // ── Balance transactions (GET /v2/transaction) ───────────────────────────────

  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    const rows = await this.listPaged<RawStarkBankTransaction>(
      credentials,
      '/transaction',
      'transactions',
      params,
    )
    return rows.map(transformBalanceTransaction)
  }

  async getBalanceTransaction(credentials: Credentials, id: string): Promise<BalanceTransaction> {
    const res = await this.client(credentials).get<{ transaction?: RawStarkBankTransaction }>(
      `/transaction/${encodeURIComponent(id)}`,
    )
    if (!res.transaction) throw new Error(`Stark Bank returned no transaction for ${id}`)
    return transformBalanceTransaction(res.transaction)
  }

  // ── Subscriptions (GET /v2/invoice-pull-subscription) ────────────────────────

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const rows = await this.listPaged<RawStarkBankInvoicePullSubscription>(
      credentials,
      '/invoice-pull-subscription',
      'subscriptions',
      params,
    )
    return rows.map(transformSubscription)
  }

  /**
   * The single-get key is `subscription`: the official SDK reads
   * `json[api.lastName(resource['name'])]` for `InvoicePullSubscription`
   * (starkcore utils/rest.js getId), and lastName is "subscription". The
   * docs' example response for this route shows `"subscriptions": {...}`,
   * which contradicts the SDK and the list/single naming every other
   * resource here follows (invoices/invoice, transfers/transfer), so this
   * reads the SDK's key.
   */
  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<{
      subscription?: RawStarkBankInvoicePullSubscription
    }>(`/invoice-pull-subscription/${encodeURIComponent(id)}`)
    if (!res.subscription) throw new Error(`Stark Bank returned no subscription for ${id}`)
    return transformSubscription(res.subscription)
  }
}
