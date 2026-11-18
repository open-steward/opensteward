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
import { SmaccClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type SmaccInvoice } from './transform/invoice'
import { transformBill, type SmaccBill } from './transform/bill'
import { transformContact, type SmaccContact } from './transform/contact'
import { transformAccount, type SmaccAccount } from './transform/account'
import { transformJournal, type SmaccJournal } from './transform/journal'
import { transformOrganization, type SmaccCompany } from './transform/organization'
import { transformTransaction, type SmaccTransaction } from './transform/transaction'
import { transformTaxRate, type SmaccTaxRate } from './transform/taxrate'
import { transformExpense, type SmaccExpense } from './transform/expense'
import { transformCreditMemo, type SmaccCreditNote } from './transform/creditmemo'

interface SmaccAdapterConfig {
  apiKey: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SmaccAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'smacc'
  readonly version = '0.1.0'

  private readonly apiKey: string

  constructor(config: SmaccAdapterConfig) {
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
    const client = new SmaccClient(this.credentialsFromConfig())
    const raw = await client.get<SmaccCompany>('company')
    return transformOrganization(raw)
  }

  // --- Invoices ---

  async listInvoices(_credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new SmaccClient(this.credentialsFromConfig())
    const res = await client.get<{ data: SmaccInvoice[] }>('invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(_credentials: Credentials, id: string): Promise<Invoice> {
    const client = new SmaccClient(this.credentialsFromConfig())
    const raw = await client.get<SmaccInvoice>(`invoices/${id}`)
    return transformInvoice(raw)
  }

  // --- Bills ---

  async listBills(_credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new SmaccClient(this.credentialsFromConfig())
    const res = await client.get<{ data: SmaccBill[] }>('bills', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(_credentials: Credentials, id: string): Promise<Bill> {
    const client = new SmaccClient(this.credentialsFromConfig())
    const raw = await client.get<SmaccBill>(`bills/${id}`)
    return transformBill(raw)
  }

  // --- Contacts ---

  async listContacts(_credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new SmaccClient(this.credentialsFromConfig())
    const res = await client.get<{ data: SmaccContact[] }>('contacts', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(_credentials: Credentials, id: string): Promise<Contact> {
    const client = new SmaccClient(this.credentialsFromConfig())
    const raw = await client.get<SmaccContact>(`contacts/${id}`)
    return transformContact(raw)
  }

  // --- Accounts ---

  async listAccounts(_credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new SmaccClient(this.credentialsFromConfig())
    const res = await client.get<{ data: SmaccAccount[] }>('accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(_credentials: Credentials, id: string): Promise<Account> {
    const client = new SmaccClient(this.credentialsFromConfig())
    const raw = await client.get<SmaccAccount>(`accounts/${id}`)
    return transformAccount(raw)
  }

  // --- Journals ---

  async listJournals(_credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new SmaccClient(this.credentialsFromConfig())
    const res = await client.get<{ data: SmaccJournal[] }>('journals', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(_credentials: Credentials, id: string): Promise<Journal> {
    const client = new SmaccClient(this.credentialsFromConfig())
    const raw = await client.get<SmaccJournal>(`journals/${id}`)
    return transformJournal(raw)
  }

  // --- Transactions ---

  async listTransactions(_credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new SmaccClient(this.credentialsFromConfig())
    const res = await client.get<{ data: SmaccTransaction[] }>('transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(_credentials: Credentials, id: string): Promise<Transaction> {
    const client = new SmaccClient(this.credentialsFromConfig())
    const raw = await client.get<SmaccTransaction>(`transactions/${id}`)
    return transformTransaction(raw)
  }

  // --- Tax Rates ---

  async listTaxRates(_credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new SmaccClient(this.credentialsFromConfig())
    const res = await client.get<{ data: SmaccTaxRate[] }>('tax-rates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  // --- Expenses ---

  async listExpenses(_credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new SmaccClient(this.credentialsFromConfig())
    const res = await client.get<{ data: SmaccExpense[] }>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(_credentials: Credentials, id: string): Promise<Expense> {
    const client = new SmaccClient(this.credentialsFromConfig())
    const raw = await client.get<SmaccExpense>(`expenses/${id}`)
    return transformExpense(raw)
  }

  // --- Credit Memos ---

  async listCreditMemos(_credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new SmaccClient(this.credentialsFromConfig())
    const res = await client.get<{ data: SmaccCreditNote[] }>('credit-notes', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(_credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new SmaccClient(this.credentialsFromConfig())
    const raw = await client.get<SmaccCreditNote>(`credit-notes/${id}`)
    return transformCreditMemo(raw)
  }
}
