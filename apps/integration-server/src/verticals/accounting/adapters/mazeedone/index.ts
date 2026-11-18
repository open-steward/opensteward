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

import { buildAuthUrl, exchangeCode, refreshCredentials } from './auth'
import { MazeedOneClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type MazeedOneInvoice } from './transform/invoice'
import { transformBill, type MazeedOneBill } from './transform/bill'
import {
  transformClient,
  transformSupplier,
  type MazeedOneClient as MazeedOneContactClient,
  type MazeedOneSupplier,
} from './transform/contact'
import { transformAccount, type MazeedOneAccount } from './transform/account'
import { transformJournal, type MazeedOneJournal } from './transform/journal'
import { transformOrganization, type MazeedOneCompany } from './transform/organization'
import { transformTaxRate, type MazeedOneTaxRate } from './transform/taxrate'
import { transformTransaction, type MazeedOneTransaction } from './transform/transaction'
import { transformExpense, type MazeedOneExpense } from './transform/expense'
import { transformCreditMemo, type MazeedOneCreditNote } from './transform/creditmemo'
import { transformOrder, type MazeedOneOrder } from './transform/order'
import { transformSalesOrder, type MazeedOneSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type MazeedOnePurchaseOrder } from './transform/purchaseorder'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class MazeedOneAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'mazeedone'
  readonly version = '0.1.0'

  constructor() {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<MazeedOneCompany>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<{ data: MazeedOneInvoice[] }>('invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<MazeedOneInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new MazeedOneClient(credentials)
    const res = await client.post<MazeedOneInvoice>('invoices', data)
    return transformInvoice(res)
  }

  async updateInvoice(credentials: Credentials, id: string, data: Partial<Invoice>): Promise<Invoice> {
    const client = new MazeedOneClient(credentials)
    const res = await client.put<MazeedOneInvoice>(`invoices/${id}`, data)
    return transformInvoice(res)
  }

  async deleteInvoice(credentials: Credentials, id: string): Promise<void> {
    const client = new MazeedOneClient(credentials)
    await client.delete(`invoices/${id}`)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<{ data: MazeedOneBill[] }>('bills', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<MazeedOneBill>(`bills/${id}`)
    return transformBill(res)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new MazeedOneClient(credentials)
    const res = await client.post<MazeedOneBill>('bills', data)
    return transformBill(res)
  }

  async updateBill(credentials: Credentials, id: string, data: Partial<Bill>): Promise<Bill> {
    const client = new MazeedOneClient(credentials)
    const res = await client.put<MazeedOneBill>(`bills/${id}`, data)
    return transformBill(res)
  }

  async deleteBill(credentials: Credentials, id: string): Promise<void> {
    const client = new MazeedOneClient(credentials)
    await client.delete(`bills/${id}`)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new MazeedOneClient(credentials)
    const [clientsRes, suppRes] = await Promise.all([
      client.get<{ data: MazeedOneContactClient[] }>('clients', this.paginationParams(params)),
      client.get<{ data: MazeedOneSupplier[] }>('suppliers', this.paginationParams(params)),
    ])
    const clients = (clientsRes.data ?? []).map(transformClient)
    const suppliers = (suppRes.data ?? []).map(transformSupplier)
    return [...clients, ...suppliers]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new MazeedOneClient(credentials)
    if (id.startsWith('supp_')) {
      const num = id.slice(5)
      const res = await client.get<MazeedOneSupplier>(`suppliers/${num}`)
      return transformSupplier(res)
    }
    const num = id.startsWith('client_') ? id.slice(7) : id
    const res = await client.get<MazeedOneContactClient>(`clients/${num}`)
    return transformClient(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new MazeedOneClient(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<MazeedOneSupplier>('suppliers', data)
      return transformSupplier(res)
    }
    const res = await client.post<MazeedOneContactClient>('clients', data)
    return transformClient(res)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const client = new MazeedOneClient(credentials)
    if (id.startsWith('supp_')) {
      const num = id.slice(5)
      const res = await client.put<MazeedOneSupplier>(`suppliers/${num}`, data)
      return transformSupplier(res)
    }
    const num = id.startsWith('client_') ? id.slice(7) : id
    const res = await client.put<MazeedOneContactClient>(`clients/${num}`, data)
    return transformClient(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<{ data: MazeedOneAccount[] }>('accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<MazeedOneAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<{ data: MazeedOneJournal[] }>('journal_entries', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<MazeedOneJournal>(`journal_entries/${id}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new MazeedOneClient(credentials)
    const res = await client.post<MazeedOneJournal>('journal_entries', data)
    return transformJournal(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<{ data: MazeedOneTaxRate[] }>('tax_rates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<MazeedOneTaxRate>(`tax_rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<{ data: MazeedOneTransaction[] }>('transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<MazeedOneTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<{ data: MazeedOneExpense[] }>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<MazeedOneExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new MazeedOneClient(credentials)
    const res = await client.post<MazeedOneExpense>('expenses', data)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<{ data: MazeedOneCreditNote[] }>('credit_notes', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<MazeedOneCreditNote>(`credit_notes/${id}`)
    return transformCreditMemo(res)
  }

  async createCreditMemo(credentials: Credentials, data: Partial<CreditMemo>): Promise<CreditMemo> {
    const client = new MazeedOneClient(credentials)
    const res = await client.post<MazeedOneCreditNote>('credit_notes', data)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<{ data: MazeedOneOrder[] }>('orders', this.paginationParams(params))
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<MazeedOneOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new MazeedOneClient(credentials)
    const res = await client.post<MazeedOneOrder>('orders', data)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<{ data: MazeedOneSalesOrder[] }>('sales_orders', this.paginationParams(params))
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<MazeedOneSalesOrder>(`sales_orders/${id}`)
    return transformSalesOrder(res)
  }

  async createSalesOrder(credentials: Credentials, data: Partial<SalesOrder>): Promise<SalesOrder> {
    const client = new MazeedOneClient(credentials)
    const res = await client.post<MazeedOneSalesOrder>('sales_orders', data)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<{ data: MazeedOnePurchaseOrder[] }>('purchase_orders', this.paginationParams(params))
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new MazeedOneClient(credentials)
    const res = await client.get<MazeedOnePurchaseOrder>(`purchase_orders/${id}`)
    return transformPurchaseOrder(res)
  }

  async createPurchaseOrder(credentials: Credentials, data: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
    const client = new MazeedOneClient(credentials)
    const res = await client.post<MazeedOnePurchaseOrder>('purchase_orders', data)
    return transformPurchaseOrder(res)
  }
}
