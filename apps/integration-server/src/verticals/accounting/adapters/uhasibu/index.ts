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
import { UhasibuClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type UhasibuInvoice } from './transform/invoice'
import { transformBill, type UhasibuBill } from './transform/bill'
import { transformContact, type UhasibuContact } from './transform/contact'
import { transformAccount, type UhasibuAccount } from './transform/account'
import { transformJournal, type UhasibuJournal } from './transform/journal'
import { transformOrganization, type UhasibuBusiness } from './transform/organization'
import { transformTransaction, type UhasibuTransaction } from './transform/transaction'
import { transformTaxRate, type UhasibuTaxRate } from './transform/taxrate'
import { transformExpense, type UhasibuExpense } from './transform/expense'
import { transformCreditMemo, type UhasibuCreditNote } from './transform/creditmemo'

interface UhasibuAdapterConfig {
  apiKey: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class UhasibuAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'uhasibu'
  readonly version = '0.1.0'

  private readonly apiKey: string

  constructor(config: UhasibuAdapterConfig) {
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
    const client = new UhasibuClient(this.credentialsFromConfig())
    const raw = await client.get<UhasibuBusiness>('business')
    return transformOrganization(raw)
  }

  // --- Invoices ---

  async listInvoices(_credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new UhasibuClient(this.credentialsFromConfig())
    const res = await client.get<{ data: UhasibuInvoice[] }>('invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(_credentials: Credentials, id: string): Promise<Invoice> {
    const client = new UhasibuClient(this.credentialsFromConfig())
    const raw = await client.get<UhasibuInvoice>(`invoices/${id}`)
    return transformInvoice(raw)
  }

  // --- Bills ---

  async listBills(_credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new UhasibuClient(this.credentialsFromConfig())
    const res = await client.get<{ data: UhasibuBill[] }>('bills', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(_credentials: Credentials, id: string): Promise<Bill> {
    const client = new UhasibuClient(this.credentialsFromConfig())
    const raw = await client.get<UhasibuBill>(`bills/${id}`)
    return transformBill(raw)
  }

  // --- Contacts ---

  async listContacts(_credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new UhasibuClient(this.credentialsFromConfig())
    const res = await client.get<{ data: UhasibuContact[] }>('contacts', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(_credentials: Credentials, id: string): Promise<Contact> {
    const client = new UhasibuClient(this.credentialsFromConfig())
    const raw = await client.get<UhasibuContact>(`contacts/${id}`)
    return transformContact(raw)
  }

  // --- Accounts ---

  async listAccounts(_credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new UhasibuClient(this.credentialsFromConfig())
    const res = await client.get<{ data: UhasibuAccount[] }>('accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(_credentials: Credentials, id: string): Promise<Account> {
    const client = new UhasibuClient(this.credentialsFromConfig())
    const raw = await client.get<UhasibuAccount>(`accounts/${id}`)
    return transformAccount(raw)
  }

  // --- Journals ---

  async listJournals(_credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new UhasibuClient(this.credentialsFromConfig())
    const res = await client.get<{ data: UhasibuJournal[] }>('journals', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(_credentials: Credentials, id: string): Promise<Journal> {
    const client = new UhasibuClient(this.credentialsFromConfig())
    const raw = await client.get<UhasibuJournal>(`journals/${id}`)
    return transformJournal(raw)
  }

  // --- Transactions ---

  async listTransactions(_credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new UhasibuClient(this.credentialsFromConfig())
    const res = await client.get<{ data: UhasibuTransaction[] }>('transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(_credentials: Credentials, id: string): Promise<Transaction> {
    const client = new UhasibuClient(this.credentialsFromConfig())
    const raw = await client.get<UhasibuTransaction>(`transactions/${id}`)
    return transformTransaction(raw)
  }

  // --- Tax Rates ---

  async listTaxRates(_credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new UhasibuClient(this.credentialsFromConfig())
    const res = await client.get<{ data: UhasibuTaxRate[] }>('tax-rates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  // --- Expenses ---

  async listExpenses(_credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new UhasibuClient(this.credentialsFromConfig())
    const res = await client.get<{ data: UhasibuExpense[] }>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(_credentials: Credentials, id: string): Promise<Expense> {
    const client = new UhasibuClient(this.credentialsFromConfig())
    const raw = await client.get<UhasibuExpense>(`expenses/${id}`)
    return transformExpense(raw)
  }

  // --- Credit Memos ---

  async listCreditMemos(_credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new UhasibuClient(this.credentialsFromConfig())
    const res = await client.get<{ data: UhasibuCreditNote[] }>('credit-notes', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(_credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new UhasibuClient(this.credentialsFromConfig())
    const raw = await client.get<UhasibuCreditNote>(`credit-notes/${id}`)
    return transformCreditMemo(raw)
  }
}
