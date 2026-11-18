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
import { ProcountorClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type ProcountorInvoice } from './transform/invoice'
import { transformBill, type ProcountorBill } from './transform/bill'
import { transformContact, type ProcountorContact } from './transform/contact'
import { transformAccount, type ProcountorAccount } from './transform/account'
import { transformJournal, type ProcountorJournalEntry } from './transform/journal'
import { transformOrganization, type ProcountorOrganization } from './transform/organization'
import { transformTaxRate, type ProcountorTaxRate } from './transform/taxrate'
import { transformTransaction, type ProcountorTransaction } from './transform/transaction'
import { transformExpense, type ProcountorExpense } from './transform/expense'
import { transformCreditMemo, type ProcountorCreditMemo } from './transform/creditmemo'

interface ProcountorAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

interface ProcountorListResponse<T> {
  results: T[]
  meta: {
    resultCount: number
    pageNumber: number
    pageSize: number
  }
}

export class ProcountorAdapter implements AccountingAdapter {
  readonly platform = 'procountor'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ProcountorAdapterConfig) {
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
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    // Procountor uses 0-based pages; QueryParams.page is 1-based
    const page = params.page ? params.page - 1 : 0
    return { size, page }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new ProcountorClient(credentials)
    const res = await client.get<ProcountorOrganization>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new ProcountorClient(credentials)
    const res = await client.get<ProcountorListResponse<ProcountorInvoice>>('invoices', {
      ...this.paginationParams(params),
      types: 'SALES_INVOICE',
    })
    return (res.results ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new ProcountorClient(credentials)
    const res = await client.get<ProcountorInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new ProcountorClient(credentials)
    const res = await client.get<ProcountorListResponse<ProcountorBill>>('invoices', {
      ...this.paginationParams(params),
      types: 'PURCHASE_INVOICE',
    })
    return (res.results ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new ProcountorClient(credentials)
    const res = await client.get<ProcountorBill>(`invoices/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new ProcountorClient(credentials)
    const res = await client.get<ProcountorListResponse<ProcountorContact>>('businesspartners', {
      ...this.paginationParams(params),
    })
    return (res.results ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new ProcountorClient(credentials)
    const res = await client.get<ProcountorContact>(`businesspartners/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new ProcountorClient(credentials)
    const res = await client.get<ProcountorListResponse<ProcountorAccount>>('coa', {
      ...this.paginationParams(params),
    })
    return (res.results ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new ProcountorClient(credentials)
    const res = await client.get<ProcountorAccount>(`coa/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new ProcountorClient(credentials)
    const res = await client.get<ProcountorListResponse<ProcountorJournalEntry>>('journalentries', {
      ...this.paginationParams(params),
    })
    return (res.results ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new ProcountorClient(credentials)
    const res = await client.get<ProcountorJournalEntry>(`journalentries/${id}`)
    return transformJournal(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new ProcountorClient(credentials)
    const res = await client.get<ProcountorListResponse<ProcountorTaxRate>>('taxrates', {
      ...this.paginationParams(params),
    })
    return (res.results ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new ProcountorClient(credentials)
    const res = await client.get<ProcountorTaxRate>(`taxrates/${id}`)
    return transformTaxRate(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new ProcountorClient(credentials)
    const res = await client.get<ProcountorListResponse<ProcountorTransaction>>('banktransactions', {
      ...this.paginationParams(params),
    })
    return (res.results ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new ProcountorClient(credentials)
    const res = await client.get<ProcountorTransaction>(`banktransactions/${id}`)
    return transformTransaction(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new ProcountorClient(credentials)
    const res = await client.get<ProcountorListResponse<ProcountorExpense>>('invoices', {
      ...this.paginationParams(params),
      types: 'PURCHASE_INVOICE',
      status: 'APPROVED',
    })
    return (res.results ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new ProcountorClient(credentials)
    const res = await client.get<ProcountorExpense>(`invoices/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new ProcountorClient(credentials)
    const res = await client.get<ProcountorListResponse<ProcountorCreditMemo>>('invoices', {
      ...this.paginationParams(params),
      types: 'SALES_CREDIT_NOTE',
    })
    return (res.results ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new ProcountorClient(credentials)
    const res = await client.get<ProcountorCreditMemo>(`invoices/${id}`)
    return transformCreditMemo(res)
  }
}
