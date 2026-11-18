/**
 * Salt Edge adapter — payments vertical (open-banking / account information).
 *
 * Salt Edge is an Account Information API (AIS): it aggregates bank
 * connections, accounts and transactions across thousands of providers in
 * Europe and beyond. It is read-mostly — there are no charges to capture,
 * refunds, subscriptions, invoices, payouts, disputes, or a product catalog,
 * so the adapter implements only the resources that map cleanly:
 *
 *   - Customers  (Salt Edge customers — the owner of bank connections)
 *   - Charges    (Salt Edge transactions — individual money movements)
 *
 * Everything else on the PaymentsAdapter interface is intentionally left
 * unimplemented; the router returns 501 for those.
 *
 * Auth: api_key — `App-id` + `Secret` headers (no OAuth).
 * Docs: https://docs.saltedge.com/v6/api_reference/
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: balance-transaction — Salt Edge is an AIS/PIS; it has no concept of gateway balance transactions.
// Unavailable: dispute            — Salt Edge does not process card payments and has no dispute management API.
// Unavailable: invoice            — Salt Edge is not a billing platform; it has no invoicing concept.
// Unavailable: payment-method     — Salt Edge does not store card or bank-account payment methods on behalf of merchants.
// Unavailable: payout             — Salt Edge has no payout / disbursement API; it only initiates account-to-account payments.
// Unavailable: plan               — Salt Edge has no subscription billing catalog (plans, prices, products).
// Unavailable: refund             — Salt Edge does not process card payments and therefore has no refund API.
// Unavailable: subscription       — Salt Edge has no subscription management API; VRP consents are not equivalent to merchant subscriptions.

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import { connectionScope, cursorPagerKey, pageByRows } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { WebhookEvent } from '../../schema/webhook'

import { API_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { SaltEdgeClient } from './client'
import { parseSaltEdgeWebhookEvents, verifySaltEdgeWebhook } from './webhook'

import { transformCustomer, type RawSaltEdgeCustomer } from './transform/customer'
import { transformCharge, type RawSaltEdgeTransaction } from './transform/charge'

function clampPerPage(limit: number | undefined): number {
  if (limit == null) return DEFAULT_PAGE_SIZE
  return Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, limit))
}

export class SaltEdgeAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'salt-edge'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Salt Edge uses App-id + Secret; submit them via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Salt Edge uses App-id + Secret; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'appId',
        label: 'App-id',
        type: 'text',
        required: true,
        helpText: 'Generated under Client dashboard → Profile → Secrets.',
      },
      {
        name: 'secret',
        label: 'Secret',
        type: 'password',
        required: true,
        helpText: 'The Secret paired with your App-id (same Secrets page).',
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
    return verifySaltEdgeWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSaltEdgeWebhookEvents(payload)
  }

  private client(credentials: Credentials): SaltEdgeClient {
    return new SaltEdgeClient(credentials)
  }

  // ── Customers ──────────────────────────────────────────────────────────────

  /**
   * GET /customers pages by id keyset: `per_page` (100–1000, default 100) and
   * `from_id`, the id the page starts with, taken from the previous page's
   * `meta.next_id` (null or absent on the last page). A caller page under 100
   * rows cannot be one upstream page, so pageByRows walks `from_id` and cuts
   * the caller's rows out, with `per_page` sized from the caller's limit.
   * https://docs.saltedge.com/v6/#pagination
   */
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const client = this.client(credentials)
    const perPage = clampPerPage(params.limit)
    const key = cursorPagerKey(connectionScope(API_BASE_URL, credentials), 'customers', {
      per_page: perPage,
    })
    const { items } = await pageByRows<RawSaltEdgeCustomer, string>(
      key,
      params,
      async (fromId) => {
        const res = await client.get<RawSaltEdgeCustomer[]>('/customers', {
          per_page: perPage,
          from_id: fromId,
        })
        const nextId = res.meta?.next_id
        return {
          items: res.data ?? [],
          next: nextId === null || nextId === undefined ? undefined : String(nextId),
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawSaltEdgeCustomer>(`/customers/${id}`)
    return transformCustomer(res.data ?? {})
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const identifier = data.name ?? (data.metadata as Record<string, string> | undefined)?.identifier
    if (!identifier) throw new Error('Salt Edge createCustomer requires a unique identifier (pass it as `name`).')
    const res = await this.client(credentials).post<RawSaltEdgeCustomer>('/customers', {
      data: { identifier },
    })
    return transformCustomer(res.data ?? {})
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete<RawSaltEdgeCustomer>(`/customers/${id}`)
  }

  // ── Charges (Salt Edge transactions) ────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const connectionId = params.connectionId
    const accountId = params.accountId
    if (!connectionId && !accountId) {
      throw new Error('Salt Edge listCharges requires a `connectionId` or `accountId` param.')
    }
    const res = await this.client(credentials).get<RawSaltEdgeTransaction[]>('/transactions', {
      connection_id: connectionId,
      account_id: accountId,
      per_page: clampPerPage(params.limit),
      from_id: params.fromId,
    })
    return (res.data ?? []).map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawSaltEdgeTransaction>(`/transactions/${id}`)
    return transformCharge(res.data ?? {})
  }
}
