import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Organization } from '../../schema/organization'
import type { TaxRate } from '../../schema/taxrate'
import type { Transaction } from '../../schema/transaction'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'

import { buildAuthUrl, exchangeCode as doExchangeCode, refreshAccessToken } from './auth'
import { JalebiClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type JalebiOrder } from './transform/invoice'
import { transformBill, type JalebiPurchaseOrder } from './transform/bill'
import {
  transformCustomer,
  transformSupplier,
  type JalebiCustomer,
  type JalebiSupplier,
} from './transform/contact'
import { transformAccount, type JalebiItem } from './transform/account'
import { transformJournal, type JalebiJournal } from './transform/journal'
import { transformOrganization, type JalebiRestaurant } from './transform/organization'
import { transformTaxRate, type JalebiTaxRate } from './transform/taxrate'
import { transformTransaction, type JalebiPayment } from './transform/transaction'
import { transformExpense, type JalebiExpense } from './transform/expense'
import { transformCreditMemo, type JalebiRefund } from './transform/creditmemo'
import { transformOrder, type JalebiOrderForOrder } from './transform/order'
import { transformSalesOrder, type JalebiSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type JalebiPurchaseOrderForPO } from './transform/purchaseorder'

export interface JalebiAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class JalebiAdapter implements AccountingAdapter {
  readonly platform = 'jalebi'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: JalebiAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, (overrideScopes ?? this.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new JalebiClient(credentials)
    const res = await client.get<JalebiRestaurant>('restaurant')
    return transformOrganization(res)
  }

  // --- Invoices (orders as invoices) ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new JalebiClient(credentials)
    const res = await client.get<{ data: JalebiOrder[] }>('orders', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new JalebiClient(credentials)
    const res = await client.get<JalebiOrder>(`orders/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new JalebiClient(credentials)
    const res = await client.post<JalebiOrder>('orders', data)
    return transformInvoice(res)
  }

  async updateInvoice(credentials: Credentials, id: string, data: Partial<Invoice>): Promise<Invoice> {
    const client = new JalebiClient(credentials)
    const res = await client.put<JalebiOrder>(`orders/${id}`, data)
    return transformInvoice(res)
  }

  async deleteInvoice(credentials: Credentials, id: string): Promise<void> {
    const client = new JalebiClient(credentials)
    await client.delete(`orders/${id}`)
  }

  // --- Bills (purchase orders as bills) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new JalebiClient(credentials)
    const res = await client.get<{ data: JalebiPurchaseOrder[] }>('purchase_orders', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new JalebiClient(credentials)
    const res = await client.get<JalebiPurchaseOrder>(`purchase_orders/${id}`)
    return transformBill(res)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new JalebiClient(credentials)
    const res = await client.post<JalebiPurchaseOrder>('purchase_orders', data)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new JalebiClient(credentials)
    const [custRes, suppRes] = await Promise.all([
      client.get<{ data: JalebiCustomer[] }>('customers', this.paginationParams(params)),
      client.get<{ data: JalebiSupplier[] }>('suppliers', this.paginationParams(params)),
    ])
    const customers = (custRes.data ?? []).map(transformCustomer)
    const suppliers = (suppRes.data ?? []).map(transformSupplier)
    return [...customers, ...suppliers]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new JalebiClient(credentials)
    if (id.startsWith('supp_')) {
      const num = id.slice(5)
      const res = await client.get<JalebiSupplier>(`suppliers/${num}`)
      return transformSupplier(res)
    }
    const num = id.startsWith('cust_') ? id.slice(5) : id
    const res = await client.get<JalebiCustomer>(`customers/${num}`)
    return transformCustomer(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new JalebiClient(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<JalebiSupplier>('suppliers', data)
      return transformSupplier(res)
    }
    const res = await client.post<JalebiCustomer>('customers', data)
    return transformCustomer(res)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const client = new JalebiClient(credentials)
    if (id.startsWith('supp_')) {
      const num = id.slice(5)
      const res = await client.put<JalebiSupplier>(`suppliers/${num}`, data)
      return transformSupplier(res)
    }
    const num = id.startsWith('cust_') ? id.slice(5) : id
    const res = await client.put<JalebiCustomer>(`customers/${num}`, data)
    return transformCustomer(res)
  }

  // --- Accounts (items as accounts) ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new JalebiClient(credentials)
    const res = await client.get<{ data: JalebiItem[] }>('items', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new JalebiClient(credentials)
    const res = await client.get<JalebiItem>(`items/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new JalebiClient(credentials)
    const res = await client.get<{ data: JalebiJournal[] }>('journal_entries', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new JalebiClient(credentials)
    const res = await client.get<JalebiJournal>(`journal_entries/${id}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new JalebiClient(credentials)
    const res = await client.post<JalebiJournal>('journal_entries', data)
    return transformJournal(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new JalebiClient(credentials)
    const res = await client.get<{ data: JalebiTaxRate[] }>('tax_rates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new JalebiClient(credentials)
    const res = await client.get<JalebiTaxRate>(`tax_rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Transactions (payments) ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new JalebiClient(credentials)
    const res = await client.get<{ data: JalebiPayment[] }>('payments', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new JalebiClient(credentials)
    const res = await client.get<JalebiPayment>(`payments/${id}`)
    return transformTransaction(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new JalebiClient(credentials)
    const res = await client.get<{ data: JalebiExpense[] }>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new JalebiClient(credentials)
    const res = await client.get<JalebiExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new JalebiClient(credentials)
    const res = await client.post<JalebiExpense>('expenses', data)
    return transformExpense(res)
  }

  // --- Credit Memos (refunds) ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new JalebiClient(credentials)
    const res = await client.get<{ data: JalebiRefund[] }>('refunds', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new JalebiClient(credentials)
    const res = await client.get<JalebiRefund>(`refunds/${id}`)
    return transformCreditMemo(res)
  }

  async createCreditMemo(credentials: Credentials, data: Partial<CreditMemo>): Promise<CreditMemo> {
    const client = new JalebiClient(credentials)
    const res = await client.post<JalebiRefund>('refunds', data)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new JalebiClient(credentials)
    const res = await client.get<{ data: JalebiOrderForOrder[] }>('orders', this.paginationParams(params))
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new JalebiClient(credentials)
    const res = await client.get<JalebiOrderForOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new JalebiClient(credentials)
    const res = await client.post<JalebiOrderForOrder>('orders', data)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new JalebiClient(credentials)
    const res = await client.get<{ data: JalebiSalesOrder[] }>('sales_orders', this.paginationParams(params))
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new JalebiClient(credentials)
    const res = await client.get<JalebiSalesOrder>(`sales_orders/${id}`)
    return transformSalesOrder(res)
  }

  async createSalesOrder(credentials: Credentials, data: Partial<SalesOrder>): Promise<SalesOrder> {
    const client = new JalebiClient(credentials)
    const res = await client.post<JalebiSalesOrder>('sales_orders', data)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new JalebiClient(credentials)
    const res = await client.get<{ data: JalebiPurchaseOrderForPO[] }>('purchase_orders', this.paginationParams(params))
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new JalebiClient(credentials)
    const res = await client.get<JalebiPurchaseOrderForPO>(`purchase_orders/${id}`)
    return transformPurchaseOrder(res)
  }

  async createPurchaseOrder(credentials: Credentials, data: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
    const client = new JalebiClient(credentials)
    const res = await client.post<JalebiPurchaseOrderForPO>('purchase_orders', data)
    return transformPurchaseOrder(res)
  }
}
