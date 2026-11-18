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
import { MyunisoftClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type MyunisoftInvoice } from './transform/invoice'
import { transformBill, type MyunisoftBill } from './transform/bill'
import { transformContact, type MyunisoftContact } from './transform/contact'
import { transformAccount, type MyunisoftAccount } from './transform/account'
import { transformJournal, type MyunisoftJournal } from './transform/journal'
import { transformOrganization, type MyunisoftOrganization } from './transform/organization'
import { transformTaxRate, type MyunisoftTaxRate } from './transform/taxrate'
import { transformTransaction, type MyunisoftTransaction } from './transform/transaction'
import { transformExpense, type MyunisoftExpense } from './transform/expense'
import { transformCreditMemo, type MyunisoftCreditMemo } from './transform/creditmemo'

interface MyunisoftAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

interface MyunisoftListResponse<T> {
  data: T[]
  meta: { total: number; page: number; per_page: number }
}

export class MyunisoftAdapter implements AccountingAdapter {
  readonly platform = 'myunisoft'
  readonly version = '0.1.0'

  constructor(_config: MyunisoftAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(credentials.refreshToken, '', '')
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new MyunisoftClient(credentials)
    const res = await client.get<MyunisoftOrganization>('company')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new MyunisoftClient(credentials)
    const res = await client.get<MyunisoftListResponse<MyunisoftInvoice>>('invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new MyunisoftClient(credentials)
    const res = await client.get<MyunisoftInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new MyunisoftClient(credentials)
    const res = await client.get<MyunisoftListResponse<MyunisoftBill>>('supplier_invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new MyunisoftClient(credentials)
    const res = await client.get<MyunisoftBill>(`supplier_invoices/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new MyunisoftClient(credentials)
    const res = await client.get<MyunisoftListResponse<MyunisoftContact>>('contacts', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new MyunisoftClient(credentials)
    const res = await client.get<MyunisoftContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new MyunisoftClient(credentials)
    const res = await client.get<MyunisoftListResponse<MyunisoftAccount>>('accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new MyunisoftClient(credentials)
    const res = await client.get<MyunisoftAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new MyunisoftClient(credentials)
    const res = await client.get<MyunisoftListResponse<MyunisoftJournal>>('journal_entries', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new MyunisoftClient(credentials)
    const res = await client.get<MyunisoftJournal>(`journal_entries/${id}`)
    return transformJournal(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new MyunisoftClient(credentials)
    const res = await client.get<MyunisoftListResponse<MyunisoftTaxRate>>('tax_rates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new MyunisoftClient(credentials)
    const res = await client.get<MyunisoftTaxRate>(`tax_rates/${id}`)
    return transformTaxRate(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new MyunisoftClient(credentials)
    const res = await client.get<MyunisoftListResponse<MyunisoftTransaction>>('transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new MyunisoftClient(credentials)
    const res = await client.get<MyunisoftTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new MyunisoftClient(credentials)
    const res = await client.get<MyunisoftListResponse<MyunisoftExpense>>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new MyunisoftClient(credentials)
    const res = await client.get<MyunisoftExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new MyunisoftClient(credentials)
    const res = await client.get<MyunisoftListResponse<MyunisoftCreditMemo>>('credit_notes', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new MyunisoftClient(credentials)
    const res = await client.get<MyunisoftCreditMemo>(`credit_notes/${id}`)
    return transformCreditMemo(res)
  }
}
