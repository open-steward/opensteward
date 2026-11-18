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

import { buildAuthUrl, exchangeCode as doExchangeCode, refreshAccessToken } from './auth'
import { DatevClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type DatevInvoice } from './transform/invoice'
import { transformBill, type DatevBill } from './transform/bill'
import { transformContact, type DatevContact } from './transform/contact'
import { transformAccount, type DatevAccount } from './transform/account'
import { transformJournal, type DatevJournal } from './transform/journal'
import { transformOrganization, type DatevOrganization } from './transform/organization'
import { transformExpense, type DatevExpense } from './transform/expense'
import { transformTaxRate, type DatevTaxRate } from './transform/taxrate'
import { transformTransaction, type DatevTransaction } from './transform/transaction'
import { transformCreditMemo, type DatevCreditMemo } from './transform/creditmemo'
import { transformOrder, type DatevOrder } from './transform/order'
import { transformSalesOrder, type DatevSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type DatevPurchaseOrder } from './transform/purchaseorder'

interface DatevAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class DatevAdapter implements AccountingAdapter {
  readonly platform = 'datev'
  readonly version = '0.1.0'

  constructor(private config: DatevAdapterConfig) {}

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.config.clientId, this.config.redirectUri, (overrideScopes ?? this.config.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code, this.config.clientId, this.config.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    return refreshAccessToken(credentials.refreshToken, this.config.clientId, this.config.clientSecret)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      offset: ((params.page ?? 1) - 1) * (params.limit ?? DEFAULT_PAGE_SIZE),
    }
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new DatevClient(credentials)
    const res = await client.get<DatevOrganization>('client')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new DatevClient(credentials)
    const res = await client.get<{ data: DatevInvoice[] }>('invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new DatevClient(credentials)
    const res = await client.get<DatevInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new DatevClient(credentials)
    const res = await client.get<{ data: DatevBill[] }>('bills', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new DatevClient(credentials)
    const res = await client.get<DatevBill>(`bills/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new DatevClient(credentials)
    const res = await client.get<{ data: DatevContact[] }>('contacts', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new DatevClient(credentials)
    const res = await client.get<DatevContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new DatevClient(credentials)
    const res = await client.get<{ data: DatevAccount[] }>('accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new DatevClient(credentials)
    const res = await client.get<DatevAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new DatevClient(credentials)
    const res = await client.get<{ data: DatevJournal[] }>('journals', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new DatevClient(credentials)
    const res = await client.get<DatevJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new DatevClient(credentials)
    const res = await client.get<{ data: DatevTransaction[] }>('transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new DatevClient(credentials)
    const res = await client.get<DatevTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new DatevClient(credentials)
    const res = await client.get<{ data: DatevTaxRate[] }>('tax-rates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new DatevClient(credentials)
    const res = await client.get<DatevTaxRate>(`tax-rates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new DatevClient(credentials)
    const res = await client.get<{ data: DatevExpense[] }>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new DatevClient(credentials)
    const res = await client.get<DatevExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new DatevClient(credentials)
    const res = await client.get<{ data: DatevCreditMemo[] }>('credit-notes', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new DatevClient(credentials)
    const res = await client.get<DatevCreditMemo>(`credit-notes/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new DatevClient(credentials)
    const res = await client.get<{ data: DatevOrder[] }>('orders', this.paginationParams(params))
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new DatevClient(credentials)
    const res = await client.get<DatevOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new DatevClient(credentials)
    const res = await client.get<{ data: DatevSalesOrder[] }>('sales-orders', this.paginationParams(params))
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new DatevClient(credentials)
    const res = await client.get<DatevSalesOrder>(`sales-orders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new DatevClient(credentials)
    const res = await client.get<{ data: DatevPurchaseOrder[] }>('purchase-orders', this.paginationParams(params))
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new DatevClient(credentials)
    const res = await client.get<DatevPurchaseOrder>(`purchase-orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
