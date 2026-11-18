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
import { CegidClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type CegidInvoice } from './transform/invoice'
import { transformBill, type CegidBill } from './transform/bill'
import { transformContact, type CegidContact } from './transform/contact'
import { transformAccount, type CegidAccount } from './transform/account'
import { transformJournal, type CegidJournal } from './transform/journal'
import { transformOrganization, type CegidOrganization } from './transform/organization'
import { transformTaxRate, type CegidTaxRate } from './transform/taxrate'
import { transformTransaction, type CegidTransaction } from './transform/transaction'
import { transformExpense, type CegidExpense } from './transform/expense'
import { transformCreditMemo, type CegidCreditMemo } from './transform/creditmemo'

interface CegidAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

interface CegidListResponse<T> {
  value: T[]
  '@odata.count'?: number
}

export class CegidAdapter implements AccountingAdapter {
  readonly platform = 'cegid'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: CegidAdapterConfig) {
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
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skip = ((params.page ?? 1) - 1) * top
    return { $top: top, $skip: skip }
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new CegidClient(credentials)
    const res = await client.get<CegidOrganization>('company')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new CegidClient(credentials)
    const res = await client.get<CegidListResponse<CegidInvoice>>('salesInvoices', this.paginationParams(params))
    return (res.value ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new CegidClient(credentials)
    const res = await client.get<CegidInvoice>(`salesInvoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new CegidClient(credentials)
    const res = await client.get<CegidListResponse<CegidBill>>('purchaseInvoices', this.paginationParams(params))
    return (res.value ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new CegidClient(credentials)
    const res = await client.get<CegidBill>(`purchaseInvoices/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new CegidClient(credentials)
    const res = await client.get<CegidListResponse<CegidContact>>('contacts', this.paginationParams(params))
    return (res.value ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new CegidClient(credentials)
    const res = await client.get<CegidContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new CegidClient(credentials)
    const res = await client.get<CegidListResponse<CegidAccount>>('accounts', this.paginationParams(params))
    return (res.value ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new CegidClient(credentials)
    const res = await client.get<CegidAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new CegidClient(credentials)
    const res = await client.get<CegidListResponse<CegidJournal>>('journalEntries', this.paginationParams(params))
    return (res.value ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new CegidClient(credentials)
    const res = await client.get<CegidJournal>(`journalEntries/${id}`)
    return transformJournal(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new CegidClient(credentials)
    const res = await client.get<CegidListResponse<CegidTaxRate>>('taxCodes', this.paginationParams(params))
    return (res.value ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new CegidClient(credentials)
    const res = await client.get<CegidTaxRate>(`taxCodes/${id}`)
    return transformTaxRate(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new CegidClient(credentials)
    const res = await client.get<CegidListResponse<CegidTransaction>>('bankTransactions', this.paginationParams(params))
    return (res.value ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new CegidClient(credentials)
    const res = await client.get<CegidTransaction>(`bankTransactions/${id}`)
    return transformTransaction(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new CegidClient(credentials)
    const res = await client.get<CegidListResponse<CegidExpense>>('expenses', this.paginationParams(params))
    return (res.value ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new CegidClient(credentials)
    const res = await client.get<CegidExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new CegidClient(credentials)
    const res = await client.get<CegidListResponse<CegidCreditMemo>>('salesCreditMemos', this.paginationParams(params))
    return (res.value ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new CegidClient(credentials)
    const res = await client.get<CegidCreditMemo>(`salesCreditMemos/${id}`)
    return transformCreditMemo(res)
  }
}
