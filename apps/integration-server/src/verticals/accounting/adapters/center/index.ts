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

import { buildAuthUrl, exchangeCode, refreshCredentials as doRefreshCredentials } from './auth'
import { CenterClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type CenterInvoice } from './transform/invoice'
import { transformBill, type CenterBill } from './transform/bill'
import { transformContact, type CenterContact } from './transform/contact'
import { transformAccount, type CenterAccount } from './transform/account'
import { transformJournal, type CenterJournal } from './transform/journal'
import { transformOrganization, type CenterOrganization } from './transform/organization'
import { transformTaxRate, type CenterTaxRate } from './transform/taxrate'
import { transformTransaction, type CenterTransaction } from './transform/transaction'
import { transformExpense, type CenterExpense } from './transform/expense'
import { transformCreditMemo, type CenterCreditMemo } from './transform/creditmemo'

interface CenterAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri?: string
  scopes?: string[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class CenterAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'center'
  readonly version = '0.1.0'

  private apiKey: string

  constructor(config: CenterAdapterConfig) {
    this.apiKey = config.clientId
  }

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(apiKey: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(apiKey)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private get credentials(): Credentials {
    return { accessToken: this.apiKey }
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const offset = (page - 1) * limit
    return { limit, offset }
  }

  // --- Organization ---

  async getOrganization(_credentials: Credentials): Promise<Organization> {
    const client = new CenterClient(this.credentials)
    const res = await client.get<CenterOrganization>('organizations/me')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new CenterClient(this.credentials)
    const res = await client.get<CenterInvoice[]>(
      'invoices',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new CenterClient(this.credentials)
    const res = await client.get<CenterInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new CenterClient(this.credentials)
    const res = await client.get<CenterBill[]>(
      'bills',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new CenterClient(this.credentials)
    const res = await client.get<CenterBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new CenterClient(this.credentials)
    const res = await client.get<CenterContact[]>(
      'contacts',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new CenterClient(this.credentials)
    const res = await client.get<CenterContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new CenterClient(this.credentials)
    const res = await client.get<CenterAccount[]>(
      'accounts',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new CenterClient(this.credentials)
    const res = await client.get<CenterAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new CenterClient(this.credentials)
    const res = await client.get<CenterJournal[]>(
      'journals',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new CenterClient(this.credentials)
    const res = await client.get<CenterJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new CenterClient(this.credentials)
    const res = await client.get<CenterTaxRate[]>(
      'tax-rates',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new CenterClient(this.credentials)
    const res = await client.get<CenterTaxRate>(`tax-rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new CenterClient(this.credentials)
    const res = await client.get<CenterTransaction[]>(
      'transactions',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new CenterClient(this.credentials)
    const res = await client.get<CenterTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new CenterClient(this.credentials)
    const res = await client.get<CenterExpense[]>(
      'expenses',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new CenterClient(this.credentials)
    const res = await client.get<CenterExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new CenterClient(this.credentials)
    const res = await client.get<CenterCreditMemo[]>(
      'credit-memos',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new CenterClient(this.credentials)
    const res = await client.get<CenterCreditMemo>(`credit-memos/${id}`)
    return transformCreditMemo(res)
  }
}
