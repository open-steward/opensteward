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
import { HorizonErpClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformInvoice,
  untransformInvoice,
  type HorizonErpInvoice,
} from './transform/invoice'
import { transformBill, untransformBill, type HorizonErpBill } from './transform/bill'
import { transformContact, type HorizonErpContact } from './transform/contact'
import { transformAccount, type HorizonErpAccount } from './transform/account'
import {
  transformJournal,
  untransformJournal,
  type HorizonErpJournal,
} from './transform/journal'
import {
  transformOrganization,
  type HorizonErpOrganization,
} from './transform/organization'
import { transformTaxRate, type HorizonErpTaxRate } from './transform/taxrate'
import { transformTransaction, type HorizonErpTransaction } from './transform/transaction'
import {
  transformExpense,
  untransformExpense,
  type HorizonErpExpense,
} from './transform/expense'
import {
  transformCreditMemo,
  untransformCreditMemo,
  type HorizonErpCreditMemo,
} from './transform/creditmemo'
import { transformOrder, untransformOrder, type HorizonErpOrder } from './transform/order'
import {
  transformSalesOrder,
  untransformSalesOrder,
  type HorizonErpSalesOrder,
} from './transform/salesorder'
import {
  transformPurchaseOrder,
  untransformPurchaseOrder,
  type HorizonErpPurchaseOrder,
} from './transform/purchaseorder'

interface PagedResponse<T> {
  data: T[]
  total?: number
  page?: number
  per_page?: number
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class HorizonErpAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'horizonerp'
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
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      ...(params.updatedAfter && {
        updated_after: params.updatedAfter.toISOString(),
      }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new HorizonErpClient(credentials)
    const raw = await client.get<HorizonErpOrganization>('company')
    return transformOrganization(raw)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new HorizonErpClient(credentials)
    const res = await client.get<PagedResponse<HorizonErpInvoice>>(
      'invoices',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new HorizonErpClient(credentials)
    const raw = await client.get<HorizonErpInvoice>(`invoices/${id}`)
    return transformInvoice(raw)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new HorizonErpClient(credentials)
    const raw = await client.post<HorizonErpInvoice>('invoices', untransformInvoice(data))
    return transformInvoice(raw)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new HorizonErpClient(credentials)
    const res = await client.get<PagedResponse<HorizonErpBill>>(
      'purchase_invoices',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new HorizonErpClient(credentials)
    const raw = await client.get<HorizonErpBill>(`purchase_invoices/${id}`)
    return transformBill(raw)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new HorizonErpClient(credentials)
    const raw = await client.post<HorizonErpBill>('purchase_invoices', untransformBill(data))
    return transformBill(raw)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new HorizonErpClient(credentials)
    const [custRes, supplRes] = await Promise.all([
      client.get<PagedResponse<HorizonErpContact>>('customers', this.paginationParams(params)),
      client.get<PagedResponse<HorizonErpContact>>('suppliers', this.paginationParams(params)),
    ])
    return [
      ...(custRes.data ?? []).map(transformContact),
      ...(supplRes.data ?? []).map(transformContact),
    ]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new HorizonErpClient(credentials)
    const raw = await client.get<HorizonErpContact>(`customers/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new HorizonErpClient(credentials)
    const endpoint = data.isSupplier && !data.isCustomer ? 'suppliers' : 'customers'
    const raw = await client.post<HorizonErpContact>(endpoint, {
      name: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      gstin: data.taxNumber,
      customer: data.isCustomer ?? true,
      supplier: data.isSupplier ?? false,
      address: data.billingAddress?.address1,
    })
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new HorizonErpClient(credentials)
    const raw = await client.put<HorizonErpContact>(`customers/${id}`, {
      name: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      gstin: data.taxNumber,
      address: data.billingAddress?.address1,
    })
    return transformContact(raw)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new HorizonErpClient(credentials)
    const res = await client.get<PagedResponse<HorizonErpAccount>>(
      'accounts',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new HorizonErpClient(credentials)
    const raw = await client.get<HorizonErpAccount>(`accounts/${id}`)
    return transformAccount(raw)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new HorizonErpClient(credentials)
    const res = await client.get<PagedResponse<HorizonErpJournal>>(
      'journal_entries',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new HorizonErpClient(credentials)
    const raw = await client.get<HorizonErpJournal>(`journal_entries/${id}`)
    return transformJournal(raw)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new HorizonErpClient(credentials)
    const raw = await client.post<HorizonErpJournal>('journal_entries', untransformJournal(data))
    return transformJournal(raw)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new HorizonErpClient(credentials)
    const res = await client.get<PagedResponse<HorizonErpTransaction>>(
      'transactions',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new HorizonErpClient(credentials)
    const raw = await client.get<HorizonErpTransaction>(`transactions/${id}`)
    return transformTransaction(raw)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new HorizonErpClient(credentials)
    const res = await client.get<PagedResponse<HorizonErpTaxRate>>(
      'tax_rates',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new HorizonErpClient(credentials)
    const raw = await client.get<HorizonErpTaxRate>(`tax_rates/${id}`)
    return transformTaxRate(raw)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new HorizonErpClient(credentials)
    const res = await client.get<PagedResponse<HorizonErpExpense>>(
      'expenses',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new HorizonErpClient(credentials)
    const raw = await client.get<HorizonErpExpense>(`expenses/${id}`)
    return transformExpense(raw)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new HorizonErpClient(credentials)
    const raw = await client.post<HorizonErpExpense>('expenses', untransformExpense(data))
    return transformExpense(raw)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new HorizonErpClient(credentials)
    const res = await client.get<PagedResponse<HorizonErpCreditMemo>>(
      'credit_notes',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new HorizonErpClient(credentials)
    const raw = await client.get<HorizonErpCreditMemo>(`credit_notes/${id}`)
    return transformCreditMemo(raw)
  }

  async createCreditMemo(
    credentials: Credentials,
    data: Partial<CreditMemo>,
  ): Promise<CreditMemo> {
    const client = new HorizonErpClient(credentials)
    const raw = await client.post<HorizonErpCreditMemo>(
      'credit_notes',
      untransformCreditMemo(data),
    )
    return transformCreditMemo(raw)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new HorizonErpClient(credentials)
    const res = await client.get<PagedResponse<HorizonErpOrder>>(
      'orders',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new HorizonErpClient(credentials)
    const raw = await client.get<HorizonErpOrder>(`orders/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new HorizonErpClient(credentials)
    const raw = await client.post<HorizonErpOrder>('orders', untransformOrder(data))
    return transformOrder(raw)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new HorizonErpClient(credentials)
    const res = await client.get<PagedResponse<HorizonErpSalesOrder>>(
      'sales_orders',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new HorizonErpClient(credentials)
    const raw = await client.get<HorizonErpSalesOrder>(`sales_orders/${id}`)
    return transformSalesOrder(raw)
  }

  async createSalesOrder(
    credentials: Credentials,
    data: Partial<SalesOrder>,
  ): Promise<SalesOrder> {
    const client = new HorizonErpClient(credentials)
    const raw = await client.post<HorizonErpSalesOrder>(
      'sales_orders',
      untransformSalesOrder(data),
    )
    return transformSalesOrder(raw)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new HorizonErpClient(credentials)
    const res = await client.get<PagedResponse<HorizonErpPurchaseOrder>>(
      'purchase_orders',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new HorizonErpClient(credentials)
    const raw = await client.get<HorizonErpPurchaseOrder>(`purchase_orders/${id}`)
    return transformPurchaseOrder(raw)
  }

  async createPurchaseOrder(
    credentials: Credentials,
    data: Partial<PurchaseOrder>,
  ): Promise<PurchaseOrder> {
    const client = new HorizonErpClient(credentials)
    const raw = await client.post<HorizonErpPurchaseOrder>(
      'purchase_orders',
      untransformPurchaseOrder(data),
    )
    return transformPurchaseOrder(raw)
  }
}
