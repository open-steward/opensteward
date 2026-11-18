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
import { KashooClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type KashooInvoice } from './transform/invoice'
import { transformBill, type KashooBill } from './transform/bill'
import { transformContact, type KashooContact } from './transform/contact'
import { transformAccount, type KashooAccount } from './transform/account'
import { transformJournal, type KashooJournal } from './transform/journal'
import { transformOrganization, type KashooOrganization } from './transform/organization'
import { transformExpense, type KashooExpense } from './transform/expense'
import { transformTaxRate, type KashooTaxRate } from './transform/taxrate'
import { transformTransaction, type KashooTransaction } from './transform/transaction'
import { transformCreditMemo, type KashooCreditMemo } from './transform/creditmemo'

interface KashooAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class KashooAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'kashoo'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: KashooAdapterConfig) {
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

  // businessId is stored in credentials.tenantId after the OAuth2 flow
  private businessId(credentials: Credentials): string {
    return credentials.tenantId ?? ''
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new KashooClient(credentials)
    const businessId = this.businessId(credentials)
    const res = await client.get<KashooOrganization>(`businesses/${businessId}`)
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new KashooClient(credentials)
    const businessId = this.businessId(credentials)
    const res = await client.get<KashooInvoice[]>(`businesses/${businessId}/invoices`, this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new KashooClient(credentials)
    const res = await client.get<KashooInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new KashooClient(credentials)
    const businessId = this.businessId(credentials)
    const res = await client.get<KashooBill[]>(`businesses/${businessId}/bills`, this.paginationParams(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new KashooClient(credentials)
    const res = await client.get<KashooBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new KashooClient(credentials)
    const businessId = this.businessId(credentials)
    const res = await client.get<KashooContact[]>(`businesses/${businessId}/contacts`, this.paginationParams(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new KashooClient(credentials)
    const res = await client.get<KashooContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new KashooClient(credentials)
    const businessId = this.businessId(credentials)
    const res = await client.get<KashooAccount[]>(`businesses/${businessId}/accounts`, this.paginationParams(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new KashooClient(credentials)
    const res = await client.get<KashooAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new KashooClient(credentials)
    const businessId = this.businessId(credentials)
    const res = await client.get<KashooJournal[]>(`businesses/${businessId}/journal-entries`, this.paginationParams(params))
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new KashooClient(credentials)
    const res = await client.get<KashooJournal>(`journal-entries/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new KashooClient(credentials)
    const businessId = this.businessId(credentials)
    const res = await client.get<KashooTransaction[]>(`businesses/${businessId}/transactions`, this.paginationParams(params))
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new KashooClient(credentials)
    const res = await client.get<KashooTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new KashooClient(credentials)
    const businessId = this.businessId(credentials)
    const res = await client.get<KashooTaxRate[]>(`businesses/${businessId}/tax-rates`, this.paginationParams(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new KashooClient(credentials)
    const res = await client.get<KashooTaxRate>(`tax-rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new KashooClient(credentials)
    const businessId = this.businessId(credentials)
    const res = await client.get<KashooExpense[]>(`businesses/${businessId}/expenses`, this.paginationParams(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new KashooClient(credentials)
    const res = await client.get<KashooExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new KashooClient(credentials)
    const businessId = this.businessId(credentials)
    const res = await client.get<KashooCreditMemo[]>(`businesses/${businessId}/credit-memos`, this.paginationParams(params))
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new KashooClient(credentials)
    const res = await client.get<KashooCreditMemo>(`credit-memos/${id}`)
    return transformCreditMemo(res)
  }
}
