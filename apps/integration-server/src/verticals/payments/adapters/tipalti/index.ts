/**
 * Tipalti adapter — payments vertical (global mass-payouts / AP automation).
 *
 * Tipalti is accounts-payable-centric: a **payee** is the counterparty (maps
 * to canonical **Customer**), a **payment** is an outbound disbursement to a
 * payee (maps to canonical **Charge** — the money-movement object), and an
 * invoice/bill owed to a payee maps to the canonical **Invoice**. Collections
 * are cursor-paginated; reads only — the adapter does not implement the
 * write surface (create payee, payment batches).
 *
 * Auth: OAuth2 client-credentials (OpenID Connect). A `clientId` +
 * `clientSecret` + environment are exchanged at the hosted IdP token endpoint
 * for a short-lived Bearer token (see auth.ts).
 *
 * Webhooks: HMAC-SHA256 over `${timestamp}.${rawBody}`, `Tipalti-Signature`
 * header (see webhook.ts).
 *
 * Deliberately left off (auto-501): refunds, payment methods, subscriptions,
 * payouts, disputes, plans/prices/products, balance transactions — Tipalti's
 * modern REST API does not model these as standalone canonical resources.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: balance-transaction — REST API v1 exposes no ledger/balance-transaction resource.
 * Unavailable: dispute            — AP-automation platform; chargeback disputes not modelled.
 * Unavailable: payment-method     — embedded on payee + hosted iFrame; no standalone endpoint.
 * Unavailable: payout             — disbursements map to Charge; no separate payout resource.
 * Unavailable: plan               — no subscription billing; plan/price/product absent from API.
 * Unavailable: refund             — no refund endpoint; payment reversals not exposed via REST.
 * Unavailable: subscription       — no subscription billing model in the Tipalti REST API.
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
import type { Customer } from '../../schema/customer'
import type { Invoice } from '../../schema/invoice'
import type { WebhookEvent } from '../../schema/webhook'

import {
  payeePath,
  paymentPath,
  invoicePath,
  PAYEES_PATH,
  PAYMENTS_PATH,
  INVOICES_PATH,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './constants'
import {
  TIPALTI_CREDENTIAL_FIELDS,
  environmentOf,
  exchangeTipaltiCredentials,
  refreshTipaltiCredentials,
} from './auth'
import { TipaltiClient, type TipaltiPage } from './client'
import { parseTipaltiWebhookEvents, verifyTipaltiWebhook } from './webhook'

import { transformCustomer, type RawTipaltiPayee } from './transform/customer'
import { transformCharge, type RawTipaltiPayment } from './transform/charge'
import { transformInvoice, type RawTipaltiInvoice } from './transform/invoice'

/**
 * The pager scope for one connection: environment and OAuth client id, plus a
 * fingerprint of the connection's token (see `connectionScope`).
 */
function tipaltiScope(credentials: Credentials): string {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = typeof extra.clientId === 'string' ? extra.clientId : ''
  return connectionScope(`tipalti:${environmentOf(credentials)}:${clientId}`, credentials)
}

export class TipaltiAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'tipalti'
  readonly version = '0.1.0'
  /** "Maximum value: 200" — https://documentation.tipalti.com/reference/pagination-1 */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('Tipalti uses OAuth2 client credentials; submit them via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Tipalti uses OAuth2 client credentials; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return TIPALTI_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeTipaltiCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshTipaltiCredentials(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyTipaltiWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseTipaltiWebhookEvents(payload)
  }

  private client(credentials: Credentials): TipaltiClient {
    return new TipaltiClient(credentials)
  }

  /**
   * One caller page of a cursor-paginated collection. Tipalti lists take
   * `page-size` and `page-cursor` and answer with
   * `pageInfo: { hasNextPage, nextPageCursor }`
   * (https://documentation.tipalti.com/reference/get_api-v1-payees). The
   * 1-based `page` is mapped onto that chain by {@link pageByCursor}, keyed
   * per connection, collection and size. A caller that passes a raw `cursor`
   * gets that one upstream page as-is, outside the pager.
   */
  private async pageList<T>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
  ): Promise<T[]> {
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    const size = Math.min(asked, MAX_PAGE_SIZE)
    const client = this.client(credentials)
    const fetchPage = async (cursor: string | undefined) => {
      const res: TipaltiPage<T> = await client.list<T>(path, { pageSize: size, pageCursor: cursor })
      const next = res.pageInfo?.hasNextPage ? res.pageInfo.nextPageCursor : undefined
      return { items: res.items ?? [], next: next || undefined }
    }
    let items: T[]
    let hasMore: boolean
    if (typeof params.cursor === 'string' && params.cursor) {
      const res = await fetchPage(params.cursor)
      items = res.items
      hasMore = res.next !== undefined
    } else {
      const key = cursorPagerKey(tipaltiScope(credentials), path, { limit: size })
      ;({ items, hasMore } = await pageByCursor<T>(key, params.page, fetchPage))
    }
    reportUpstreamPage(params, size < asked ? { hasMore, pageSize: size } : { hasMore })
    return items
  }

  // ── Customers (Tipalti payees) ──────────────────────────────────────────────
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await this.pageList<RawTipaltiPayee>(credentials, params, PAYEES_PATH)
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawTipaltiPayee>(payeePath(id))
    return transformCustomer(res ?? {})
  }

  // ── Charges (Tipalti payments) ──────────────────────────────────────────────
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.pageList<RawTipaltiPayment>(credentials, params, PAYMENTS_PATH)
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawTipaltiPayment>(paymentPath(id))
    return transformCharge(res ?? {})
  }

  // ── Invoices (Tipalti bills) ────────────────────────────────────────────────
  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const rows = await this.pageList<RawTipaltiInvoice>(credentials, params, INVOICES_PATH)
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).get<RawTipaltiInvoice>(invoicePath(id))
    return transformInvoice(res ?? {})
  }
}
