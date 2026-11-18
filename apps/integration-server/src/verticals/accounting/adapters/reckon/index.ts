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
import { ReckonClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type ReckonInvoice } from './transform/invoice'
import { transformBill, type ReckonBill } from './transform/bill'
import { transformContact, type ReckonContact } from './transform/contact'
import { transformAccount, type ReckonAccount } from './transform/account'
import { transformJournal, type ReckonJournal } from './transform/journal'
import { transformOrganization, type ReckonBook } from './transform/organization'
import { transformTransaction, type ReckonTransaction } from './transform/transaction'
import { transformTaxRate, type ReckonTaxCode } from './transform/taxrate'
import { transformExpense, type ReckonExpense } from './transform/expense'
import { transformCreditMemo, type ReckonCreditNote } from './transform/creditmemo'
import { transformOrder, type ReckonSalesOrder } from './transform/order'
import { transformSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type ReckonPurchaseOrder } from './transform/purchaseorder'

interface ReckonAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

interface PagedResponse<T> {
  items: T[]
  totalCount?: number
  [key: string]: unknown
}

export class ReckonAdapter implements AccountingAdapter {
  readonly platform = 'reckon'
  readonly version = '0.1.0'

  /** paginationParams caps `pageSize` at 50; the router and the sync worker ask for no more. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ReckonAdapterConfig) {
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
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
      ...(params.updatedAfter && {
        updatedAfter: params.updatedAfter.toISOString(),
      }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new ReckonClient(credentials)
    const res = await client.get<ReckonBook>('books')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new ReckonClient(credentials)
    const res = await client.get<PagedResponse<ReckonInvoice>>(
      'invoices',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new ReckonClient(credentials)
    const res = await client.get<ReckonInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new ReckonClient(credentials)
    const res = await client.get<PagedResponse<ReckonBill>>(
      'bills',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new ReckonClient(credentials)
    const res = await client.get<ReckonBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new ReckonClient(credentials)
    const res = await client.get<PagedResponse<ReckonContact>>(
      'contacts',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new ReckonClient(credentials)
    const res = await client.get<ReckonContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new ReckonClient(credentials)
    const res = await client.get<PagedResponse<ReckonAccount>>(
      'accounts',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new ReckonClient(credentials)
    const res = await client.get<ReckonAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new ReckonClient(credentials)
    const res = await client.get<PagedResponse<ReckonJournal>>(
      'journals',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new ReckonClient(credentials)
    const res = await client.get<ReckonJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new ReckonClient(credentials)
    const res = await client.get<PagedResponse<ReckonTransaction>>(
      'transactions',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new ReckonClient(credentials)
    const res = await client.get<ReckonTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new ReckonClient(credentials)
    const res = await client.get<PagedResponse<ReckonTaxCode>>(
      'taxCodes',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new ReckonClient(credentials)
    const res = await client.get<ReckonTaxCode>(`taxCodes/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new ReckonClient(credentials)
    const res = await client.get<PagedResponse<ReckonExpense>>(
      'expenses',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new ReckonClient(credentials)
    const res = await client.get<ReckonExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new ReckonClient(credentials)
    const res = await client.get<PagedResponse<ReckonCreditNote>>(
      'creditNotes',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new ReckonClient(credentials)
    const res = await client.get<ReckonCreditNote>(`creditNotes/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ReckonClient(credentials)
    const res = await client.get<PagedResponse<ReckonSalesOrder>>(
      'salesOrders',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ReckonClient(credentials)
    const res = await client.get<ReckonSalesOrder>(`salesOrders/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new ReckonClient(credentials)
    const res = await client.get<PagedResponse<ReckonSalesOrder>>(
      'salesOrders',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new ReckonClient(credentials)
    const res = await client.get<ReckonSalesOrder>(`salesOrders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new ReckonClient(credentials)
    const res = await client.get<PagedResponse<ReckonPurchaseOrder>>(
      'purchaseOrders',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new ReckonClient(credentials)
    const res = await client.get<ReckonPurchaseOrder>(`purchaseOrders/${id}`)
    return transformPurchaseOrder(res)
  }
}
