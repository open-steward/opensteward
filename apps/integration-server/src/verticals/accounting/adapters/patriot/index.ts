import { simpleApiKey } from '@opensteward/shared'
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
import { PatriotClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type PatriotInvoice } from './transform/invoice'
import { transformBill, type PatriotBill } from './transform/bill'
import { transformContact, type PatriotContact } from './transform/contact'
import { transformAccount, type PatriotAccount } from './transform/account'
import { transformJournal, type PatriotJournal } from './transform/journal'
import { transformOrganization, type PatriotOrganization } from './transform/organization'
import { transformTaxRate, type PatriotTaxRate } from './transform/taxrate'
import { transformTransaction, type PatriotTransaction } from './transform/transaction'
import { transformExpense, type PatriotExpense } from './transform/expense'
import { transformCreditMemo, type PatriotCreditMemo } from './transform/creditmemo'

interface PatriotAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class PatriotAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'patriot'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: PatriotAdapterConfig) {
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
    const client = new PatriotClient(credentials)
    const res = await client.get<PatriotOrganization>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new PatriotClient(credentials)
    const res = await client.get<PatriotInvoice[]>(
      'invoices',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new PatriotClient(credentials)
    const res = await client.get<PatriotInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new PatriotClient(credentials)
    const res = await client.get<PatriotBill[]>(
      'bills',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new PatriotClient(credentials)
    const res = await client.get<PatriotBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new PatriotClient(credentials)
    const res = await client.get<PatriotContact[]>(
      'contacts',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new PatriotClient(credentials)
    const res = await client.get<PatriotContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new PatriotClient(credentials)
    const res = await client.get<PatriotAccount[]>(
      'accounts',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new PatriotClient(credentials)
    const res = await client.get<PatriotAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new PatriotClient(credentials)
    const res = await client.get<PatriotJournal[]>(
      'journal-entries',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new PatriotClient(credentials)
    const res = await client.get<PatriotJournal>(`journal-entries/${id}`)
    return transformJournal(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new PatriotClient(credentials)
    const res = await client.get<PatriotTaxRate[]>(
      'tax-rates',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new PatriotClient(credentials)
    const res = await client.get<PatriotTaxRate>(`tax-rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new PatriotClient(credentials)
    const res = await client.get<PatriotTransaction[]>(
      'transactions',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new PatriotClient(credentials)
    const res = await client.get<PatriotTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new PatriotClient(credentials)
    const res = await client.get<PatriotExpense[]>(
      'expenses',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new PatriotClient(credentials)
    const res = await client.get<PatriotExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new PatriotClient(credentials)
    const res = await client.get<PatriotCreditMemo[]>(
      'credit-memos',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new PatriotClient(credentials)
    const res = await client.get<PatriotCreditMemo>(`credit-memos/${id}`)
    return transformCreditMemo(res)
  }
}
