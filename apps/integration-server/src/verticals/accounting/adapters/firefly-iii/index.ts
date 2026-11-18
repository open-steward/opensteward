/**
 * Firefly III accounting adapter.
 *
 * Firefly III is a self-hosted personal finance manager with a full REST API
 * (v1).  It supports OAuth2 (authorization_code) with Bearer token auth.
 *
 * Supported resources (auto-501 for anything not listed):
 *   - Organization   → /v1/user-groups (financial administration)
 *   - Accounts       → /v1/accounts
 *   - Transactions   → /v1/transactions   (also exposed as Journals)
 *   - Journals       → /v1/transactions   (double-entry view of same data)
 *   - Bills          → /v1/bills          (recurring subscriptions)
 *
 * Auth: customers connect with their server URL and a Personal Access Token
 *   (`credentialFields` / `exchangeCredentials`); Firefly III OAuth clients are
 *   per-installation, so a deployment-wide OAuth client only suits a
 *   deployment that configures its own single server (`instanceHost`).
 *   The normalised server URL is stored in credentials.extra.instanceUrl
 *   (and tenantId) so the client can build absolute URLs.
 */

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: contact      — Firefly III is a personal finance manager; no contact/customer endpoints exist in the /v1 API.
// Unavailable: creditmemo   — No invoicing or credit note concepts; no credit memo endpoints in /v1 API.
// Unavailable: expense      — /v1/insight/expense/* are read-only analytics aggregates, not CRUD expense records.
// Unavailable: invoice      — No invoicing capability; no invoice endpoints in /v1 API.
// Unavailable: order        — No order management; no order endpoints in /v1 API.
// Unavailable: purchaseorder — No purchase order management; no purchase order endpoints in /v1 API.
// Unavailable: salesorder   — No sales order management; no sales order endpoints in /v1 API.
// Unavailable: taxrate      — Firefly III does not model tax rates; no tax rate endpoints in /v1 API.

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Account } from '../../schema/account'
import type { Bill } from '../../schema/bill'
import type { Journal } from '../../schema/journal'
import type { Transaction } from '../../schema/transaction'
import type { Organization } from '../../schema/organization'

import type { CredentialField } from '@opensteward/shared'
import { buildAuthUrl, exchangeCode, exchangePersonalAccessToken, refreshAccessToken } from './auth'
import { FireflyClient } from './client'
import type {
  FireflyListEnvelope,
  FireflySingleEnvelope,
  FireflyResource,
} from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformAccount, type FireflyAccountAttributes } from './transform/account'
import { transformTransaction, type FireflyTransactionAttributes } from './transform/transaction'
import { transformJournal } from './transform/journal'
import { transformBill, type FireflyBillAttributes } from './transform/bill'
import { transformOrganization, type FireflyUserGroupAttributes } from './transform/organization'

// ── Adapter config ─────────────────────────────────────────────────────────────

interface FireflyIiiAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /**
   * Single server for the OAuth flow (e.g. https://my.firefly-iii.example.com).
   * Only meaningful together with a client id created on that same server;
   * Connect Link customers supply their own server via `credentialFields`.
   */
  instanceHost?: string
  scopes?: string[]
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class FireflyIiiAdapter implements AccountingAdapter {
  readonly platform = 'firefly-iii'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private instanceHost: string | undefined
  private scopes: string[]

  constructor(config: FireflyIiiAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.instanceHost = config.instanceHost
    this.scopes = config.scopes ?? []
  }

  /** Connect Link form: the customer's own server and a Personal Access Token from it. */
  credentialFields(): CredentialField[] {
    return [
      {
        name: 'instanceUrl',
        label: 'Firefly III URL',
        type: 'url',
        required: true,
        placeholder: 'https://firefly.example.com',
        helpText: 'The address of your Firefly III installation.',
      },
      {
        name: 'personalAccessToken',
        label: 'Personal access token',
        type: 'password',
        required: true,
        helpText: 'Create one in Firefly III under Options → Profile → OAuth → Personal Access Tokens.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangePersonalAccessToken(fields)
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(
      this.clientId,
      this.redirectUri,
      this.instanceHost,
      overrideScopes ?? this.scopes,
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri, this.instanceHost)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(
      credentials.refreshToken,
      this.clientId,
      this.clientSecret,
      credentials,
    )
  }

  // ── Organization ─────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new FireflyClient(credentials)
    // /v1/user-groups returns the list of financial administrations; use the first.
    const res = await client.list<FireflyUserGroupAttributes>('user-groups', 1, 1)
    const first = (res as FireflyListEnvelope<FireflyResource<FireflyUserGroupAttributes>>).data[0]
    // A freshly provisioned personal instance may have no user-groups; return a
    // minimal stub using the stored credential identifier rather than throwing.
    if (!first) {
      return {
        id: credentials.tenantId ?? 'firefly-iii',
        metadata: { platform: 'firefly-iii', userGroupsEmpty: true },
      }
    }
    return transformOrganization(first)
  }

  // ── Accounts ──────────────────────────────────────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new FireflyClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100)
    const res = await client.list<FireflyAccountAttributes>('accounts', page, limit)
    return (res as FireflyListEnvelope<FireflyResource<FireflyAccountAttributes>>).data.map(
      transformAccount,
    )
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new FireflyClient(credentials)
    const res = await client.get<FireflyAccountAttributes>(`accounts/${id}`)
    return transformAccount(
      (res as FireflySingleEnvelope<FireflyResource<FireflyAccountAttributes>>).data,
    )
  }

  // ── Transactions ──────────────────────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new FireflyClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100)
    const extra: Record<string, unknown> = {}
    if (params.updatedAfter) {
      extra['start'] = params.updatedAfter.toISOString().split('T')[0]
    }
    const res = await client.list<FireflyTransactionAttributes>('transactions', page, limit, extra)
    return (res as FireflyListEnvelope<FireflyResource<FireflyTransactionAttributes>>).data.map(
      transformTransaction,
    )
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new FireflyClient(credentials)
    const res = await client.get<FireflyTransactionAttributes>(`transactions/${id}`)
    return transformTransaction(
      (res as FireflySingleEnvelope<FireflyResource<FireflyTransactionAttributes>>).data,
    )
  }

  // ── Journals (same underlying data as Transactions, double-entry view) ────────

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new FireflyClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100)
    const extra: Record<string, unknown> = {}
    if (params.updatedAfter) {
      extra['start'] = params.updatedAfter.toISOString().split('T')[0]
    }
    const res = await client.list<FireflyTransactionAttributes>('transactions', page, limit, extra)
    return (res as FireflyListEnvelope<FireflyResource<FireflyTransactionAttributes>>).data.map(
      transformJournal,
    )
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new FireflyClient(credentials)
    const res = await client.get<FireflyTransactionAttributes>(`transactions/${id}`)
    return transformJournal(
      (res as FireflySingleEnvelope<FireflyResource<FireflyTransactionAttributes>>).data,
    )
  }

  // ── Bills (subscriptions) ─────────────────────────────────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new FireflyClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100)
    const res = await client.list<FireflyBillAttributes>('bills', page, limit)
    return (res as FireflyListEnvelope<FireflyResource<FireflyBillAttributes>>).data.map(
      transformBill,
    )
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new FireflyClient(credentials)
    const res = await client.get<FireflyBillAttributes>(`bills/${id}`)
    return transformBill(
      (res as FireflySingleEnvelope<FireflyResource<FireflyBillAttributes>>).data,
    )
  }
}
