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
import { ProfitBooksClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type ProfitBooksInvoice } from './transform/invoice'
import { transformBill, type ProfitBooksBill } from './transform/bill'
import { transformContact, type ProfitBooksContact } from './transform/contact'
import { transformAccount, type ProfitBooksAccount } from './transform/account'
import { transformJournal, type ProfitBooksJournal } from './transform/journal'
import { transformOrganization, type ProfitBooksOrganization } from './transform/organization'
import { transformExpense, type ProfitBooksExpense } from './transform/expense'
import { transformTaxRate, type ProfitBooksTaxRate } from './transform/taxrate'
import { transformTransaction, type ProfitBooksTransaction } from './transform/transaction'
import { transformCreditMemo, type ProfitBooksCreditMemo } from './transform/creditmemo'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ProfitBooksAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'profitbooks'
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
    const client = new ProfitBooksClient(credentials)
    const res = await client.get<ProfitBooksOrganization>('organization')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new ProfitBooksClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<ProfitBooksInvoice[]>('invoices', {
      page,
      limit,
    })
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new ProfitBooksClient(credentials)
    const res = await client.get<ProfitBooksInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new ProfitBooksClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<ProfitBooksBill[]>('bills', {
      page,
      limit,
    })
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new ProfitBooksClient(credentials)
    const res = await client.get<ProfitBooksBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new ProfitBooksClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<ProfitBooksContact[]>('contacts', {
      page,
      limit,
    })
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new ProfitBooksClient(credentials)
    const res = await client.get<ProfitBooksContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new ProfitBooksClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<ProfitBooksAccount[]>('accounts', {
      page,
      limit,
    })
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new ProfitBooksClient(credentials)
    const res = await client.get<ProfitBooksAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new ProfitBooksClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<ProfitBooksJournal[]>('journal-entries', {
      page,
      limit,
    })
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new ProfitBooksClient(credentials)
    const res = await client.get<ProfitBooksJournal>(`journal-entries/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new ProfitBooksClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<ProfitBooksTransaction[]>('transactions', {
      page,
      limit,
    })
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new ProfitBooksClient(credentials)
    const res = await client.get<ProfitBooksTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new ProfitBooksClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<ProfitBooksTaxRate[]>('tax-rates', {
      page,
      limit,
    })
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new ProfitBooksClient(credentials)
    const res = await client.get<ProfitBooksTaxRate>(`tax-rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new ProfitBooksClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<ProfitBooksExpense[]>('expenses', {
      page,
      limit,
    })
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new ProfitBooksClient(credentials)
    const res = await client.get<ProfitBooksExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new ProfitBooksClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<ProfitBooksCreditMemo[]>('credit-notes', {
      page,
      limit,
    })
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new ProfitBooksClient(credentials)
    const res = await client.get<ProfitBooksCreditMemo>(`credit-notes/${id}`)
    return transformCreditMemo(res)
  }
}
