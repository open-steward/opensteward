/**
 * Moss accounting adapter.
 *
 * Moss is a spend-management platform. Its Public API (v1) exposes:
 *   - Expenses (card transactions, invoices, reimbursements)
 *   - Expense accounts (chart of accounts)
 *   - Suppliers (contacts)
 *   - Tax rates
 *   - Bank accounts
 *   - Bank transactions
 *
 * Auth: OAuth 2.0 client credentials — clients exchange a (client_id / kid_*,
 * client_secret / sk_*) key pair for a short-lived Bearer JWT (1 h).
 *
 * Docs: https://developers.getmoss.com/
 */

import { oauth2ClientCredentials } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { TaxRate } from '../../schema/taxrate'
import type { Expense } from '../../schema/expense'
import type { Transaction } from '../../schema/transaction'

import { fetchToken, refreshCredentials as doRefreshCredentials } from './auth'
import { MossClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MOSS_TOKEN_URL } from './constants'

import { transformSupplier, type MossSupplier } from './transform/contact'
import { transformExpenseAccount, type MossExpenseAccount } from './transform/account'
import { transformTaxRate, type MossTaxRate } from './transform/taxrate'
import { transformExpense, type MossExpense } from './transform/expense'
import { transformBankTransaction, type MossBankTransaction } from './transform/transaction'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   account, contact, expense, organization, taxrate, transaction
// Unavailable: bill         — no bill/AP endpoint; spend flows through /v1/expenses
// Unavailable: creditmemo   — no credit-memo endpoint in Moss Public API v1
// Unavailable: invoice      — no standalone invoice endpoint; supplier invoices come via /v1/expenses
// Unavailable: journal      — no journal endpoint in Moss Public API v1
// Unavailable: order        — platform does not support order management
// Unavailable: purchaseorder — platform does not support purchase orders
// Unavailable: salesorder   — platform does not support sales orders

// ── Connect Link form (client_id + client_secret) ─────────────────────────────

const CREDENTIAL_FORM = oauth2ClientCredentials({ tokenUrl: MOSS_TOKEN_URL })

// ── Moss-specific pagination response envelope ────────────────────────────────

interface MossPagination {
  type: string
  page: number
  pageSize: number
  hasMore: boolean
  totalPages: number
  totalItems: number
}

interface MossListResponse<T> {
  data: T[]
  meta: {
    apiVersion?: string
    pagination: MossPagination
  }
}

// ── Adapter ───────────────────────────────────────────────────────────────────

interface MossAdapterConfig {
  clientId: string
  clientSecret: string
}

export class MossAdapter implements AccountingAdapter {
  readonly platform = 'moss'
  readonly version = '0.1.0'

  // Connect Link support — client_id + client_secret form
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private clientId: string
  private clientSecret: string

  constructor(config: MossAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
  }

  // Auth — no browser OAuth redirect for client credentials
  getAuthUrl(_state: string): string {
    return '#'
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // code is expected to be "clientId:clientSecret" (colon-separated)
    const colonIdx = code.indexOf(':')
    if (colonIdx === -1) return fetchToken(code, '')
    const clientId = code.slice(0, colonIdx)
    const clientSecret = code.slice(colonIdx + 1)
    return fetchToken(clientId, clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      page_size: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
      ...(params.updatedAfter && {
        update_time__gte: params.updatedAfter.toISOString(),
      }),
    }
  }

  // ── Expenses ──────────────────────────────────────────────────────────────

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new MossClient(credentials)
    const res = await client.get<MossListResponse<MossExpense>>(
      'expenses',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new MossClient(credentials)
    const res = await client.get<{ data: MossExpense }>(`expenses/${id}`)
    return transformExpense(res.data)
  }

  // ── Contacts (Suppliers) ──────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new MossClient(credentials)
    const res = await client.get<MossListResponse<MossSupplier>>(
      'suppliers',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformSupplier)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new MossClient(credentials)
    const res = await client.get<{ data: MossSupplier }>(`suppliers/${id}`)
    return transformSupplier(res.data)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new MossClient(credentials)
    const body = {
      name: data.name,
      currency: data.currency,
      vatIdNo: data.taxNumber,
      address: data.billingAddress
        ? {
            street: data.billingAddress.address1,
            city: data.billingAddress.city,
            postalCode: data.billingAddress.postalCode,
            country: data.billingAddress.country,
          }
        : undefined,
    }
    const res = await client.post<{ data: MossSupplier }>('suppliers', body)
    return transformSupplier(res.data)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new MossClient(credentials)
    const body = {
      name: data.name,
      currency: data.currency,
      vatIdNo: data.taxNumber,
      address: data.billingAddress
        ? {
            street: data.billingAddress.address1,
            city: data.billingAddress.city,
            postalCode: data.billingAddress.postalCode,
            country: data.billingAddress.country,
          }
        : undefined,
    }
    const res = await client.patch<{ data: MossSupplier }>(`suppliers/${id}`, body)
    return transformSupplier(res.data)
  }

  // ── Accounts (Expense Accounts) ───────────────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new MossClient(credentials)
    const res = await client.get<MossListResponse<MossExpenseAccount>>(
      'expense-accounts',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformExpenseAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new MossClient(credentials)
    const res = await client.get<{ data: MossExpenseAccount }>(`expense-accounts/${id}`)
    return transformExpenseAccount(res.data)
  }

  // ── Tax Rates ─────────────────────────────────────────────────────────────

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new MossClient(credentials)
    const res = await client.get<MossListResponse<MossTaxRate>>(
      'tax-rates',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new MossClient(credentials)
    const res = await client.get<{ data: MossTaxRate }>(`tax-rates/${id}`)
    return transformTaxRate(res.data)
  }

  // ── Transactions (Bank Transactions) ──────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new MossClient(credentials)
    // Moss uses a POST search endpoint for bank transactions
    const body = {
      page: params.page ?? 1,
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      ...(params.updatedAfter && {
        bookingDateFrom: params.updatedAfter.toISOString().split('T')[0],
      }),
    }
    const res = await client.post<MossListResponse<MossBankTransaction>>(
      'bank-transactions/search',
      body,
    )
    return (res.data ?? []).map(transformBankTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // Moss has no single-transaction GET; fall back to a filtered search
    const client = new MossClient(credentials)
    const res = await client.post<MossListResponse<MossBankTransaction>>(
      'bank-transactions/search',
      { id: [id], pageSize: 1 },
    )
    const tx = res.data?.[0]
    if (!tx) throw new Error(`Moss: bank transaction ${id} not found`)
    return transformBankTransaction(tx)
  }
}
