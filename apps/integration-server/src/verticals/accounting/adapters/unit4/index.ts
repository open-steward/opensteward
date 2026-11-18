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
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { Unit4Client } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type Unit4Invoice } from './transform/invoice'
import { transformBill, type Unit4Bill } from './transform/bill'
import { transformContact, type Unit4Contact } from './transform/contact'
import { transformAccount, type Unit4Account } from './transform/account'
import { transformJournal, type Unit4Journal } from './transform/journal'
import { transformOrganization, type Unit4Organization } from './transform/organization'
import { transformTransaction, type Unit4Transaction } from './transform/transaction'
import { transformTaxRate, type Unit4TaxRate } from './transform/taxrate'
import { transformExpense, type Unit4Expense } from './transform/expense'
import { transformCreditMemo, type Unit4CreditMemo } from './transform/creditmemo'
import { transformOrder, type Unit4Order } from './transform/order'
import { transformSalesOrder, type Unit4SalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type Unit4PurchaseOrder } from './transform/purchaseorder'

interface Unit4AdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

interface Unit4PagedResponse<T> {
  value: T[]
  nextLink?: string
}

export class Unit4Adapter implements AccountingAdapter {
  readonly platform = 'unit4'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: Unit4AdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, (overrideScopes ?? this.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      $top: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      $skip: ((params.page ?? 1) - 1) * Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      ...(params.updatedAfter && {
        $filter: `modifiedAt ge ${params.updatedAfter.toISOString()}`,
      }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4Organization>('companies/current')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4PagedResponse<Unit4Invoice>>(
      'invoices',
      this.paginationParams(params),
    )
    return (res.value ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4Invoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills (Purchase Invoices) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4PagedResponse<Unit4Bill>>(
      'purchaseInvoices',
      this.paginationParams(params),
    )
    return (res.value ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4Bill>(`purchaseInvoices/${id}`)
    return transformBill(res)
  }

  // --- Contacts (Suppliers / Debtors) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new Unit4Client(credentials)
    const [suppRes, debtRes] = await Promise.all([
      client.get<Unit4PagedResponse<Unit4Contact>>('suppliers', this.paginationParams(params)),
      client.get<Unit4PagedResponse<Unit4Contact>>('debtors', this.paginationParams(params)),
    ])
    const suppliers = (suppRes.value ?? []).map(transformContact)
    const debtors = (debtRes.value ?? []).map(transformContact)
    return [...suppliers, ...debtors]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new Unit4Client(credentials)
    if (id.startsWith('supp_')) {
      const num = id.slice(5)
      const res = await client.get<Unit4Contact>(`suppliers/${num}`)
      return transformContact(res)
    }
    if (id.startsWith('debt_')) {
      const num = id.slice(5)
      const res = await client.get<Unit4Contact>(`debtors/${num}`)
      return transformContact(res)
    }
    throw new Error(`Invalid contact id format: ${id}. Expected supp_<n> or debt_<n>`)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4PagedResponse<Unit4Account>>(
      'accounts',
      this.paginationParams(params),
    )
    return (res.value ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4Account>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4PagedResponse<Unit4Journal>>(
      'journalEntries',
      this.paginationParams(params),
    )
    return (res.value ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4Journal>(`journalEntries/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4PagedResponse<Unit4Transaction>>(
      'transactions',
      this.paginationParams(params),
    )
    return (res.value ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4Transaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4PagedResponse<Unit4TaxRate>>(
      'taxRates',
      this.paginationParams(params),
    )
    return (res.value ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4TaxRate>(`taxRates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4PagedResponse<Unit4Expense>>(
      'expenses',
      this.paginationParams(params),
    )
    return (res.value ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4Expense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4PagedResponse<Unit4CreditMemo>>(
      'creditMemos',
      this.paginationParams(params),
    )
    return (res.value ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4CreditMemo>(`creditMemos/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4PagedResponse<Unit4Order>>(
      'orders',
      this.paginationParams(params),
    )
    return (res.value ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4Order>(`orders/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4PagedResponse<Unit4SalesOrder>>(
      'salesOrders',
      this.paginationParams(params),
    )
    return (res.value ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4SalesOrder>(`salesOrders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4PagedResponse<Unit4PurchaseOrder>>(
      'purchaseOrders',
      this.paginationParams(params),
    )
    return (res.value ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new Unit4Client(credentials)
    const res = await client.get<Unit4PurchaseOrder>(`purchaseOrders/${id}`)
    return transformPurchaseOrder(res)
  }
}
