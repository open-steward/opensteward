import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Organization } from '../../schema/organization'
import type { TaxRate } from '../../schema/taxrate'
import type { Transaction } from '../../schema/transaction'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { DineroClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type DineroInvoice } from './transform/invoice'
import { transformBill, type DineroBill } from './transform/bill'
import { transformContact, type DineroContact } from './transform/contact'
import { transformAccount, type DineroAccount } from './transform/account'
import { transformJournal, type DineroJournalEntry } from './transform/journal'
import { transformOrganization, type DineroOrganization } from './transform/organization'
import { transformTaxRate, type DineroTaxRate } from './transform/taxrate'
import { transformTransaction, type DineroTransaction } from './transform/transaction'
import { transformExpense, type DineroExpense } from './transform/expense'
import { transformCreditMemo, type DineroCreditMemo } from './transform/creditmemo'

interface DineroAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

interface DineroPagination {
  Result: number
  ResultWithoutFilter: number
  Page: number
  PageSize: number
}

interface DineroListResponse<T> {
  Collection: T[]
  Pagination: DineroPagination
}

export class DineroAdapter implements AccountingAdapter {
  readonly platform = 'dinero'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: DineroAdapterConfig) {
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
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    // Dinero uses 0-based page index
    const page = params.page != null ? params.page - 1 : 0
    return { page, pageSize }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new DineroClient(credentials)
    const orgId = credentials.tenantId
    const res = await client.get<DineroOrganization>(`${orgId}`)
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new DineroClient(credentials)
    const orgId = credentials.tenantId
    const res = await client.get<DineroListResponse<DineroInvoice>>(
      `${orgId}/invoices`,
      this.paginationParams(params),
    )
    return (res.Collection ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new DineroClient(credentials)
    const orgId = credentials.tenantId
    const res = await client.get<DineroInvoice>(`${orgId}/invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new DineroClient(credentials)
    const orgId = credentials.tenantId
    const res = await client.get<DineroListResponse<DineroBill>>(
      `${orgId}/bills`,
      this.paginationParams(params),
    )
    return (res.Collection ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new DineroClient(credentials)
    const orgId = credentials.tenantId
    const res = await client.get<DineroBill>(`${orgId}/bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new DineroClient(credentials)
    const orgId = credentials.tenantId
    const res = await client.get<DineroListResponse<DineroContact>>(
      `${orgId}/contacts`,
      this.paginationParams(params),
    )
    return (res.Collection ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new DineroClient(credentials)
    const orgId = credentials.tenantId
    const res = await client.get<DineroContact>(`${orgId}/contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new DineroClient(credentials)
    const orgId = credentials.tenantId
    const res = await client.get<DineroListResponse<DineroAccount>>(
      `${orgId}/accounts`,
      this.paginationParams(params),
    )
    return (res.Collection ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new DineroClient(credentials)
    const orgId = credentials.tenantId
    const res = await client.get<DineroAccount>(`${orgId}/accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new DineroClient(credentials)
    const orgId = credentials.tenantId
    const res = await client.get<DineroListResponse<DineroJournalEntry>>(
      `${orgId}/journal-entries`,
      this.paginationParams(params),
    )
    return (res.Collection ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new DineroClient(credentials)
    const orgId = credentials.tenantId
    const res = await client.get<DineroJournalEntry>(`${orgId}/journal-entries/${id}`)
    return transformJournal(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new DineroClient(credentials)
    const orgId = credentials.tenantId
    const res = await client.get<DineroListResponse<DineroTaxRate>>(
      `${orgId}/tax-rates`,
      this.paginationParams(params),
    )
    return (res.Collection ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new DineroClient(credentials)
    const orgId = credentials.tenantId
    const res = await client.get<DineroTaxRate>(`${orgId}/tax-rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new DineroClient(credentials)
    const orgId = credentials.tenantId
    const res = await client.get<DineroListResponse<DineroTransaction>>(
      `${orgId}/transactions`,
      this.paginationParams(params),
    )
    return (res.Collection ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new DineroClient(credentials)
    const orgId = credentials.tenantId
    const res = await client.get<DineroTransaction>(`${orgId}/transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new DineroClient(credentials)
    const orgId = credentials.tenantId
    const res = await client.get<DineroListResponse<DineroExpense>>(
      `${orgId}/expenses`,
      this.paginationParams(params),
    )
    return (res.Collection ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new DineroClient(credentials)
    const orgId = credentials.tenantId
    const res = await client.get<DineroExpense>(`${orgId}/expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new DineroClient(credentials)
    const orgId = credentials.tenantId
    const res = await client.get<DineroListResponse<DineroCreditMemo>>(
      `${orgId}/credit-memos`,
      this.paginationParams(params),
    )
    return (res.Collection ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new DineroClient(credentials)
    const orgId = credentials.tenantId
    const res = await client.get<DineroCreditMemo>(`${orgId}/credit-memos/${id}`)
    return transformCreditMemo(res)
  }
}
