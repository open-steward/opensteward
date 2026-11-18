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
import type { Order } from '../../schema/order'
import type { Organization } from '../../schema/organization'

import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefreshCredentials,
} from './auth'
import { EconomicClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type EconomicInvoice } from './transform/invoice'
import { transformBill, type EconomicSupplierInvoice } from './transform/bill'
import {
  transformCustomer,
  transformSupplier,
  type EconomicCustomer,
  type EconomicSupplier,
} from './transform/contact'
import { transformAccount, type EconomicAccount } from './transform/account'
import { transformJournal, type EconomicJournalEntry } from './transform/journal'
import { transformOrganization, type EconomicSelf } from './transform/organization'
import { transformExpense, type EconomicExpense } from './transform/expense'
import { transformTaxRate, type EconomicVatAccount } from './transform/taxrate'
import { transformTransaction, type EconomicEntry } from './transform/transaction'
import { transformCreditMemo, type EconomicCreditNote } from './transform/creditmemo'
import { transformOrder, type EconomicOrder } from './transform/order'

interface EconomicCollection<T> {
  collection: T[]
  pagination: {
    skipPages: number
    pageSize: number
    results: number
    resultsWithoutFilter: number
  }
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class EconomicAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'economic'
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
    const client = new EconomicClient(credentials)
    const res = await client.get<EconomicSelf>('self')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new EconomicClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skipPages = (params.page ?? 1) - 1
    const res = await client.get<EconomicCollection<EconomicInvoice>>(
      'invoices/booked',
      { pageSize, skipPages },
    )
    return (res.collection ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new EconomicClient(credentials)
    const res = await client.get<EconomicInvoice>(`invoices/booked/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new EconomicClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skipPages = (params.page ?? 1) - 1
    const res = await client.get<EconomicCollection<EconomicSupplierInvoice>>(
      'supplier-invoices/booked',
      { pageSize, skipPages },
    )
    return (res.collection ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new EconomicClient(credentials)
    const res = await client.get<EconomicSupplierInvoice>(`supplier-invoices/booked/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new EconomicClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skipPages = (params.page ?? 1) - 1
    const [custRes, suppRes] = await Promise.all([
      client.get<EconomicCollection<EconomicCustomer>>('customers', { pageSize, skipPages }),
      client.get<EconomicCollection<EconomicSupplier>>('suppliers', { pageSize, skipPages }),
    ])
    const customers = (custRes.collection ?? []).map(transformCustomer)
    const suppliers = (suppRes.collection ?? []).map(transformSupplier)
    return [...customers, ...suppliers]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new EconomicClient(credentials)
    if (id.startsWith('supp_')) {
      const suppId = id.slice(5)
      const res = await client.get<EconomicSupplier>(`suppliers/${suppId}`)
      return transformSupplier(res)
    }
    const custId = id.startsWith('cust_') ? id.slice(5) : id
    const res = await client.get<EconomicCustomer>(`customers/${custId}`)
    return transformCustomer(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new EconomicClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skipPages = (params.page ?? 1) - 1
    const res = await client.get<EconomicCollection<EconomicAccount>>(
      'accounts',
      { pageSize, skipPages },
    )
    return (res.collection ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new EconomicClient(credentials)
    const res = await client.get<EconomicAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new EconomicClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skipPages = (params.page ?? 1) - 1
    const res = await client.get<EconomicCollection<EconomicJournalEntry>>(
      'journals',
      { pageSize, skipPages },
    )
    return (res.collection ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new EconomicClient(credentials)
    const res = await client.get<EconomicJournalEntry>(`journals/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new EconomicClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skipPages = (params.page ?? 1) - 1
    const res = await client.get<EconomicCollection<EconomicEntry>>(
      'entries',
      { pageSize, skipPages },
    )
    return (res.collection ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new EconomicClient(credentials)
    const res = await client.get<EconomicEntry>(`entries/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new EconomicClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skipPages = (params.page ?? 1) - 1
    const res = await client.get<EconomicCollection<EconomicVatAccount>>(
      'vat-accounts',
      { pageSize, skipPages },
    )
    return (res.collection ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new EconomicClient(credentials)
    const res = await client.get<EconomicVatAccount>(`vat-accounts/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new EconomicClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skipPages = (params.page ?? 1) - 1
    const res = await client.get<EconomicCollection<EconomicExpense>>(
      'entries',
      { pageSize, skipPages, filter: 'amount$lt:0' },
    )
    return (res.collection ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new EconomicClient(credentials)
    const res = await client.get<EconomicExpense>(`entries/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new EconomicClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skipPages = (params.page ?? 1) - 1
    const res = await client.get<EconomicCollection<EconomicCreditNote>>(
      'invoices/booked',
      { pageSize, skipPages, filter: 'grossAmount$lt:0' },
    )
    return (res.collection ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new EconomicClient(credentials)
    const res = await client.get<EconomicCreditNote>(`invoices/booked/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new EconomicClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skipPages = (params.page ?? 1) - 1
    const res = await client.get<EconomicCollection<EconomicOrder>>(
      'orders',
      { pageSize, skipPages },
    )
    return (res.collection ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new EconomicClient(credentials)
    const res = await client.get<EconomicOrder>(`orders/${id}`)
    return transformOrder(res)
  }
}
