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
import { StessaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type StessaInvoice } from './transform/invoice'
import { transformBill, type StessaBill } from './transform/bill'
import { transformContact, type StessaContact } from './transform/contact'
import { transformAccount, type StessaAccount } from './transform/account'
import { transformJournal, type StessaJournal } from './transform/journal'
import { transformOrganization, type StessaOrganization } from './transform/organization'
import { transformTaxRate, type StessaTaxRate } from './transform/taxrate'
import { transformTransaction, type StessaTransaction } from './transform/transaction'
import { transformExpense, type StessaExpense } from './transform/expense'
import { transformCreditMemo, type StessaCreditMemo } from './transform/creditmemo'

interface StessaAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class StessaAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'stessa'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: StessaAdapterConfig) {
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
    const client = new StessaClient(credentials)
    const res = await client.get<StessaOrganization>('organizations/me')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new StessaClient(credentials)
    const res = await client.get<StessaInvoice[]>(
      'invoices',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new StessaClient(credentials)
    const res = await client.get<StessaInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new StessaClient(credentials)
    const res = await client.get<StessaBill[]>(
      'bills',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new StessaClient(credentials)
    const res = await client.get<StessaBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new StessaClient(credentials)
    const res = await client.get<StessaContact[]>(
      'contacts',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new StessaClient(credentials)
    const res = await client.get<StessaContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new StessaClient(credentials)
    const res = await client.get<StessaAccount[]>(
      'accounts',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new StessaClient(credentials)
    const res = await client.get<StessaAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new StessaClient(credentials)
    const res = await client.get<StessaJournal[]>(
      'journals',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new StessaClient(credentials)
    const res = await client.get<StessaJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new StessaClient(credentials)
    const res = await client.get<StessaTaxRate[]>(
      'tax-rates',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new StessaClient(credentials)
    const res = await client.get<StessaTaxRate>(`tax-rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new StessaClient(credentials)
    const res = await client.get<StessaTransaction[]>(
      'transactions',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new StessaClient(credentials)
    const res = await client.get<StessaTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new StessaClient(credentials)
    const res = await client.get<StessaExpense[]>(
      'expenses',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new StessaClient(credentials)
    const res = await client.get<StessaExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new StessaClient(credentials)
    const res = await client.get<StessaCreditMemo[]>(
      'credit-memos',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new StessaClient(credentials)
    const res = await client.get<StessaCreditMemo>(`credit-memos/${id}`)
    return transformCreditMemo(res)
  }
}
