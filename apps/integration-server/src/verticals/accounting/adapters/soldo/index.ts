/**
 * Soldo accounting adapter.
 *
 * Soldo is a spend management platform (corporate cards + wallets).
 * Auth: OAuth 2.0 Client Credentials (client_id + client_secret, no authorization-code flow).
 * API base: https://api.soldo.com/business/v2
 *
 * Supported resources:
 *   - Organization  → GET /company
 *   - Accounts      → GET /wallets (wallets = spending accounts)
 *   - Contacts      → GET /employees (cardholders / users)
 *   - Transactions  → GET /transactions
 *   - Expenses      → GET /expense-reports
 *   - Orders        → GET /orders (card/product issuance orders)
 *   - TaxRates      → GET /entities/tax-rate (VAT rate definitions)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: bill         — Soldo has no accounts-payable bill concept; it is a spend-management platform, not a full AP/AR suite
 * Unavailable: creditmemo   — No credit memo or credit note endpoint exists in the Soldo API
 * Unavailable: invoice      — No customer invoice endpoint exists in the Soldo API
 * Unavailable: journal      — No accounting journal endpoint exists in the Soldo API
 * Unavailable: purchaseorder — No purchase order endpoint; Soldo orders are card-issuance orders, not AP purchase orders
 * Unavailable: salesorder   — No sales order endpoint exists in the Soldo API
 */

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { CredentialField } from '@opensteward/shared'
import type { Account } from '../../schema/account'
import type { Contact } from '../../schema/contact'
import type { Organization } from '../../schema/organization'
import type { Transaction } from '../../schema/transaction'
import type { Expense } from '../../schema/expense'
import type { Order } from '../../schema/order'
import type { TaxRate } from '../../schema/taxrate'

import { oauth2ClientCredentials } from '@opensteward/shared'
import { fetchClientCredentialsToken } from './auth'
import { SoldoClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, SOLDO_TOKEN_URL } from './constants'

import { transformWallet, type SoldoWallet } from './transform/account'
import { transformEmployee, type SoldoEmployee } from './transform/contact'
import { transformCompany, type SoldoCompany } from './transform/organization'
import { transformTransaction, type SoldoTransaction } from './transform/transaction'
import { transformExpenseReport, type SoldoExpenseReport } from './transform/expense'
import { transformOrder, type SoldoOrder } from './transform/order'
import { transformVatRate, type SoldoVatRate } from './transform/taxrate'

interface SoldoAdapterConfig {
  clientId: string
  clientSecret: string
}

/**
 * Connect Link form for Soldo (oauth2 client_credentials).
 * Operators enter client_id + client_secret in the hosted Connect page;
 * `exchangeCredentials` calls the token endpoint immediately and stores the
 * credentials (including clientId/clientSecret in `extra` for refresh).
 */
const SOLDO_CC_FORM = oauth2ClientCredentials({ tokenUrl: SOLDO_TOKEN_URL })

export class SoldoAdapter implements AccountingAdapter {
  readonly platform = 'soldo'
  readonly version = '0.1.0'

  /** Every list sends at most 50 per page; the router and the sync worker ask for no more. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string

  constructor(config: SoldoAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * Soldo uses client_credentials — there is no OAuth authorization-code URL.
   * Returning the developer docs URL avoids throwing when callers probe this
   * method (e.g. the Connect Link wizard).
   */
  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return 'https://developer.soldo.com/docs/standard-authentication'
  }

  /**
   * Soldo does not issue authorization codes; exchange the instance's
   * client credentials directly instead.
   */
  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return fetchClientCredentialsToken(this.clientId, this.clientSecret)
  }

  // ── Connect Link (credential-entry form for CC adapters) ──────────────────

  /**
   * Form fields rendered on the hosted Connect page so operators can enter
   * their Soldo client_id + client_secret without touching OAuth.
   */
  credentialFields(): CredentialField[] {
    return SOLDO_CC_FORM.credentialFields()
  }

  /**
   * Validate the submitted fields and exchange them for Soldo credentials.
   * On success the token (+ clientId/clientSecret in `extra`) is persisted
   * so `refreshCredentials` can re-run the grant without re-prompting.
   */
  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return SOLDO_CC_FORM.exchangeCredentials(fields)
  }

  // ── Refresh ───────────────────────────────────────────────────────────────

  /**
   * Re-authenticate using client_id + client_secret stored in credentials.extra
   * (or the instance-level config as fallback). Tokens expire after 2 h.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const extra = credentials.extra as Record<string, string> | undefined
    const clientId = extra?.['clientId'] ?? this.clientId
    const clientSecret = extra?.['clientSecret'] ?? this.clientSecret
    return fetchClientCredentialsToken(clientId, clientSecret)
  }

  // Convenience: obtain fresh credentials when only config is available
  async authenticate(): Promise<Credentials> {
    return fetchClientCredentialsToken(this.clientId, this.clientSecret)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new SoldoClient(credentials)
    const res = await client.get<SoldoCompany>('company')
    return transformCompany(res)
  }

  // --- Accounts (Wallets) ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new SoldoClient(credentials)
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = Math.max((params.page ?? 1) - 1, 0) // Soldo pages are 0-indexed
    const res = await client.getPaged<SoldoWallet>('wallets', page, size)
    return (res.results ?? []).map(transformWallet)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new SoldoClient(credentials)
    const res = await client.get<SoldoWallet>(`wallets/${id}`)
    return transformWallet(res)
  }

  // --- Contacts (Employees) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new SoldoClient(credentials)
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = Math.max((params.page ?? 1) - 1, 0)
    const res = await client.getPaged<SoldoEmployee>('employees', page, size)
    return (res.results ?? []).map(transformEmployee)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new SoldoClient(credentials)
    const res = await client.get<SoldoEmployee>(`employees/${id}`)
    return transformEmployee(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new SoldoClient(credentials)
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = Math.max((params.page ?? 1) - 1, 0)

    const extra: Record<string, unknown> = {}
    if (params.updatedAfter) {
      extra['fromDate'] = params.updatedAfter.toISOString().split('T')[0]
      extra['dateType'] = 'UPDATE'
    }

    const res = await client.getPaged<SoldoTransaction>('transactions', page, size, extra)
    return (res.results ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new SoldoClient(credentials)
    const res = await client.get<SoldoTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Expenses (Expense Reports) ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new SoldoClient(credentials)
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = Math.max((params.page ?? 1) - 1, 0)
    const res = await client.getPaged<SoldoExpenseReport>('expense-reports', page, size)
    return (res.results ?? []).map(transformExpenseReport)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new SoldoClient(credentials)
    const res = await client.get<SoldoExpenseReport>(`expense-reports/${id}`)
    return transformExpenseReport(res)
  }

  // --- Orders (Card/Product Issuance Orders) ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new SoldoClient(credentials)
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = Math.max((params.page ?? 1) - 1, 0)
    const res = await client.getPaged<SoldoOrder>('orders', page, size)
    return (res.results ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new SoldoClient(credentials)
    const res = await client.get<SoldoOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  // --- Tax Rates (VAT Rates) ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new SoldoClient(credentials)
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = Math.max((params.page ?? 1) - 1, 0)
    const res = await client.getPaged<SoldoVatRate>('entities/tax-rate', page, size)
    return (res.results ?? []).map(transformVatRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new SoldoClient(credentials)
    const res = await client.get<SoldoVatRate>(`entities/tax-rate/${id}`)
    return transformVatRate(res)
  }
}
