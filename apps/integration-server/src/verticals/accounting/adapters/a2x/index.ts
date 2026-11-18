/**
 * A2X Accounting adapter.
 *
 * A2X is an ecommerce-to-accounting automation platform that reconciles
 * marketplace settlements (Amazon, Shopify, eBay, Etsy, Walmart, PayPal)
 * and posts summarised journals to Xero / QuickBooks / NetSuite / Sage.
 *
 * Supported resources
 * ───────────────────
 * • Settlements  → listInvoices / getInvoice
 * • Accounts     → listAccounts / getAccount
 * • Organisation → getOrganization
 *
 * Auth: OAuth 2.0 Authorization Code (standard PKCE flow)
 * Docs: https://www.a2xaccounting.com/become-an-integrator
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unverified: bill         — A2X partner API docs are behind a login wall; no /bills
 *                            endpoint confirmed. A2X does not manage supplier bills.
 * Unverified: contact      — No /contacts endpoint confirmed. Contacts are managed by
 *                            the downstream accounting system (Xero/QBO), not A2X.
 * Unverified: creditmemo   — No /credit-memos endpoint confirmed. A2X does not issue
 *                            credit memos as first-class resources.
 * Unverified: expense      — No /expenses endpoint confirmed. Expense management is
 *                            out of scope for A2X's settlement-reconciliation product.
 * Unverified: journal      — No /journals endpoint confirmed. A2X posts journals to
 *                            connected platforms but does not expose them via its own API.
 * Unverified: order        — No /orders endpoint confirmed. Orders are sourced from
 *                            marketplace platforms, not stored as A2X API resources.
 * Unverified: purchaseorder— No /purchase-orders endpoint confirmed. Purchase-order
 *                            management is not part of A2X's scope.
 * Unverified: salesorder   — No /sales-orders endpoint confirmed. Sales orders are
 *                            marketplace-side data, not A2X API resources.
 * Unverified: taxrate      — No /tax-rates endpoint confirmed. Tax-rate mappings are
 *                            configured inside A2X but no public API resource confirmed.
 * Unverified: transaction  — No /transactions endpoint confirmed. Individual transactions
 *                            are aggregated into settlements; raw transactions not exposed.
 */

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { A2xClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, A2X_DEFAULT_SCOPES } from './constants'

import {
  transformSettlementToInvoice,
  type A2xSettlement,
} from './transform/invoice'
import { transformAccount, type A2xAccount } from './transform/account'
import { transformOrganization, type A2xOrganisation } from './transform/organization'

interface A2xAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class A2xAdapter implements AccountingAdapter {
  readonly platform = 'a2x'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: A2xAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? A2X_DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    const creds = await refreshAccessToken(
      credentials.refreshToken,
      this.clientId,
      this.clientSecret,
    )
    // Preserve any tenant context stored during initial auth
    if (!creds.tenantId) creds.tenantId = credentials.tenantId
    return creds
  }

  // ── Organisation ──────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new A2xClient(credentials)
    const res = await client.get<{ organisation: A2xOrganisation }>('/organisation')
    return transformOrganization(res.organisation)
  }

  // ── Settlements (Invoices) ────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new A2xClient(credentials)
    const perPage = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1

    const extra: Record<string, unknown> = {}
    if (params.updatedAfter) {
      extra['updated_after'] = params.updatedAfter.toISOString()
    }

    const res = await client.list<A2xSettlement>('/settlements', page, perPage, extra)
    return (res.data ?? []).map(transformSettlementToInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new A2xClient(credentials)
    const res = await client.get<{ settlement: A2xSettlement }>(`/settlements/${id}`)
    return transformSettlementToInvoice(res.settlement)
  }

  // ── Accounts ──────────────────────────────────────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new A2xClient(credentials)
    const perPage = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1

    const res = await client.list<A2xAccount>('/accounts', page, perPage)
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new A2xClient(credentials)
    const res = await client.get<{ account: A2xAccount }>(`/accounts/${id}`)
    return transformAccount(res.account)
  }
}
