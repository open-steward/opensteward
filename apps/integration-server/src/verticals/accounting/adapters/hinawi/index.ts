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
import { HinawiClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type HinawiInvoice } from './transform/invoice'
import { transformBill, type HinawiBill } from './transform/bill'
import { transformContact, type HinawiContact } from './transform/contact'
import { transformAccount, type HinawiAccount } from './transform/account'
import { transformJournal, type HinawiJournal } from './transform/journal'
import { transformOrganization, type HinawiCompany } from './transform/organization'
import { transformTaxRate, type HinawiTaxRate } from './transform/taxrate'
import { transformTransaction, type HinawiTransaction } from './transform/transaction'
import { transformExpense, type HinawiExpense } from './transform/expense'
import { transformCreditMemo, type HinawiCreditNote } from './transform/creditmemo'
import { transformOrder, type HinawiOrder } from './transform/order'
import { transformSalesOrder, type HinawiSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type HinawiPurchaseOrder } from './transform/purchaseorder'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class HinawiAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'hinawi'
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
      PageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      PageNumber: params.page ?? 1,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new HinawiClient(credentials)
    const res = await client.get<HinawiCompany>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new HinawiClient(credentials)
    const res = await client.get<{ data: HinawiInvoice[] }>('invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new HinawiClient(credentials)
    const res = await client.get<HinawiInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new HinawiClient(credentials)
    const res = await client.post<HinawiInvoice>('invoices', data)
    return transformInvoice(res)
  }

  async updateInvoice(credentials: Credentials, id: string, data: Partial<Invoice>): Promise<Invoice> {
    const client = new HinawiClient(credentials)
    const res = await client.put<HinawiInvoice>(`invoices/${id}`, data)
    return transformInvoice(res)
  }

  async deleteInvoice(credentials: Credentials, id: string): Promise<void> {
    const client = new HinawiClient(credentials)
    await client.delete(`invoices/${id}`)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new HinawiClient(credentials)
    const res = await client.get<{ data: HinawiBill[] }>('purchase_invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new HinawiClient(credentials)
    const res = await client.get<HinawiBill>(`purchase_invoices/${id}`)
    return transformBill(res)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new HinawiClient(credentials)
    const res = await client.post<HinawiBill>('purchase_invoices', data)
    return transformBill(res)
  }

  async updateBill(credentials: Credentials, id: string, data: Partial<Bill>): Promise<Bill> {
    const client = new HinawiClient(credentials)
    const res = await client.put<HinawiBill>(`purchase_invoices/${id}`, data)
    return transformBill(res)
  }

  async deleteBill(credentials: Credentials, id: string): Promise<void> {
    const client = new HinawiClient(credentials)
    await client.delete(`purchase_invoices/${id}`)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new HinawiClient(credentials)
    const [custRes, suppRes] = await Promise.all([
      client.get<{ data: HinawiContact[] }>('customers', this.paginationParams(params)),
      client.get<{ data: HinawiContact[] }>('suppliers', this.paginationParams(params)),
    ])
    const customers = (custRes.data ?? []).map((c) =>
      transformContact({ ...c, IsCustomer: true, IsVendor: false }),
    )
    const suppliers = (suppRes.data ?? []).map((s) =>
      transformContact({ ...s, IsCustomer: false, IsVendor: true }),
    )
    return [...customers, ...suppliers]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new HinawiClient(credentials)
    const res = await client.get<HinawiContact>(`customers/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new HinawiClient(credentials)
    const res = await client.post<HinawiContact>('customers', data)
    return transformContact(res)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const client = new HinawiClient(credentials)
    const res = await client.put<HinawiContact>(`customers/${id}`, data)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new HinawiClient(credentials)
    const res = await client.get<{ data: HinawiAccount[] }>('accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new HinawiClient(credentials)
    const res = await client.get<HinawiAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new HinawiClient(credentials)
    const res = await client.get<{ data: HinawiJournal[] }>('journal_entries', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new HinawiClient(credentials)
    const res = await client.get<HinawiJournal>(`journal_entries/${id}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new HinawiClient(credentials)
    const res = await client.post<HinawiJournal>('journal_entries', data)
    return transformJournal(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new HinawiClient(credentials)
    const res = await client.get<{ data: HinawiTaxRate[] }>('tax_rates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new HinawiClient(credentials)
    const res = await client.get<HinawiTaxRate>(`tax_rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new HinawiClient(credentials)
    const res = await client.get<{ data: HinawiTransaction[] }>('transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new HinawiClient(credentials)
    const res = await client.get<HinawiTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new HinawiClient(credentials)
    const res = await client.get<{ data: HinawiExpense[] }>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new HinawiClient(credentials)
    const res = await client.get<HinawiExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new HinawiClient(credentials)
    const res = await client.post<HinawiExpense>('expenses', data)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new HinawiClient(credentials)
    const res = await client.get<{ data: HinawiCreditNote[] }>('credit_notes', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new HinawiClient(credentials)
    const res = await client.get<HinawiCreditNote>(`credit_notes/${id}`)
    return transformCreditMemo(res)
  }

  async createCreditMemo(credentials: Credentials, data: Partial<CreditMemo>): Promise<CreditMemo> {
    const client = new HinawiClient(credentials)
    const res = await client.post<HinawiCreditNote>('credit_notes', data)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new HinawiClient(credentials)
    const res = await client.get<{ data: HinawiOrder[] }>('orders', this.paginationParams(params))
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new HinawiClient(credentials)
    const res = await client.get<HinawiOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new HinawiClient(credentials)
    const res = await client.post<HinawiOrder>('orders', data)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new HinawiClient(credentials)
    const res = await client.get<{ data: HinawiSalesOrder[] }>('sales_orders', this.paginationParams(params))
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new HinawiClient(credentials)
    const res = await client.get<HinawiSalesOrder>(`sales_orders/${id}`)
    return transformSalesOrder(res)
  }

  async createSalesOrder(credentials: Credentials, data: Partial<SalesOrder>): Promise<SalesOrder> {
    const client = new HinawiClient(credentials)
    const res = await client.post<HinawiSalesOrder>('sales_orders', data)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new HinawiClient(credentials)
    const res = await client.get<{ data: HinawiPurchaseOrder[] }>('purchase_orders', this.paginationParams(params))
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new HinawiClient(credentials)
    const res = await client.get<HinawiPurchaseOrder>(`purchase_orders/${id}`)
    return transformPurchaseOrder(res)
  }

  async createPurchaseOrder(credentials: Credentials, data: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
    const client = new HinawiClient(credentials)
    const res = await client.post<HinawiPurchaseOrder>('purchase_orders', data)
    return transformPurchaseOrder(res)
  }
}
