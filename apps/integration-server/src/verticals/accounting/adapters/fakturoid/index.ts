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
import { FakturoidClient } from './client'

import { transformInvoice, type FakturoidInvoice } from './transform/invoice'
import { transformBill, type FakturoidBill } from './transform/bill'
import { transformContact, type FakturoidContact } from './transform/contact'
import { transformAccount, type FakturoidAccount } from './transform/account'
import { transformJournal, type FakturoidJournal } from './transform/journal'
import { transformOrganization, type FakturoidOrganization } from './transform/organization'
import { transformExpense, type FakturoidExpense } from './transform/expense'
import { transformTaxRate, type FakturoidTaxRate } from './transform/taxrate'
import { transformTransaction, type FakturoidTransaction } from './transform/transaction'
import { transformCreditMemo, type FakturoidCreditMemo } from './transform/creditmemo'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class FakturoidAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'fakturoid'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: {
    clientId: string
    clientSecret: string
    redirectUri: string
    scopes: string[]
  }) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  private slug(credentials: Credentials): string {
    return credentials.tenantId ?? ''
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
    const client = new FakturoidClient(credentials)
    const res = await client.get<FakturoidOrganization>(
      `accounts/${this.slug(credentials)}.json`,
    )
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new FakturoidClient(credentials)
    const page = params.page ?? 1
    const res = await client.get<FakturoidInvoice[]>(
      `accounts/${this.slug(credentials)}/invoices.json`,
      { page },
    )
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new FakturoidClient(credentials)
    const res = await client.get<FakturoidInvoice>(
      `accounts/${this.slug(credentials)}/invoices/${id}.json`,
    )
    return transformInvoice(res)
  }

  // --- Bills (Expenses in Fakturoid) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new FakturoidClient(credentials)
    const page = params.page ?? 1
    const res = await client.get<FakturoidBill[]>(
      `accounts/${this.slug(credentials)}/expenses.json`,
      { page },
    )
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new FakturoidClient(credentials)
    const res = await client.get<FakturoidBill>(
      `accounts/${this.slug(credentials)}/expenses/${id}.json`,
    )
    return transformBill(res)
  }

  // --- Contacts (Subjects in Fakturoid) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new FakturoidClient(credentials)
    const page = params.page ?? 1
    const res = await client.get<FakturoidContact[]>(
      `accounts/${this.slug(credentials)}/subjects.json`,
      { page },
    )
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new FakturoidClient(credentials)
    const res = await client.get<FakturoidContact>(
      `accounts/${this.slug(credentials)}/subjects/${id}.json`,
    )
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new FakturoidClient(credentials)
    const page = params.page ?? 1
    const res = await client.get<FakturoidAccount[]>(
      `accounts/${this.slug(credentials)}/accounts.json`,
      { page },
    )
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new FakturoidClient(credentials)
    const res = await client.get<FakturoidAccount>(
      `accounts/${this.slug(credentials)}/accounts/${id}.json`,
    )
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new FakturoidClient(credentials)
    const page = params.page ?? 1
    const res = await client.get<FakturoidJournal[]>(
      `accounts/${this.slug(credentials)}/journal_entries.json`,
      { page },
    )
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new FakturoidClient(credentials)
    const res = await client.get<FakturoidJournal>(
      `accounts/${this.slug(credentials)}/journal_entries/${id}.json`,
    )
    return transformJournal(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new FakturoidClient(credentials)
    const page = params.page ?? 1
    const res = await client.get<FakturoidTaxRate[]>(
      `accounts/${this.slug(credentials)}/tax_rates.json`,
      { page },
    )
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new FakturoidClient(credentials)
    const res = await client.get<FakturoidTaxRate>(
      `accounts/${this.slug(credentials)}/tax_rates/${id}.json`,
    )
    return transformTaxRate(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new FakturoidClient(credentials)
    const page = params.page ?? 1
    const res = await client.get<FakturoidTransaction[]>(
      `accounts/${this.slug(credentials)}/bank_entries.json`,
      { page },
    )
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new FakturoidClient(credentials)
    const res = await client.get<FakturoidTransaction>(
      `accounts/${this.slug(credentials)}/bank_entries/${id}.json`,
    )
    return transformTransaction(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new FakturoidClient(credentials)
    const page = params.page ?? 1
    const res = await client.get<FakturoidExpense[]>(
      `accounts/${this.slug(credentials)}/expenses.json`,
      { page },
    )
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new FakturoidClient(credentials)
    const res = await client.get<FakturoidExpense>(
      `accounts/${this.slug(credentials)}/expenses/${id}.json`,
    )
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new FakturoidClient(credentials)
    const page = params.page ?? 1
    const res = await client.get<FakturoidCreditMemo[]>(
      `accounts/${this.slug(credentials)}/invoices.json`,
      { page, type: 'credit_note' },
    )
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new FakturoidClient(credentials)
    const res = await client.get<FakturoidCreditMemo>(
      `accounts/${this.slug(credentials)}/invoices/${id}.json`,
    )
    return transformCreditMemo(res)
  }
}
