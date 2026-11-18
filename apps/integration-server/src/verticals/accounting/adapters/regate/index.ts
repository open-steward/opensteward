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
import { RegateClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type RegateInvoice } from './transform/invoice'
import { transformBill, type RegateBill } from './transform/bill'
import { transformContact, type RegateContact } from './transform/contact'
import { transformAccount, type RegateAccount } from './transform/account'
import { transformJournal, type RegateJournal } from './transform/journal'
import { transformOrganization, type RegateOrganization } from './transform/organization'
import { transformTaxRate, type RegateTaxRate } from './transform/taxrate'
import { transformTransaction, type RegateTransaction } from './transform/transaction'
import { transformExpense, type RegateExpense } from './transform/expense'
import { transformCreditMemo, type RegateCreditMemo } from './transform/creditmemo'

interface RegateAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

interface RegateListResponse<T> {
  data: T[]
  meta: { total: number; page: number; per_page: number }
}

export class RegateAdapter implements AccountingAdapter {
  readonly platform = 'regate'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: RegateAdapterConfig) {
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
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new RegateClient(credentials)
    const res = await client.get<RegateOrganization>('company')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new RegateClient(credentials)
    const res = await client.get<RegateListResponse<RegateInvoice>>('sales_invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new RegateClient(credentials)
    const res = await client.get<RegateInvoice>(`sales_invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new RegateClient(credentials)
    const res = await client.get<RegateListResponse<RegateBill>>('purchase_invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new RegateClient(credentials)
    const res = await client.get<RegateBill>(`purchase_invoices/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new RegateClient(credentials)
    const res = await client.get<RegateListResponse<RegateContact>>('customers', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new RegateClient(credentials)
    const res = await client.get<RegateContact>(`customers/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new RegateClient(credentials)
    const res = await client.get<RegateListResponse<RegateAccount>>('accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new RegateClient(credentials)
    const res = await client.get<RegateAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new RegateClient(credentials)
    const res = await client.get<RegateListResponse<RegateJournal>>('journal_entries', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new RegateClient(credentials)
    const res = await client.get<RegateJournal>(`journal_entries/${id}`)
    return transformJournal(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new RegateClient(credentials)
    const res = await client.get<RegateListResponse<RegateTaxRate>>('tax_rates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new RegateClient(credentials)
    const res = await client.get<RegateTaxRate>(`tax_rates/${id}`)
    return transformTaxRate(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new RegateClient(credentials)
    const res = await client.get<RegateListResponse<RegateTransaction>>('transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new RegateClient(credentials)
    const res = await client.get<RegateTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new RegateClient(credentials)
    const res = await client.get<RegateListResponse<RegateExpense>>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new RegateClient(credentials)
    const res = await client.get<RegateExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new RegateClient(credentials)
    const res = await client.get<RegateListResponse<RegateCreditMemo>>('credit_notes', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new RegateClient(credentials)
    const res = await client.get<RegateCreditMemo>(`credit_notes/${id}`)
    return transformCreditMemo(res)
  }
}
