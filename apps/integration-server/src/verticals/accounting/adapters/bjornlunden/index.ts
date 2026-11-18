import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { TaxRate } from '../../schema/taxrate'
import type { Organization } from '../../schema/organization'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Expense } from '../../schema/expense'
import type { Transaction } from '../../schema/transaction'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { BlClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type BlInvoice } from './transform/invoice'
import { transformBill, type BlBill } from './transform/bill'
import { transformContact, type BlContact } from './transform/contact'
import { transformAccount, type BlAccount } from './transform/account'
import { transformJournal, type BlJournalEntry } from './transform/journal'
import { transformOrganization, type BlOrganization } from './transform/organization'
import { transformTaxRate, type BlTaxRate } from './transform/taxrate'
import { transformTransaction, type BlTransaction } from './transform/transaction'
import { transformExpense, type BlExpense } from './transform/expense'
import { transformCreditMemo, type BlCreditMemo } from './transform/creditmemo'

export interface BjornLundenAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

interface BlPaginatedResponse<T> {
  Data: T[]
  TotalCount: number
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class BjornLundenAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform: string = 'bjornlunden'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: BjornLundenAdapterConfig) {
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
    return {
      page: params.page ?? 1,
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new BlClient(credentials)
    const res = await client.get<BlOrganization>('organization')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new BlClient(credentials)
    const res = await client.get<BlPaginatedResponse<BlInvoice>>(
      'invoices',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new BlClient(credentials)
    const res = await client.get<BlInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new BlClient(credentials)
    const res = await client.get<BlPaginatedResponse<BlBill>>(
      'bills',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new BlClient(credentials)
    const res = await client.get<BlBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new BlClient(credentials)
    const res = await client.get<BlPaginatedResponse<BlContact>>(
      'contacts',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new BlClient(credentials)
    const res = await client.get<BlContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new BlClient(credentials)
    const res = await client.get<BlPaginatedResponse<BlAccount>>(
      'accounts',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new BlClient(credentials)
    const res = await client.get<BlAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new BlClient(credentials)
    const res = await client.get<BlPaginatedResponse<BlJournalEntry>>(
      'journalentries',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new BlClient(credentials)
    const res = await client.get<BlJournalEntry>(`journalentries/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new BlClient(credentials)
    const res = await client.get<BlPaginatedResponse<BlTransaction>>(
      'transactions',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new BlClient(credentials)
    const res = await client.get<BlTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new BlClient(credentials)
    const res = await client.get<BlPaginatedResponse<BlTaxRate>>(
      'taxrates',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new BlClient(credentials)
    const res = await client.get<BlTaxRate>(`taxrates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new BlClient(credentials)
    const res = await client.get<BlPaginatedResponse<BlExpense>>(
      'expenses',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new BlClient(credentials)
    const res = await client.get<BlExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new BlClient(credentials)
    const res = await client.get<BlPaginatedResponse<BlCreditMemo>>(
      'creditmemos',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new BlClient(credentials)
    const res = await client.get<BlCreditMemo>(`creditmemos/${id}`)
    return transformCreditMemo(res)
  }
}
