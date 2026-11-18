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
  refreshAccessToken,
} from './auth'
import { TwinfieldClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type TwinfieldInvoice } from './transform/invoice'
import { transformBill, type TwinfieldBill } from './transform/bill'
import { transformContact, type TwinfieldContact } from './transform/contact'
import { transformAccount, type TwinfieldAccount } from './transform/account'
import { transformJournal, type TwinfieldJournal } from './transform/journal'
import { transformOrganization, type TwinfieldOrganization } from './transform/organization'
import { transformTaxRate, type TwinfieldTaxRate } from './transform/taxrate'
import { transformTransaction, type TwinfieldTransaction } from './transform/transaction'
import { transformExpense, type TwinfieldExpense } from './transform/expense'
import { transformCreditMemo, type TwinfieldCreditMemo } from './transform/creditmemo'

export class TwinfieldAdapter implements AccountingAdapter {
  readonly platform = 'twinfield'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(opts: {
    clientId: string
    clientSecret: string
    redirectUri: string
    scopes?: string[]
  }) {
    this.clientId = opts.clientId
    this.clientSecret = opts.clientSecret
    this.redirectUri = opts.redirectUri
    this.scopes = opts.scopes ?? ['openid', 'twf.organisationUser', 'twf.organisation']
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, (overrideScopes ?? this.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new TwinfieldClient(credentials)
    const res = await client.get<{ company: TwinfieldOrganization }>('api/v1/company')
    return transformOrganization(res.company)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new TwinfieldClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ invoices: TwinfieldInvoice[] }>('api/v1/salesinvoices', {
      page,
      pageSize: limit,
    })
    return (res.invoices ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new TwinfieldClient(credentials)
    const res = await client.get<{ invoice: TwinfieldInvoice }>(`api/v1/salesinvoices/${id}`)
    return transformInvoice(res.invoice)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new TwinfieldClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ invoices: TwinfieldBill[] }>('api/v1/purchaseinvoices', {
      page,
      pageSize: limit,
    })
    return (res.invoices ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new TwinfieldClient(credentials)
    const res = await client.get<{ invoice: TwinfieldBill }>(`api/v1/purchaseinvoices/${id}`)
    return transformBill(res.invoice)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new TwinfieldClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ dimensions: TwinfieldContact[] }>('api/v1/dimensions', {
      page,
      pageSize: limit,
      dimType: 'DEB,CRE',
    })
    return (res.dimensions ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new TwinfieldClient(credentials)
    const res = await client.get<{ dimension: TwinfieldContact }>(`api/v1/dimensions/${id}`)
    return transformContact(res.dimension)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new TwinfieldClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ dimensions: TwinfieldAccount[] }>('api/v1/dimensions', {
      page,
      pageSize: limit,
      dimType: 'BAS,PNL',
    })
    return (res.dimensions ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new TwinfieldClient(credentials)
    const res = await client.get<{ dimension: TwinfieldAccount }>(`api/v1/dimensions/${id}`)
    return transformAccount(res.dimension)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new TwinfieldClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ transactions: TwinfieldJournal[] }>(
      'api/v1/transactions',
      { page, pageSize: limit },
    )
    return (res.transactions ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new TwinfieldClient(credentials)
    const res = await client.get<{ transaction: TwinfieldJournal }>(
      `api/v1/transactions/${id}`,
    )
    return transformJournal(res.transaction)
  }

  // --- Transactions ---

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const client = new TwinfieldClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ transactions: TwinfieldTransaction[] }>(
      'api/v1/transactions',
      { page, pageSize: limit, type: 'bank' },
    )
    return (res.transactions ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new TwinfieldClient(credentials)
    const res = await client.get<{ transaction: TwinfieldTransaction }>(
      `api/v1/transactions/${id}`,
    )
    return transformTransaction(res.transaction)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new TwinfieldClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ vatCodes: TwinfieldTaxRate[] }>('api/v1/vatcodes', {
      page,
      pageSize: limit,
    })
    return (res.vatCodes ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new TwinfieldClient(credentials)
    const res = await client.get<{ vatCode: TwinfieldTaxRate }>(`api/v1/vatcodes/${id}`)
    return transformTaxRate(res.vatCode)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new TwinfieldClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ expenses: TwinfieldExpense[] }>('api/v1/expenses', {
      page,
      pageSize: limit,
    })
    return (res.expenses ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new TwinfieldClient(credentials)
    const res = await client.get<{ expense: TwinfieldExpense }>(`api/v1/expenses/${id}`)
    return transformExpense(res.expense)
  }

  // --- Credit Memos ---

  async listCreditMemos(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<CreditMemo[]> {
    const client = new TwinfieldClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ invoices: TwinfieldCreditMemo[] }>(
      'api/v1/salesinvoices',
      { page, pageSize: limit, type: 'credit' },
    )
    return (res.invoices ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new TwinfieldClient(credentials)
    const res = await client.get<{ invoice: TwinfieldCreditMemo }>(
      `api/v1/salesinvoices/${id}`,
    )
    return transformCreditMemo(res.invoice)
  }
}
