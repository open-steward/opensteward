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

import {
  DAFTRA_CREDENTIAL_FORM,
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefreshCredentials,
} from './auth'
import { DaftraClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

export interface DaftraAdapterConfig {
  subdomain?: string
}

import { transformInvoice, type DaftraInvoice } from './transform/invoice'
import { transformBill, type DaftraBill } from './transform/bill'
import { transformClient, transformSupplier, type DaftraClient as DaftraClientContact, type DaftraSupplier } from './transform/contact'
import { transformAccount, type DaftraAccount } from './transform/account'
import { transformJournal, type DaftraJournal } from './transform/journal'
import { transformOrganization, type DaftraCompany } from './transform/organization'
import { transformTaxRate, type DaftraTaxRate } from './transform/taxrate'
import { transformTransaction, type DaftraTransaction } from './transform/transaction'
import { transformExpense, type DaftraExpense } from './transform/expense'
import { transformCreditMemo, type DaftraCreditNote } from './transform/creditmemo'
import { transformOrder, type DaftraOrder } from './transform/order'
import { transformSalesOrder, type DaftraSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type DaftraPurchaseOrder } from './transform/purchaseorder'

// Daftra wraps each item in an entity key: { data: [{ Invoice: {...} }, ...] }
type DaftraListResponse<T> = T[] | { data: Array<Record<string, T>> } | { results: T[] }

function toArray<T>(res: DaftraListResponse<T>, entityKey: string): T[] {
  if (Array.isArray(res)) return res
  if ('data' in res && Array.isArray((res as { data: unknown[] }).data)) {
    const items = (res as { data: Array<Record<string, T>> }).data
    return items.map((item) => (entityKey in item ? item[entityKey] : item) as T)
  }
  if ('results' in res && Array.isArray((res as { results: T[] }).results))
    return (res as { results: T[] }).results
  return []
}

function single<T>(res: Record<string, T> | T, entityKey: string): T {
  if (res && typeof res === 'object' && entityKey in (res as Record<string, T>))
    return (res as Record<string, T>)[entityKey]
  return res as T
}

export class DaftraAdapter implements AccountingAdapter {

  // Connect Link support — API key + tenant subdomain (see auth.ts). The
  // subdomain is stored on the connection's credentials; `config.subdomain`
  // is only a deployment-level fallback.

  credentialFields = DAFTRA_CREDENTIAL_FORM.credentialFields

  exchangeCredentials = DAFTRA_CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'daftra'
  readonly version = '0.1.0'

  private subdomain: string

  constructor(config: DaftraAdapterConfig = {}) {
    this.subdomain = config.subdomain ?? ''
  }

  getAuthUrl(_state: string): string {
    return buildAuthUrl(this.subdomain)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new DaftraClient(credentials, this.subdomain)
    const raw = await client.get<Record<string, DaftraCompany>>('company')
    const res = single(raw, 'Company')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new DaftraClient(credentials, this.subdomain)
    const res = await client.get<DaftraListResponse<DaftraInvoice>>('invoices', this.paginationParams(params))
    return toArray(res, 'Invoice').map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new DaftraClient(credentials, this.subdomain)
    const raw = await client.get<Record<string, DaftraInvoice>>(`invoices/${id}`)
    const res = single(raw, 'Invoice')
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new DaftraClient(credentials, this.subdomain)
    const res = await client.post<DaftraInvoice>('invoices', data)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new DaftraClient(credentials, this.subdomain)
    const res = await client.get<DaftraListResponse<DaftraBill>>('bills', this.paginationParams(params))
    return toArray(res, 'Bill').map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new DaftraClient(credentials, this.subdomain)
    const raw = await client.get<Record<string, DaftraBill>>(`bills/${id}`)
    const res = single(raw, 'Bill')
    return transformBill(res)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new DaftraClient(credentials, this.subdomain)
    const res = await client.post<DaftraBill>('bills', data)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new DaftraClient(credentials, this.subdomain)
    const [clientsRes, suppliersRes] = await Promise.all([
      client.get<DaftraListResponse<DaftraClientContact>>('clients', this.paginationParams(params)),
      client.get<DaftraListResponse<DaftraSupplier>>('suppliers', this.paginationParams(params)),
    ])
    const clients = toArray(clientsRes, 'Client').map(transformClient)
    const suppliers = toArray(suppliersRes, 'Supplier').map(transformSupplier)
    return [...clients, ...suppliers]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new DaftraClient(credentials, this.subdomain)
    if (id.startsWith('supp_')) {
      const suppId = id.slice(5)
      const raw = await client.get<Record<string, DaftraSupplier>>(`suppliers/${suppId}`)
      return transformSupplier(single(raw, 'Supplier'))
    }
    const clientId = id.startsWith('cust_') ? id.slice(5) : id
    const raw = await client.get<Record<string, DaftraClientContact>>(`clients/${clientId}`)
    return transformClient(single(raw, 'Client'))
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new DaftraClient(credentials, this.subdomain)
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<DaftraSupplier>('suppliers', data)
      return transformSupplier(res)
    }
    const res = await client.post<DaftraClientContact>('clients', data)
    return transformClient(res)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const client = new DaftraClient(credentials, this.subdomain)
    if (id.startsWith('supp_')) {
      const suppId = id.slice(5)
      const res = await client.put<DaftraSupplier>(`suppliers/${suppId}`, data)
      return transformSupplier(res)
    }
    const clientId = id.startsWith('cust_') ? id.slice(5) : id
    const res = await client.put<DaftraClientContact>(`clients/${clientId}`, data)
    return transformClient(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new DaftraClient(credentials, this.subdomain)
    const res = await client.get<DaftraListResponse<DaftraAccount>>('accounts', this.paginationParams(params))
    return toArray(res, 'Account').map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new DaftraClient(credentials, this.subdomain)
    const raw = await client.get<Record<string, DaftraAccount>>(`accounts/${id}`)
    return transformAccount(single(raw, 'Account'))
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new DaftraClient(credentials, this.subdomain)
    const res = await client.get<DaftraListResponse<DaftraJournal>>('journal_entries', this.paginationParams(params))
    return toArray(res, 'JournalEntry').map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new DaftraClient(credentials, this.subdomain)
    const raw = await client.get<Record<string, DaftraJournal>>(`journal_entries/${id}`)
    return transformJournal(single(raw, 'JournalEntry'))
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new DaftraClient(credentials, this.subdomain)
    const res = await client.post<DaftraJournal>('journal_entries', data)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new DaftraClient(credentials, this.subdomain)
    const res = await client.get<DaftraListResponse<DaftraTransaction>>('transactions', this.paginationParams(params))
    return toArray(res, 'Transaction').map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new DaftraClient(credentials, this.subdomain)
    const raw = await client.get<Record<string, DaftraTransaction>>(`transactions/${id}`)
    return transformTransaction(single(raw, 'Transaction'))
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new DaftraClient(credentials, this.subdomain)
    const res = await client.get<DaftraListResponse<DaftraTaxRate>>('tax_rates', this.paginationParams(params))
    return toArray(res, 'TaxRate').map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new DaftraClient(credentials, this.subdomain)
    const raw = await client.get<Record<string, DaftraTaxRate>>(`tax_rates/${id}`)
    return transformTaxRate(single(raw, 'TaxRate'))
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new DaftraClient(credentials, this.subdomain)
    const res = await client.get<DaftraListResponse<DaftraExpense>>('expenses', this.paginationParams(params))
    return toArray(res, 'Expense').map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new DaftraClient(credentials, this.subdomain)
    const raw = await client.get<Record<string, DaftraExpense>>(`expenses/${id}`)
    return transformExpense(single(raw, 'Expense'))
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new DaftraClient(credentials, this.subdomain)
    const res = await client.post<DaftraExpense>('expenses', data)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new DaftraClient(credentials, this.subdomain)
    const res = await client.get<DaftraListResponse<DaftraCreditNote>>('credit_notes', this.paginationParams(params))
    return toArray(res, 'CreditNote').map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new DaftraClient(credentials, this.subdomain)
    const raw = await client.get<Record<string, DaftraCreditNote>>(`credit_notes/${id}`)
    return transformCreditMemo(single(raw, 'CreditNote'))
  }

  async createCreditMemo(credentials: Credentials, data: Partial<CreditMemo>): Promise<CreditMemo> {
    const client = new DaftraClient(credentials, this.subdomain)
    const res = await client.post<DaftraCreditNote>('credit_notes', data)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new DaftraClient(credentials, this.subdomain)
    const res = await client.get<DaftraListResponse<DaftraOrder>>('orders', this.paginationParams(params))
    return toArray(res, 'Order').map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new DaftraClient(credentials, this.subdomain)
    const raw = await client.get<Record<string, DaftraOrder>>(`orders/${id}`)
    return transformOrder(single(raw, 'Order'))
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new DaftraClient(credentials, this.subdomain)
    const res = await client.post<DaftraOrder>('orders', data)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new DaftraClient(credentials, this.subdomain)
    const res = await client.get<DaftraListResponse<DaftraSalesOrder>>('sales_orders', this.paginationParams(params))
    return toArray(res, 'SalesOrder').map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new DaftraClient(credentials, this.subdomain)
    const raw = await client.get<Record<string, DaftraSalesOrder>>(`sales_orders/${id}`)
    return transformSalesOrder(single(raw, 'SalesOrder'))
  }

  async createSalesOrder(credentials: Credentials, data: Partial<SalesOrder>): Promise<SalesOrder> {
    const client = new DaftraClient(credentials, this.subdomain)
    const res = await client.post<DaftraSalesOrder>('sales_orders', data)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new DaftraClient(credentials, this.subdomain)
    const res = await client.get<DaftraListResponse<DaftraPurchaseOrder>>('purchase_orders', this.paginationParams(params))
    return toArray(res, 'PurchaseOrder').map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new DaftraClient(credentials, this.subdomain)
    const raw = await client.get<Record<string, DaftraPurchaseOrder>>(`purchase_orders/${id}`)
    return transformPurchaseOrder(single(raw, 'PurchaseOrder'))
  }

  async createPurchaseOrder(credentials: Credentials, data: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
    const client = new DaftraClient(credentials, this.subdomain)
    const res = await client.post<DaftraPurchaseOrder>('purchase_orders', data)
    return transformPurchaseOrder(res)
  }
}
