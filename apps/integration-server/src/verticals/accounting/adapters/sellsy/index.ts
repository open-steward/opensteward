import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { SellsyClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type SellsyInvoice } from './transform/invoice'
import { transformBill, type SellsyBill } from './transform/bill'
import { transformContact, type SellsyContact } from './transform/contact'
import { transformAccount, type SellsyAccount } from './transform/account'
import { transformJournal, type SellsyJournal } from './transform/journal'
import { transformOrganization, type SellsyOrganization } from './transform/organization'
import { transformTaxRate, type SellsyTaxRate } from './transform/taxrate'
import { transformTransaction, type SellsyTransaction } from './transform/transaction'
import { transformExpense, type SellsyExpense } from './transform/expense'
import { transformCreditMemo, type SellsyCreditMemo } from './transform/creditmemo'

interface SellsyAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

interface SellsyListResponse<T> {
  data: T[]
  pagination: {
    total: number
    limit: number
    offset: number
  }
}

export class SellsyAdapter implements AccountingAdapter {
  readonly platform = 'sellsy'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: SellsyAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, (overrideScopes ?? this.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const offset = (page - 1) * limit
    return { limit, offset }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new SellsyClient(credentials)
    const res = await client.get<SellsyOrganization>('companies/me')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new SellsyClient(credentials)
    const res = await client.get<SellsyListResponse<SellsyInvoice>>(
      'invoices',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new SellsyClient(credentials)
    const res = await client.get<SellsyInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new SellsyClient(credentials)
    const res = await client.get<SellsyListResponse<SellsyBill>>(
      'purchases',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new SellsyClient(credentials)
    const res = await client.get<SellsyBill>(`purchases/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new SellsyClient(credentials)
    const res = await client.get<SellsyListResponse<SellsyContact>>(
      'contacts',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new SellsyClient(credentials)
    const res = await client.get<SellsyContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new SellsyClient(credentials)
    const res = await client.get<SellsyListResponse<SellsyAccount>>(
      'accounting/accounts',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new SellsyClient(credentials)
    const res = await client.get<SellsyAccount>(`accounting/accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new SellsyClient(credentials)
    const res = await client.get<SellsyListResponse<SellsyJournal>>(
      'accounting/entries',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new SellsyClient(credentials)
    const res = await client.get<SellsyJournal>(`accounting/entries/${id}`)
    return transformJournal(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new SellsyClient(credentials)
    const res = await client.get<SellsyListResponse<SellsyTaxRate>>(
      'taxes',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new SellsyClient(credentials)
    const res = await client.get<SellsyTaxRate>(`taxes/${id}`)
    return transformTaxRate(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new SellsyClient(credentials)
    const res = await client.get<SellsyListResponse<SellsyTransaction>>(
      'payments',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new SellsyClient(credentials)
    const res = await client.get<SellsyTransaction>(`payments/${id}`)
    return transformTransaction(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new SellsyClient(credentials)
    const res = await client.get<SellsyListResponse<SellsyExpense>>(
      'expenses',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new SellsyClient(credentials)
    const res = await client.get<SellsyExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new SellsyClient(credentials)
    const res = await client.get<SellsyListResponse<SellsyCreditMemo>>(
      'credit-notes',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new SellsyClient(credentials)
    const res = await client.get<SellsyCreditMemo>(`credit-notes/${id}`)
    return transformCreditMemo(res)
  }
}
