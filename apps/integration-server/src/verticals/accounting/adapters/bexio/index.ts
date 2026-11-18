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

import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshAccessToken as doRefreshAccessToken,
} from './auth'
import { BexioClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type BexioInvoice } from './transform/invoice'
import { transformBill, type BexioBill } from './transform/bill'
import { transformContact, type BexioContact } from './transform/contact'
import { transformAccount, type BexioAccount } from './transform/account'
import { transformJournal, type BexioJournal } from './transform/journal'
import { transformOrganization, type BexioOrganization } from './transform/organization'
import { transformExpense, type BexioExpense } from './transform/expense'
import { transformTaxRate, type BexioTaxRate } from './transform/taxrate'
import { transformTransaction, type BexioTransaction } from './transform/transaction'
import { transformCreditMemo, type BexioCreditMemo } from './transform/creditmemo'

interface BexioAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class BexioAdapter implements AccountingAdapter {
  readonly platform = 'bexio'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: BexioAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, (overrideScopes ?? this.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return doRefreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const offset = (page - 1) * limit
    return { offset, limit }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new BexioClient(credentials)
    const res = await client.get<BexioOrganization>('company_profile')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new BexioClient(credentials)
    const res = await client.get<BexioInvoice[]>('kb_invoice', this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new BexioClient(credentials)
    const res = await client.get<BexioInvoice>(`kb_invoice/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new BexioClient(credentials)
    const res = await client.get<BexioBill[]>('kb_bill', this.paginationParams(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new BexioClient(credentials)
    const res = await client.get<BexioBill>(`kb_bill/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new BexioClient(credentials)
    const res = await client.get<BexioContact[]>('contact', this.paginationParams(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new BexioClient(credentials)
    const res = await client.get<BexioContact>(`contact/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new BexioClient(credentials)
    const res = await client.get<BexioAccount[]>('accounts', this.paginationParams(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new BexioClient(credentials)
    const res = await client.get<BexioAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new BexioClient(credentials)
    const res = await client.get<BexioJournal[]>(
      'accounting_journal',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new BexioClient(credentials)
    const res = await client.get<BexioJournal>(`accounting_journal/${id}`)
    return transformJournal(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new BexioClient(credentials)
    const res = await client.get<BexioTaxRate[]>('vat_rate', this.paginationParams(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new BexioClient(credentials)
    const res = await client.get<BexioTaxRate>(`vat_rate/${id}`)
    return transformTaxRate(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new BexioClient(credentials)
    const res = await client.get<BexioTransaction[]>(
      'banking/payments',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new BexioClient(credentials)
    const res = await client.get<BexioTransaction>(`banking/payments/${id}`)
    return transformTransaction(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new BexioClient(credentials)
    const res = await client.get<BexioExpense[]>('expense_entries', this.paginationParams(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new BexioClient(credentials)
    const res = await client.get<BexioExpense>(`expense_entries/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new BexioClient(credentials)
    const res = await client.get<BexioCreditMemo[]>(
      'kb_credit_note',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new BexioClient(credentials)
    const res = await client.get<BexioCreditMemo>(`kb_credit_note/${id}`)
    return transformCreditMemo(res)
  }
}
