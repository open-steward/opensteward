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
import { CloudMeClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type CloudMeInvoice } from './transform/invoice'
import { transformBill, type CloudMeBill } from './transform/bill'
import { transformContact, type CloudMeContact } from './transform/contact'
import { transformAccount, type CloudMeAccount } from './transform/account'
import { transformJournal, type CloudMeJournal } from './transform/journal'
import { transformOrganization, type CloudMeOrganization } from './transform/organization'
import { transformTaxRate, type CloudMeTaxRate } from './transform/taxrate'
import { transformTransaction, type CloudMeTransaction } from './transform/transaction'
import { transformExpense, type CloudMeExpense } from './transform/expense'
import { transformCreditMemo, type CloudMeCreditNote } from './transform/creditmemo'
import { transformOrder, type CloudMeOrder } from './transform/order'
import { transformSalesOrder, type CloudMeSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type CloudMePurchaseOrder } from './transform/purchaseorder'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class CloudMeAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'cloudme'
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
    const client = new CloudMeClient(credentials)
    const res = await client.get<CloudMeOrganization>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<{ data: CloudMeInvoice[] }>('invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<CloudMeInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new CloudMeClient(credentials)
    const res = await client.post<CloudMeInvoice>('invoices', data)
    return transformInvoice(res)
  }

  async updateInvoice(credentials: Credentials, id: string, data: Partial<Invoice>): Promise<Invoice> {
    const client = new CloudMeClient(credentials)
    const res = await client.put<CloudMeInvoice>(`invoices/${id}`, data)
    return transformInvoice(res)
  }

  async deleteInvoice(credentials: Credentials, id: string): Promise<void> {
    const client = new CloudMeClient(credentials)
    await client.delete(`invoices/${id}`)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<{ data: CloudMeBill[] }>('purchase_invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<CloudMeBill>(`purchase_invoices/${id}`)
    return transformBill(res)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new CloudMeClient(credentials)
    const res = await client.post<CloudMeBill>('purchase_invoices', data)
    return transformBill(res)
  }

  async updateBill(credentials: Credentials, id: string, data: Partial<Bill>): Promise<Bill> {
    const client = new CloudMeClient(credentials)
    const res = await client.put<CloudMeBill>(`purchase_invoices/${id}`, data)
    return transformBill(res)
  }

  async deleteBill(credentials: Credentials, id: string): Promise<void> {
    const client = new CloudMeClient(credentials)
    await client.delete(`purchase_invoices/${id}`)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new CloudMeClient(credentials)
    const [custRes, vendRes] = await Promise.all([
      client.get<{ data: CloudMeContact[] }>('customers', this.paginationParams(params)),
      client.get<{ data: CloudMeContact[] }>('vendors', this.paginationParams(params)),
    ])
    const customers = (custRes.data ?? []).map((c) => transformContact({ ...c, is_customer: true, is_vendor: false }))
    const vendors = (vendRes.data ?? []).map((v) => transformContact({ ...v, is_customer: false, is_vendor: true }))
    return [...customers, ...vendors]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<CloudMeContact>(`customers/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new CloudMeClient(credentials)
    const res = await client.post<CloudMeContact>('customers', data)
    return transformContact(res)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const client = new CloudMeClient(credentials)
    const res = await client.put<CloudMeContact>(`customers/${id}`, data)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<{ data: CloudMeAccount[] }>('accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<CloudMeAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<{ data: CloudMeJournal[] }>('journal_entries', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<CloudMeJournal>(`journal_entries/${id}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new CloudMeClient(credentials)
    const res = await client.post<CloudMeJournal>('journal_entries', data)
    return transformJournal(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<{ data: CloudMeTaxRate[] }>('tax_rates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<CloudMeTaxRate>(`tax_rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<{ data: CloudMeTransaction[] }>('transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<CloudMeTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<{ data: CloudMeExpense[] }>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<CloudMeExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new CloudMeClient(credentials)
    const res = await client.post<CloudMeExpense>('expenses', data)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<{ data: CloudMeCreditNote[] }>('credit_notes', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<CloudMeCreditNote>(`credit_notes/${id}`)
    return transformCreditMemo(res)
  }

  async createCreditMemo(credentials: Credentials, data: Partial<CreditMemo>): Promise<CreditMemo> {
    const client = new CloudMeClient(credentials)
    const res = await client.post<CloudMeCreditNote>('credit_notes', data)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<{ data: CloudMeOrder[] }>('orders', this.paginationParams(params))
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<CloudMeOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new CloudMeClient(credentials)
    const res = await client.post<CloudMeOrder>('orders', data)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<{ data: CloudMeSalesOrder[] }>('sales_orders', this.paginationParams(params))
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<CloudMeSalesOrder>(`sales_orders/${id}`)
    return transformSalesOrder(res)
  }

  async createSalesOrder(credentials: Credentials, data: Partial<SalesOrder>): Promise<SalesOrder> {
    const client = new CloudMeClient(credentials)
    const res = await client.post<CloudMeSalesOrder>('sales_orders', data)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<{ data: CloudMePurchaseOrder[] }>('purchase_orders', this.paginationParams(params))
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new CloudMeClient(credentials)
    const res = await client.get<CloudMePurchaseOrder>(`purchase_orders/${id}`)
    return transformPurchaseOrder(res)
  }

  async createPurchaseOrder(credentials: Credentials, data: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
    const client = new CloudMeClient(credentials)
    const res = await client.post<CloudMePurchaseOrder>('purchase_orders', data)
    return transformPurchaseOrder(res)
  }
}
