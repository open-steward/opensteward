/**
 * Pleo accounting adapter.
 *
 * Supported resources (Pleo REST API v1):
 *   - Expenses      GET /expenses, GET /expenses/{id}
 *   - Accounts      GET /accounts, GET /accounts/{id}   (Chart of Accounts)
 *   - Tax Rates     GET /tax-codes, GET /tax-codes/{id}
 *   - Contacts      GET /employees, GET /employees/{id}
 *   - Organization  GET /companies/balance
 *
 * Auth:     OAuth 2.0 authorization code flow
 * Base URL: https://openapi.pleo.io/v1
 * Docs:     https://developers.pleo.io/
 * Spec:     https://api.pleo.io/rest/v3/swagger.json
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: bill         — Pleo REST API v1 has no bill endpoint; supplier invoices are modelled as expenses.
// Unavailable: creditmemo   — Pleo REST API v1 has no credit-memo endpoint; no AR credit documents in the public API.
// Unavailable: invoice      — Pleo REST API v1 has no customer-invoice endpoint; supplier invoices appear as expenses.
// Unavailable: journal      — Pleo REST API v1 has no journal endpoint; journal data is only via the Export API (external.pleo.io/v2).
// Unavailable: order        — Pleo REST API v1 has no order endpoint; the platform has no order-management concept.
// Unavailable: purchaseorder — Pleo REST API v1 has no purchase-order endpoint; concept does not exist in the public API.
// Unavailable: salesorder   — Pleo REST API v1 has no sales-order endpoint; concept does not exist in the public API.
// Unavailable: transaction  — Pleo REST API v1 has no generic transaction endpoint; card transactions are expenses; ledger data is Export API only.

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Account } from '../../schema/account'
import type { Contact } from '../../schema/contact'
import type { Expense } from '../../schema/expense'
import type { TaxRate } from '../../schema/taxrate'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { PleoClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformAccount, type PleoAccount } from './transform/account'
import { transformEmployee, type PleoEmployee } from './transform/contact'
import { transformExpense, type PleoExpense } from './transform/expense'
import { transformTaxRate, type PleoTaxCode } from './transform/taxrate'
import { transformOrganization, type PleoCompanyBalance } from './transform/organization'

interface PleoAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class PleoAdapter implements AccountingAdapter {
  readonly platform = 'pleo'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: PleoAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new PleoClient(credentials)
    const res = await client.get<PleoCompanyBalance>('companies/balance')
    return transformOrganization(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new PleoClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const pageOffset = ((params.page ?? 1) - 1) * pageSize

    const res = await client.get<{ data: PleoExpense[] }>('expenses', {
      pageSize,
      pageOffset,
    })
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new PleoClient(credentials)
    const res = await client.get<PleoExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Accounts (Chart of Accounts) ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new PleoClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const pageOffset = ((params.page ?? 1) - 1) * pageSize

    const res = await client.get<{ data: PleoAccount[] }>('accounts', {
      pageSize,
      pageOffset,
    })
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new PleoClient(credentials)
    const res = await client.get<PleoAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new PleoClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const pageOffset = ((params.page ?? 1) - 1) * pageSize

    const res = await client.get<{ data: PleoTaxCode[] }>('tax-codes', {
      pageSize,
      pageOffset,
    })
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new PleoClient(credentials)
    const res = await client.get<PleoTaxCode>(`tax-codes/${id}`)
    return transformTaxRate(res)
  }

  // --- Contacts (Employees) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new PleoClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const pageOffset = ((params.page ?? 1) - 1) * pageSize

    const res = await client.get<{ data: PleoEmployee[] }>('employees', {
      pageSize,
      pageOffset,
    })
    return (res.data ?? []).map(transformEmployee)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new PleoClient(credentials)
    const res = await client.get<PleoEmployee>(`employees/${id}`)
    return transformEmployee(res)
  }
}
