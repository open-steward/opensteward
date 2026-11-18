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
import { BusyClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type BusyInvoice } from './transform/invoice'
import { transformBill, untransformBill, type BusyBill } from './transform/bill'
import { transformContact, type BusyContact } from './transform/contact'
import { transformAccount, type BusyAccount } from './transform/account'
import { transformJournal, untransformJournal, type BusyJournal } from './transform/journal'
import { transformOrganization, type BusyOrganization } from './transform/organization'
import { transformTaxRate, type BusyTaxRate } from './transform/taxrate'
import { transformTransaction, type BusyTransaction } from './transform/transaction'
import { transformExpense, untransformExpense, type BusyExpense } from './transform/expense'
import {
  transformCreditMemo,
  untransformCreditMemo,
  type BusyCreditMemo,
} from './transform/creditmemo'
import { transformOrder, untransformOrder, type BusyOrder } from './transform/order'
import {
  transformSalesOrder,
  untransformSalesOrder,
  type BusySalesOrder,
} from './transform/salesorder'
import {
  transformPurchaseOrder,
  untransformPurchaseOrder,
  type BusyPurchaseOrder,
} from './transform/purchaseorder'

interface PagedResponse<T> {
  data: T[]
  total?: number
  page?: number
  pageSize?: number
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class BusyAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'busy'
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
      page: params.page ?? 1,
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      ...(params.updatedAfter && {
        updatedAfter: params.updatedAfter.toISOString(),
      }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new BusyClient(credentials)
    const raw = await client.get<BusyOrganization>('company')
    return transformOrganization(raw)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new BusyClient(credentials)
    const res = await client.get<PagedResponse<BusyInvoice>>(
      'sales-vouchers',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new BusyClient(credentials)
    const raw = await client.get<BusyInvoice>(`sales-vouchers/${id}`)
    return transformInvoice(raw)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new BusyClient(credentials)
    const raw = await client.post<BusyInvoice>('sales-vouchers', untransformInvoice(data))
    return transformInvoice(raw)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new BusyClient(credentials)
    const res = await client.get<PagedResponse<BusyBill>>(
      'purchase-vouchers',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new BusyClient(credentials)
    const raw = await client.get<BusyBill>(`purchase-vouchers/${id}`)
    return transformBill(raw)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new BusyClient(credentials)
    const raw = await client.post<BusyBill>('purchase-vouchers', untransformBill(data))
    return transformBill(raw)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new BusyClient(credentials)
    const res = await client.get<PagedResponse<BusyContact>>(
      'parties',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new BusyClient(credentials)
    const raw = await client.get<BusyContact>(`parties/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new BusyClient(credentials)
    const raw = await client.post<BusyContact>('parties', {
      AccName: data.name,
      Email: data.emails?.[0]?.email,
      Mobile: data.telephones?.[0]?.telephone,
      GSTNo: data.taxNumber,
      IsCustomer: data.isCustomer ?? true,
      IsSupplier: data.isSupplier ?? false,
      Address: data.billingAddress?.address1,
    })
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new BusyClient(credentials)
    const raw = await client.put<BusyContact>(`parties/${id}`, {
      AccName: data.name,
      Email: data.emails?.[0]?.email,
      Mobile: data.telephones?.[0]?.telephone,
      GSTNo: data.taxNumber,
      Address: data.billingAddress?.address1,
    })
    return transformContact(raw)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new BusyClient(credentials)
    const res = await client.get<PagedResponse<BusyAccount>>(
      'accounts',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new BusyClient(credentials)
    const raw = await client.get<BusyAccount>(`accounts/${id}`)
    return transformAccount(raw)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new BusyClient(credentials)
    const res = await client.get<PagedResponse<BusyJournal>>(
      'journal-vouchers',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new BusyClient(credentials)
    const raw = await client.get<BusyJournal>(`journal-vouchers/${id}`)
    return transformJournal(raw)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new BusyClient(credentials)
    const raw = await client.post<BusyJournal>('journal-vouchers', untransformJournal(data))
    return transformJournal(raw)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new BusyClient(credentials)
    const res = await client.get<PagedResponse<BusyTransaction>>(
      'transactions',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new BusyClient(credentials)
    const raw = await client.get<BusyTransaction>(`transactions/${id}`)
    return transformTransaction(raw)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new BusyClient(credentials)
    const res = await client.get<PagedResponse<BusyTaxRate>>(
      'tax-rates',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new BusyClient(credentials)
    const raw = await client.get<BusyTaxRate>(`tax-rates/${id}`)
    return transformTaxRate(raw)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new BusyClient(credentials)
    const res = await client.get<PagedResponse<BusyExpense>>(
      'expense-vouchers',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new BusyClient(credentials)
    const raw = await client.get<BusyExpense>(`expense-vouchers/${id}`)
    return transformExpense(raw)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new BusyClient(credentials)
    const raw = await client.post<BusyExpense>('expense-vouchers', untransformExpense(data))
    return transformExpense(raw)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new BusyClient(credentials)
    const res = await client.get<PagedResponse<BusyCreditMemo>>(
      'debit-notes',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new BusyClient(credentials)
    const raw = await client.get<BusyCreditMemo>(`debit-notes/${id}`)
    return transformCreditMemo(raw)
  }

  async createCreditMemo(
    credentials: Credentials,
    data: Partial<CreditMemo>,
  ): Promise<CreditMemo> {
    const client = new BusyClient(credentials)
    const raw = await client.post<BusyCreditMemo>('debit-notes', untransformCreditMemo(data))
    return transformCreditMemo(raw)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new BusyClient(credentials)
    const res = await client.get<PagedResponse<BusyOrder>>(
      'orders',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new BusyClient(credentials)
    const raw = await client.get<BusyOrder>(`orders/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new BusyClient(credentials)
    const raw = await client.post<BusyOrder>('orders', untransformOrder(data))
    return transformOrder(raw)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new BusyClient(credentials)
    const res = await client.get<PagedResponse<BusySalesOrder>>(
      'sales-orders',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new BusyClient(credentials)
    const raw = await client.get<BusySalesOrder>(`sales-orders/${id}`)
    return transformSalesOrder(raw)
  }

  async createSalesOrder(
    credentials: Credentials,
    data: Partial<SalesOrder>,
  ): Promise<SalesOrder> {
    const client = new BusyClient(credentials)
    const raw = await client.post<BusySalesOrder>('sales-orders', untransformSalesOrder(data))
    return transformSalesOrder(raw)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new BusyClient(credentials)
    const res = await client.get<PagedResponse<BusyPurchaseOrder>>(
      'purchase-orders',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new BusyClient(credentials)
    const raw = await client.get<BusyPurchaseOrder>(`purchase-orders/${id}`)
    return transformPurchaseOrder(raw)
  }

  async createPurchaseOrder(
    credentials: Credentials,
    data: Partial<PurchaseOrder>,
  ): Promise<PurchaseOrder> {
    const client = new BusyClient(credentials)
    const raw = await client.post<BusyPurchaseOrder>('purchase-orders', untransformPurchaseOrder(data))
    return transformPurchaseOrder(raw)
  }
}
