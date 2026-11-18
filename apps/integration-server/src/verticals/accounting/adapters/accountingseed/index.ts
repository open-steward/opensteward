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
import { AccountingSeedClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type AccountingSeedInvoice } from './transform/invoice'
import { transformBill, type AccountingSeedBill } from './transform/bill'
import { transformContact, type AccountingSeedContact } from './transform/contact'
import { transformAccount, type AccountingSeedAccount } from './transform/account'
import { transformJournal, type AccountingSeedJournal } from './transform/journal'
import { transformOrganization, type AccountingSeedOrganization } from './transform/organization'
import { transformTaxRate, type AccountingSeedTaxRate } from './transform/taxrate'
import { transformTransaction, type AccountingSeedTransaction } from './transform/transaction'
import { transformExpense, type AccountingSeedExpense } from './transform/expense'
import { transformCreditMemo, type AccountingSeedCreditMemo } from './transform/creditmemo'

interface AccountingSeedAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class AccountingSeedAdapter implements AccountingAdapter {
  readonly platform = 'accountingseed'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: AccountingSeedAdapterConfig) {
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
    const client = new AccountingSeedClient(credentials)
    const res = await client.get<AccountingSeedOrganization>('sobjects/Account/me')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new AccountingSeedClient(credentials)
    const pag = this.paginationParams(params)
    const res = await client.get<AccountingSeedInvoice[]>(
      'sobjects/AcctSeed__Billing__c',
      pag,
    )
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new AccountingSeedClient(credentials)
    const res = await client.get<AccountingSeedInvoice>(`sobjects/AcctSeed__Billing__c/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new AccountingSeedClient(credentials)
    const pag = this.paginationParams(params)
    const res = await client.get<AccountingSeedBill[]>(
      'sobjects/AcctSeed__Account_Payable__c',
      pag,
    )
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new AccountingSeedClient(credentials)
    const res = await client.get<AccountingSeedBill>(`sobjects/AcctSeed__Account_Payable__c/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new AccountingSeedClient(credentials)
    const pag = this.paginationParams(params)
    const res = await client.get<AccountingSeedContact[]>(
      'sobjects/Contact',
      pag,
    )
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new AccountingSeedClient(credentials)
    const res = await client.get<AccountingSeedContact>(`sobjects/Contact/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new AccountingSeedClient(credentials)
    const pag = this.paginationParams(params)
    const res = await client.get<AccountingSeedAccount[]>(
      'sobjects/AcctSeed__GL_Account__c',
      pag,
    )
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new AccountingSeedClient(credentials)
    const res = await client.get<AccountingSeedAccount>(`sobjects/AcctSeed__GL_Account__c/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new AccountingSeedClient(credentials)
    const pag = this.paginationParams(params)
    const res = await client.get<AccountingSeedJournal[]>(
      'sobjects/AcctSeed__Journal_Entry__c',
      pag,
    )
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new AccountingSeedClient(credentials)
    const res = await client.get<AccountingSeedJournal>(`sobjects/AcctSeed__Journal_Entry__c/${id}`)
    return transformJournal(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new AccountingSeedClient(credentials)
    const pag = this.paginationParams(params)
    const res = await client.get<AccountingSeedTaxRate[]>(
      'sobjects/AcctSeed__Tax_Rate__c',
      pag,
    )
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new AccountingSeedClient(credentials)
    const res = await client.get<AccountingSeedTaxRate>(`sobjects/AcctSeed__Tax_Rate__c/${id}`)
    return transformTaxRate(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new AccountingSeedClient(credentials)
    const pag = this.paginationParams(params)
    const res = await client.get<AccountingSeedTransaction[]>(
      'sobjects/AcctSeed__Cash_Receipt__c',
      pag,
    )
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new AccountingSeedClient(credentials)
    const res = await client.get<AccountingSeedTransaction>(`sobjects/AcctSeed__Cash_Receipt__c/${id}`)
    return transformTransaction(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new AccountingSeedClient(credentials)
    const pag = this.paginationParams(params)
    const res = await client.get<AccountingSeedExpense[]>(
      'sobjects/AcctSeed__Expense_Report__c',
      pag,
    )
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new AccountingSeedClient(credentials)
    const res = await client.get<AccountingSeedExpense>(`sobjects/AcctSeed__Expense_Report__c/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new AccountingSeedClient(credentials)
    const pag = this.paginationParams(params)
    const res = await client.get<AccountingSeedCreditMemo[]>(
      'sobjects/AcctSeed__Billing_Credit_Memo__c',
      pag,
    )
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new AccountingSeedClient(credentials)
    const res = await client.get<AccountingSeedCreditMemo>(`sobjects/AcctSeed__Billing_Credit_Memo__c/${id}`)
    return transformCreditMemo(res)
  }
}
