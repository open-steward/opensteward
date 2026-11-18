import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Organization } from '../../schema/organization'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'

import { buildAuthUrl, exchangeCode, refreshCredentials } from './auth'
import { MazumaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type MazumaInvoice } from './transform/invoice'
import { transformBill, type MazumaBill } from './transform/bill'
import { transformContact, type MazumaContact } from './transform/contact'
import { transformAccount, type MazumaAccount } from './transform/account'
import { transformJournal, type MazumaJournal } from './transform/journal'
import { transformOrganization, type MazumaBusiness } from './transform/organization'
import { transformTransaction, type MazumaTransaction } from './transform/transaction'
import { transformTaxRate, type MazumaTaxRate } from './transform/taxrate'
import { transformExpense, type MazumaExpense } from './transform/expense'
import { transformCreditMemo, type MazumaCreditNote } from './transform/creditmemo'

interface MazumaAdapterConfig {
  apiKey: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class MazumaAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'mazuma'
  readonly version = '0.1.0'

  private readonly apiKey: string

  constructor(config: MazumaAdapterConfig) {
    this.apiKey = config.apiKey
  }

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  private credentialsFromConfig(): Credentials {
    return { accessToken: this.apiKey }
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  // --- Organization ---

  async getOrganization(_credentials: Credentials): Promise<Organization> {
    const client = new MazumaClient(this.credentialsFromConfig())
    const raw = await client.get<MazumaBusiness>('business')
    return transformOrganization(raw)
  }

  // --- Invoices ---

  async listInvoices(_credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new MazumaClient(this.credentialsFromConfig())
    const res = await client.get<{ data: MazumaInvoice[] }>('invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(_credentials: Credentials, id: string): Promise<Invoice> {
    const client = new MazumaClient(this.credentialsFromConfig())
    const raw = await client.get<MazumaInvoice>(`invoices/${id}`)
    return transformInvoice(raw)
  }

  // --- Bills ---

  async listBills(_credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new MazumaClient(this.credentialsFromConfig())
    const res = await client.get<{ data: MazumaBill[] }>('bills', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(_credentials: Credentials, id: string): Promise<Bill> {
    const client = new MazumaClient(this.credentialsFromConfig())
    const raw = await client.get<MazumaBill>(`bills/${id}`)
    return transformBill(raw)
  }

  // --- Contacts ---

  async listContacts(_credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new MazumaClient(this.credentialsFromConfig())
    const res = await client.get<{ data: MazumaContact[] }>('contacts', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(_credentials: Credentials, id: string): Promise<Contact> {
    const client = new MazumaClient(this.credentialsFromConfig())
    const raw = await client.get<MazumaContact>(`contacts/${id}`)
    return transformContact(raw)
  }

  // --- Accounts ---

  async listAccounts(_credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new MazumaClient(this.credentialsFromConfig())
    const res = await client.get<{ data: MazumaAccount[] }>('accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(_credentials: Credentials, id: string): Promise<Account> {
    const client = new MazumaClient(this.credentialsFromConfig())
    const raw = await client.get<MazumaAccount>(`accounts/${id}`)
    return transformAccount(raw)
  }

  // --- Journals ---

  async listJournals(_credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new MazumaClient(this.credentialsFromConfig())
    const res = await client.get<{ data: MazumaJournal[] }>('journals', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(_credentials: Credentials, id: string): Promise<Journal> {
    const client = new MazumaClient(this.credentialsFromConfig())
    const raw = await client.get<MazumaJournal>(`journals/${id}`)
    return transformJournal(raw)
  }

  // --- Transactions ---

  async listTransactions(_credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new MazumaClient(this.credentialsFromConfig())
    const res = await client.get<{ data: MazumaTransaction[] }>('transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(_credentials: Credentials, id: string): Promise<Transaction> {
    const client = new MazumaClient(this.credentialsFromConfig())
    const raw = await client.get<MazumaTransaction>(`transactions/${id}`)
    return transformTransaction(raw)
  }

  // --- Tax Rates ---

  async listTaxRates(_credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new MazumaClient(this.credentialsFromConfig())
    const res = await client.get<{ data: MazumaTaxRate[] }>('tax-rates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  // --- Expenses ---

  async listExpenses(_credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new MazumaClient(this.credentialsFromConfig())
    const res = await client.get<{ data: MazumaExpense[] }>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(_credentials: Credentials, id: string): Promise<Expense> {
    const client = new MazumaClient(this.credentialsFromConfig())
    const raw = await client.get<MazumaExpense>(`expenses/${id}`)
    return transformExpense(raw)
  }

  // --- Credit Memos ---

  async listCreditMemos(_credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new MazumaClient(this.credentialsFromConfig())
    const res = await client.get<{ data: MazumaCreditNote[] }>('credit-notes', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(_credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new MazumaClient(this.credentialsFromConfig())
    const raw = await client.get<MazumaCreditNote>(`credit-notes/${id}`)
    return transformCreditMemo(raw)
  }
}
