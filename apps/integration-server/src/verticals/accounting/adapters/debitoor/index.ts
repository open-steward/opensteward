import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Organization } from '../../schema/organization'
import type { TaxRate } from '../../schema/taxrate'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Transaction } from '../../schema/transaction'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { DebitoorClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type DebitoorInvoice } from './transform/invoice'
import { transformBill, type DebitoorBill } from './transform/bill'
import { transformContact, type DebitoorContact } from './transform/contact'
import { transformAccount, type DebitoorAccount } from './transform/account'
import { transformJournal, type DebitoorJournal } from './transform/journal'
import { transformOrganization, type DebitoorOrganization } from './transform/organization'
import { transformTaxRate, type DebitoorTaxRate } from './transform/taxrate'
import { transformExpense, type DebitoorExpense } from './transform/expense'
import { transformCreditMemo, type DebitoorCreditMemo } from './transform/creditmemo'
import { transformTransaction, type DebitoorTransaction } from './transform/transaction'

interface DebitoorAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class DebitoorAdapter implements AccountingAdapter {
  readonly platform = 'debitoor'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: DebitoorAdapterConfig) {
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
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new DebitoorClient(credentials)
    const res = await client.get<DebitoorOrganization>('settings/v1')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new DebitoorClient(credentials)
    const res = await client.get<DebitoorInvoice[]>('sales/invoices/v2', this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new DebitoorClient(credentials)
    const res = await client.get<DebitoorInvoice>(`sales/invoices/v2/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new DebitoorClient(credentials)
    const res = await client.get<DebitoorBill[]>('purchase/expenses/v1', this.paginationParams(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new DebitoorClient(credentials)
    const res = await client.get<DebitoorBill>(`purchase/expenses/v1/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new DebitoorClient(credentials)
    const res = await client.get<DebitoorContact[]>('customers/v2', this.paginationParams(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new DebitoorClient(credentials)
    const res = await client.get<DebitoorContact>(`customers/v2/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new DebitoorClient(credentials)
    const res = await client.get<DebitoorAccount[]>('accounts/v2', this.paginationParams(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new DebitoorClient(credentials)
    const res = await client.get<DebitoorAccount>(`accounts/v2/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new DebitoorClient(credentials)
    const res = await client.get<DebitoorJournal[]>('accounting/journals/v1', this.paginationParams(params))
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new DebitoorClient(credentials)
    const res = await client.get<DebitoorJournal>(`accounting/journals/v1/${id}`)
    return transformJournal(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new DebitoorClient(credentials)
    const res = await client.get<DebitoorTaxRate[]>('taxrates/v3', this.paginationParams(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new DebitoorClient(credentials)
    const res = await client.get<DebitoorTaxRate>(`taxrates/v3/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new DebitoorClient(credentials)
    const res = await client.get<DebitoorExpense[]>('purchase/expenses/v1', this.paginationParams(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new DebitoorClient(credentials)
    const res = await client.get<DebitoorExpense>(`purchase/expenses/v1/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new DebitoorClient(credentials)
    const res = await client.get<DebitoorCreditMemo[]>('sales/creditnotes/v2', this.paginationParams(params))
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new DebitoorClient(credentials)
    const res = await client.get<DebitoorCreditMemo>(`sales/creditnotes/v2/${id}`)
    return transformCreditMemo(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new DebitoorClient(credentials)
    const res = await client.get<DebitoorTransaction[]>('banking/transactions/v1', this.paginationParams(params))
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new DebitoorClient(credentials)
    const res = await client.get<DebitoorTransaction>(`banking/transactions/v1/${id}`)
    return transformTransaction(res)
  }
}
