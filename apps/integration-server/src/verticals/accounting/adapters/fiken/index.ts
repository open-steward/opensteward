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

import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshAccessToken as doRefreshAccessToken,
} from './auth'
import { FikenClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type FikenInvoice } from './transform/invoice'
import { transformBill, type FikenBill } from './transform/bill'
import { transformContact, type FikenContact } from './transform/contact'
import { transformAccount, type FikenAccount } from './transform/account'
import { transformJournal, type FikenJournal } from './transform/journal'
import { transformOrganization, type FikenOrganization } from './transform/organization'
import { transformExpense, type FikenExpense } from './transform/expense'
import { transformTaxRate, type FikenTaxRate } from './transform/taxrate'
import { transformTransaction, type FikenTransaction } from './transform/transaction'
import { transformCreditMemo, type FikenCreditMemo } from './transform/creditmemo'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class FikenAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'fiken'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(opts: {
    clientId: string
    clientSecret: string
    redirectUri: string
    scopes: string[]
  }) {
    this.clientId = opts.clientId
    this.clientSecret = opts.clientSecret
    this.redirectUri = opts.redirectUri
    this.scopes = opts.scopes
  }

  private slug(credentials: Credentials): string {
    if (!credentials.tenantId) throw new Error('tenantId (companySlug) is required for Fiken')
    return credentials.tenantId
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

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new FikenClient(credentials)
    const companySlug = this.slug(credentials)
    const res = await client.get<FikenOrganization>(`companies/${companySlug}`)
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new FikenClient(credentials)
    const companySlug = this.slug(credentials)
    const page = params.page ?? 0
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<FikenInvoice[]>(`companies/${companySlug}/invoices`, {
      page,
      pageSize,
    })
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new FikenClient(credentials)
    const companySlug = this.slug(credentials)
    const res = await client.get<FikenInvoice>(`companies/${companySlug}/invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new FikenClient(credentials)
    const companySlug = this.slug(credentials)
    const page = params.page ?? 0
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<FikenBill[]>(`companies/${companySlug}/purchases`, {
      page,
      pageSize,
    })
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new FikenClient(credentials)
    const companySlug = this.slug(credentials)
    const res = await client.get<FikenBill>(`companies/${companySlug}/purchases/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new FikenClient(credentials)
    const companySlug = this.slug(credentials)
    const page = params.page ?? 0
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<FikenContact[]>(`companies/${companySlug}/contacts`, {
      page,
      pageSize,
    })
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new FikenClient(credentials)
    const companySlug = this.slug(credentials)
    const res = await client.get<FikenContact>(`companies/${companySlug}/contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new FikenClient(credentials)
    const companySlug = this.slug(credentials)
    const page = params.page ?? 0
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<FikenAccount[]>(`companies/${companySlug}/accounts`, {
      page,
      pageSize,
    })
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new FikenClient(credentials)
    const companySlug = this.slug(credentials)
    const res = await client.get<FikenAccount>(`companies/${companySlug}/accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new FikenClient(credentials)
    const companySlug = this.slug(credentials)
    const page = params.page ?? 0
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<FikenJournal[]>(`companies/${companySlug}/journalEntries`, {
      page,
      pageSize,
    })
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new FikenClient(credentials)
    const companySlug = this.slug(credentials)
    const res = await client.get<FikenJournal>(`companies/${companySlug}/journalEntries/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new FikenClient(credentials)
    const companySlug = this.slug(credentials)
    const page = params.page ?? 0
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<FikenTransaction[]>(`companies/${companySlug}/transactions`, {
      page,
      pageSize,
    })
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new FikenClient(credentials)
    const companySlug = this.slug(credentials)
    const res = await client.get<FikenTransaction>(
      `companies/${companySlug}/transactions/${id}`,
    )
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new FikenClient(credentials)
    const companySlug = this.slug(credentials)
    const page = params.page ?? 0
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<FikenTaxRate[]>(`companies/${companySlug}/bankAccounts`, {
      page,
      pageSize,
    })
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new FikenClient(credentials)
    const companySlug = this.slug(credentials)
    const res = await client.get<FikenTaxRate>(`companies/${companySlug}/bankAccounts/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new FikenClient(credentials)
    const companySlug = this.slug(credentials)
    const page = params.page ?? 0
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<FikenExpense[]>(`companies/${companySlug}/purchases`, {
      page,
      pageSize,
    })
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new FikenClient(credentials)
    const companySlug = this.slug(credentials)
    const res = await client.get<FikenExpense>(`companies/${companySlug}/purchases/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new FikenClient(credentials)
    const companySlug = this.slug(credentials)
    const page = params.page ?? 0
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<FikenCreditMemo[]>(`companies/${companySlug}/creditNotes`, {
      page,
      pageSize,
    })
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new FikenClient(credentials)
    const companySlug = this.slug(credentials)
    const res = await client.get<FikenCreditMemo>(
      `companies/${companySlug}/creditNotes/${id}`,
    )
    return transformCreditMemo(res)
  }
}
