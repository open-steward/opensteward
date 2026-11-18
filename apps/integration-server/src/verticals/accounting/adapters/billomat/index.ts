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
import { BillomatClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type BillomatInvoice } from './transform/invoice'
import { transformBill, type BillomatBill } from './transform/bill'
import { transformContact, type BillomatContact } from './transform/contact'
import { transformAccount, type BillomatAccount } from './transform/account'
import { transformJournal, type BillomatJournal } from './transform/journal'
import { transformOrganization, type BillomatOrganization } from './transform/organization'
import { transformExpense, type BillomatExpense } from './transform/expense'
import { transformTaxRate, type BillomatTaxRate } from './transform/taxrate'
import { transformTransaction, type BillomatTransaction } from './transform/transaction'
import { transformCreditMemo, type BillomatCreditMemo } from './transform/creditmemo'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class BillomatAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'billomat'
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
    const client = new BillomatClient(credentials)
    const res = await client.get<{ myself: BillomatOrganization }>('myself')
    return transformOrganization(res.myself)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new BillomatClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ invoices: { invoice: BillomatInvoice[] } }>('invoices', {
      page,
      per_page: limit,
    })
    const items = res.invoices?.invoice ?? []
    return items.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new BillomatClient(credentials)
    const res = await client.get<{ invoice: BillomatInvoice }>(`invoices/${id}`)
    return transformInvoice(res.invoice)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new BillomatClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ incomings: { incoming: BillomatBill[] } }>('incomings', {
      page,
      per_page: limit,
    })
    const items = res.incomings?.incoming ?? []
    return items.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new BillomatClient(credentials)
    const res = await client.get<{ incoming: BillomatBill }>(`incomings/${id}`)
    return transformBill(res.incoming)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new BillomatClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ clients: { client: BillomatContact[] } }>('clients', {
      page,
      per_page: limit,
    })
    const items = res.clients?.client ?? []
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new BillomatClient(credentials)
    const res = await client.get<{ client: BillomatContact }>(`clients/${id}`)
    return transformContact(res.client)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new BillomatClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ accounts: { account: BillomatAccount[] } }>('accounts', {
      page,
      per_page: limit,
    })
    const items = res.accounts?.account ?? []
    return items.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new BillomatClient(credentials)
    const res = await client.get<{ account: BillomatAccount }>(`accounts/${id}`)
    return transformAccount(res.account)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new BillomatClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ articles: { article: BillomatJournal[] } }>('articles', {
      page,
      per_page: limit,
    })
    const items = res.articles?.article ?? []
    return items.map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new BillomatClient(credentials)
    const res = await client.get<{ article: BillomatJournal }>(`articles/${id}`)
    return transformJournal(res.article)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new BillomatClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ payments: { payment: BillomatTransaction[] } }>('payments', {
      page,
      per_page: limit,
    })
    const items = res.payments?.payment ?? []
    return items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new BillomatClient(credentials)
    const res = await client.get<{ payment: BillomatTransaction }>(`payments/${id}`)
    return transformTransaction(res.payment)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new BillomatClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ taxes: { tax: BillomatTaxRate[] } }>('taxes', {
      page,
      per_page: limit,
    })
    const items = res.taxes?.tax ?? []
    return items.map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new BillomatClient(credentials)
    const res = await client.get<{ tax: BillomatTaxRate }>(`taxes/${id}`)
    return transformTaxRate(res.tax)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new BillomatClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ incomings: { incoming: BillomatExpense[] } }>('incomings', {
      page,
      per_page: limit,
    })
    const items = res.incomings?.incoming ?? []
    return items.map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new BillomatClient(credentials)
    const res = await client.get<{ incoming: BillomatExpense }>(`incomings/${id}`)
    return transformExpense(res.incoming)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new BillomatClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ 'credit-notes': { 'credit-note': BillomatCreditMemo[] } }>(
      'credit-notes',
      { page, per_page: limit },
    )
    const items = res['credit-notes']?.['credit-note'] ?? []
    return items.map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new BillomatClient(credentials)
    const res = await client.get<{ 'credit-note': BillomatCreditMemo }>(`credit-notes/${id}`)
    return transformCreditMemo(res['credit-note'])
  }
}
