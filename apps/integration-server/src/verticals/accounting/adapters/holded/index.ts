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
  refreshCredentials as doRefreshCredentials,
} from './auth'
import { HoldedClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type HoldedInvoice } from './transform/invoice'
import { transformBill, type HoldedBill } from './transform/bill'
import { transformContact, type HoldedContact } from './transform/contact'
import { transformAccount, type HoldedAccount } from './transform/account'
import { transformJournal, type HoldedJournal } from './transform/journal'
import { transformOrganization, type HoldedOrganization } from './transform/organization'
import { transformExpense, type HoldedExpense } from './transform/expense'
import { transformTaxRate, type HoldedTaxRate } from './transform/taxrate'
import { transformTransaction, type HoldedTransaction } from './transform/transaction'
import { transformCreditMemo, type HoldedCreditMemo } from './transform/creditmemo'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class HoldedAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'holded'
  readonly version = '0.1.0'

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new HoldedClient(credentials)
    const res = await client.get<HoldedOrganization>('invoicing/v1/settings')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new HoldedClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<HoldedInvoice[]>('invoicing/v1/documents/invoice', {
      page,
      limit,
    })
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new HoldedClient(credentials)
    const res = await client.get<HoldedInvoice>(`invoicing/v1/documents/invoice/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new HoldedClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<HoldedBill[]>('invoicing/v1/documents/purchase', {
      page,
      limit,
    })
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new HoldedClient(credentials)
    const res = await client.get<HoldedBill>(`invoicing/v1/documents/purchase/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new HoldedClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<HoldedContact[]>('invoicing/v1/contacts', {
      page,
      limit,
    })
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new HoldedClient(credentials)
    const res = await client.get<HoldedContact>(`invoicing/v1/contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new HoldedClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<HoldedAccount[]>('accounting/v1/accounts', {
      page,
      limit,
    })
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new HoldedClient(credentials)
    const res = await client.get<HoldedAccount>(`accounting/v1/accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new HoldedClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<HoldedJournal[]>('accounting/v1/journal', {
      page,
      limit,
    })
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new HoldedClient(credentials)
    const res = await client.get<HoldedJournal>(`accounting/v1/journal/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new HoldedClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<HoldedTransaction[]>('treasury/v1/transactions', {
      page,
      limit,
    })
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new HoldedClient(credentials)
    const res = await client.get<HoldedTransaction>(`treasury/v1/transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new HoldedClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<HoldedTaxRate[]>('invoicing/v1/taxes', {
      page,
      limit,
    })
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new HoldedClient(credentials)
    const res = await client.get<HoldedTaxRate>(`invoicing/v1/taxes/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new HoldedClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<HoldedExpense[]>('invoicing/v1/documents/expense', {
      page,
      limit,
    })
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new HoldedClient(credentials)
    const res = await client.get<HoldedExpense>(`invoicing/v1/documents/expense/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new HoldedClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<HoldedCreditMemo[]>('invoicing/v1/documents/creditnote', {
      page,
      limit,
    })
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new HoldedClient(credentials)
    const res = await client.get<HoldedCreditMemo>(`invoicing/v1/documents/creditnote/${id}`)
    return transformCreditMemo(res)
  }
}
