import { simpleApiKey } from '@opensteward/shared'
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
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefreshCredentials,
} from './auth'
import { FatouraCl } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type FatouaInvoice } from './transform/invoice'
import { transformBill, type FatouraBill } from './transform/bill'
import { transformClient, transformSupplier, type FatouaClient, type FatouaSupplier } from './transform/contact'
import { transformAccount, type FatouaAccount } from './transform/account'
import { transformJournal, type FatouaJournal } from './transform/journal'
import { transformOrganization, type FatouaCompany } from './transform/organization'
import { transformTaxRate, type FatouraTaxRate } from './transform/taxrate'
import { transformTransaction, type FatouaPayment } from './transform/transaction'
import { transformExpense, type FatouaExpense } from './transform/expense'
import { transformCreditMemo, type FatouraCreditMemo } from './transform/creditmemo'
import { transformOrder, type FatouaOrder } from './transform/order'
import { transformSalesOrder, type FatouraSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type FatouraPurchaseOrder } from './transform/purchaseorder'

type ListOrArray<T> = T[] | { results: T[] } | { data: T[] }

function toArray<T>(res: ListOrArray<T>): T[] {
  if (Array.isArray(res)) return res
  if ('results' in res && Array.isArray((res as { results: T[] }).results)) return (res as { results: T[] }).results
  if ('data' in res && Array.isArray((res as { data: T[] }).data)) return (res as { data: T[] }).data
  return []
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class FatouraAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'fatoura'
  readonly version = '0.1.0'

  constructor() {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
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
    const client = new FatouraCl(credentials)
    const res = await client.get<FatouaCompany>('company')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new FatouraCl(credentials)
    const res = await client.get<ListOrArray<FatouaInvoice>>('invoices', this.paginationParams(params))
    return toArray(res).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new FatouraCl(credentials)
    const res = await client.get<FatouaInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new FatouraCl(credentials)
    const res = await client.post<FatouaInvoice>('invoices', data)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new FatouraCl(credentials)
    const res = await client.get<ListOrArray<FatouraBill>>('supplier_invoices', this.paginationParams(params))
    return toArray(res).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new FatouraCl(credentials)
    const res = await client.get<FatouraBill>(`supplier_invoices/${id}`)
    return transformBill(res)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new FatouraCl(credentials)
    const res = await client.post<FatouraBill>('supplier_invoices', data)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new FatouraCl(credentials)
    const [clientsRes, suppliersRes] = await Promise.all([
      client.get<ListOrArray<FatouaClient>>('clients', this.paginationParams(params)),
      client.get<ListOrArray<FatouaSupplier>>('suppliers', this.paginationParams(params)),
    ])
    const clients = toArray(clientsRes).map(transformClient)
    const suppliers = toArray(suppliersRes).map(transformSupplier)
    return [...clients, ...suppliers]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new FatouraCl(credentials)
    if (id.startsWith('supp_')) {
      const suppId = id.slice(5)
      const res = await client.get<FatouaSupplier>(`suppliers/${suppId}`)
      return transformSupplier(res)
    }
    const clientId = id.startsWith('cust_') ? id.slice(5) : id
    const res = await client.get<FatouaClient>(`clients/${clientId}`)
    return transformClient(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new FatouraCl(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<FatouaSupplier>('suppliers', data)
      return transformSupplier(res)
    }
    const res = await client.post<FatouaClient>('clients', data)
    return transformClient(res)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const client = new FatouraCl(credentials)
    if (id.startsWith('supp_')) {
      const suppId = id.slice(5)
      const res = await client.put<FatouaSupplier>(`suppliers/${suppId}`, data)
      return transformSupplier(res)
    }
    const clientId = id.startsWith('cust_') ? id.slice(5) : id
    const res = await client.put<FatouaClient>(`clients/${clientId}`, data)
    return transformClient(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new FatouraCl(credentials)
    const res = await client.get<ListOrArray<FatouaAccount>>('accounts', this.paginationParams(params))
    return toArray(res).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new FatouraCl(credentials)
    const res = await client.get<FatouaAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new FatouraCl(credentials)
    const res = await client.get<ListOrArray<FatouaJournal>>('journal_entries', this.paginationParams(params))
    return toArray(res).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new FatouraCl(credentials)
    const res = await client.get<FatouaJournal>(`journal_entries/${id}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new FatouraCl(credentials)
    const res = await client.post<FatouaJournal>('journal_entries', data)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new FatouraCl(credentials)
    const res = await client.get<ListOrArray<FatouaPayment>>('payments', this.paginationParams(params))
    return toArray(res).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new FatouraCl(credentials)
    const res = await client.get<FatouaPayment>(`payments/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new FatouraCl(credentials)
    const res = await client.get<ListOrArray<FatouraTaxRate>>('tax_rates', this.paginationParams(params))
    return toArray(res).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new FatouraCl(credentials)
    const res = await client.get<FatouraTaxRate>(`tax_rates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new FatouraCl(credentials)
    const res = await client.get<ListOrArray<FatouaExpense>>('expenses', this.paginationParams(params))
    return toArray(res).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new FatouraCl(credentials)
    const res = await client.get<FatouaExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new FatouraCl(credentials)
    const res = await client.post<FatouaExpense>('expenses', data)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new FatouraCl(credentials)
    const res = await client.get<ListOrArray<FatouraCreditMemo>>('credit_memos', this.paginationParams(params))
    return toArray(res).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new FatouraCl(credentials)
    const res = await client.get<FatouraCreditMemo>(`credit_memos/${id}`)
    return transformCreditMemo(res)
  }

  async createCreditMemo(credentials: Credentials, data: Partial<CreditMemo>): Promise<CreditMemo> {
    const client = new FatouraCl(credentials)
    const res = await client.post<FatouraCreditMemo>('credit_memos', data)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new FatouraCl(credentials)
    const res = await client.get<ListOrArray<FatouaOrder>>('orders', this.paginationParams(params))
    return toArray(res).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new FatouraCl(credentials)
    const res = await client.get<FatouaOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new FatouraCl(credentials)
    const res = await client.post<FatouaOrder>('orders', data)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new FatouraCl(credentials)
    const res = await client.get<ListOrArray<FatouraSalesOrder>>('sales_orders', this.paginationParams(params))
    return toArray(res).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new FatouraCl(credentials)
    const res = await client.get<FatouraSalesOrder>(`sales_orders/${id}`)
    return transformSalesOrder(res)
  }

  async createSalesOrder(credentials: Credentials, data: Partial<SalesOrder>): Promise<SalesOrder> {
    const client = new FatouraCl(credentials)
    const res = await client.post<FatouraSalesOrder>('sales_orders', data)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new FatouraCl(credentials)
    const res = await client.get<ListOrArray<FatouraPurchaseOrder>>('purchase_orders', this.paginationParams(params))
    return toArray(res).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new FatouraCl(credentials)
    const res = await client.get<FatouraPurchaseOrder>(`purchase_orders/${id}`)
    return transformPurchaseOrder(res)
  }

  async createPurchaseOrder(credentials: Credentials, data: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
    const client = new FatouraCl(credentials)
    const res = await client.post<FatouraPurchaseOrder>('purchase_orders', data)
    return transformPurchaseOrder(res)
  }
}
