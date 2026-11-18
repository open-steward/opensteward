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
import { FocusSoftnetClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformInvoice,
  untransformInvoice,
  type FocusSoftnetInvoice,
} from './transform/invoice'
import { transformBill, untransformBill, type FocusSoftnetBill } from './transform/bill'
import { transformContact, type FocusSoftnetContact } from './transform/contact'
import { transformAccount, type FocusSoftnetAccount } from './transform/account'
import {
  transformJournal,
  untransformJournal,
  type FocusSoftnetJournal,
} from './transform/journal'
import {
  transformOrganization,
  type FocusSoftnetOrganization,
} from './transform/organization'
import { transformTaxRate, type FocusSoftnetTaxRate } from './transform/taxrate'
import { transformTransaction, type FocusSoftnetTransaction } from './transform/transaction'
import {
  transformExpense,
  untransformExpense,
  type FocusSoftnetExpense,
} from './transform/expense'
import {
  transformCreditMemo,
  untransformCreditMemo,
  type FocusSoftnetCreditMemo,
} from './transform/creditmemo'
import { transformOrder, untransformOrder, type FocusSoftnetOrder } from './transform/order'
import {
  transformSalesOrder,
  untransformSalesOrder,
  type FocusSoftnetSalesOrder,
} from './transform/salesorder'
import {
  transformPurchaseOrder,
  untransformPurchaseOrder,
  type FocusSoftnetPurchaseOrder,
} from './transform/purchaseorder'

interface PagedResponse<T> {
  data: T[]
  total?: number
  page?: number
  pageSize?: number
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class FocusSoftnetAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'focussoftnet'
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
    const client = new FocusSoftnetClient(credentials)
    const raw = await client.get<FocusSoftnetOrganization>('company')
    return transformOrganization(raw)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new FocusSoftnetClient(credentials)
    const res = await client.get<PagedResponse<FocusSoftnetInvoice>>(
      'invoices',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new FocusSoftnetClient(credentials)
    const raw = await client.get<FocusSoftnetInvoice>(`invoices/${id}`)
    return transformInvoice(raw)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new FocusSoftnetClient(credentials)
    const raw = await client.post<FocusSoftnetInvoice>('invoices', untransformInvoice(data))
    return transformInvoice(raw)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new FocusSoftnetClient(credentials)
    const res = await client.get<PagedResponse<FocusSoftnetBill>>(
      'purchase_invoices',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new FocusSoftnetClient(credentials)
    const raw = await client.get<FocusSoftnetBill>(`purchase_invoices/${id}`)
    return transformBill(raw)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new FocusSoftnetClient(credentials)
    const raw = await client.post<FocusSoftnetBill>('purchase_invoices', untransformBill(data))
    return transformBill(raw)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new FocusSoftnetClient(credentials)
    const [custRes, supplRes] = await Promise.all([
      client.get<PagedResponse<FocusSoftnetContact>>('customers', this.paginationParams(params)),
      client.get<PagedResponse<FocusSoftnetContact>>('suppliers', this.paginationParams(params)),
    ])
    return [
      ...(custRes.data ?? []).map(transformContact),
      ...(supplRes.data ?? []).map(transformContact),
    ]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new FocusSoftnetClient(credentials)
    const raw = await client.get<FocusSoftnetContact>(`customers/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new FocusSoftnetClient(credentials)
    const endpoint = data.isSupplier && !data.isCustomer ? 'suppliers' : 'customers'
    const raw = await client.post<FocusSoftnetContact>(endpoint, {
      AccName: data.name,
      Email: data.emails?.[0]?.email,
      Phone: data.telephones?.[0]?.telephone,
      TaxRegNo: data.taxNumber,
      IsCustomer: data.isCustomer ?? true,
      IsSupplier: data.isSupplier ?? false,
    })
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new FocusSoftnetClient(credentials)
    const raw = await client.put<FocusSoftnetContact>(`customers/${id}`, {
      AccName: data.name,
      Email: data.emails?.[0]?.email,
      Phone: data.telephones?.[0]?.telephone,
      TaxRegNo: data.taxNumber,
    })
    return transformContact(raw)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new FocusSoftnetClient(credentials)
    const res = await client.get<PagedResponse<FocusSoftnetAccount>>(
      'accounts',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new FocusSoftnetClient(credentials)
    const raw = await client.get<FocusSoftnetAccount>(`accounts/${id}`)
    return transformAccount(raw)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new FocusSoftnetClient(credentials)
    const res = await client.get<PagedResponse<FocusSoftnetJournal>>(
      'journal_entries',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new FocusSoftnetClient(credentials)
    const raw = await client.get<FocusSoftnetJournal>(`journal_entries/${id}`)
    return transformJournal(raw)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new FocusSoftnetClient(credentials)
    const raw = await client.post<FocusSoftnetJournal>('journal_entries', untransformJournal(data))
    return transformJournal(raw)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new FocusSoftnetClient(credentials)
    const res = await client.get<PagedResponse<FocusSoftnetTransaction>>(
      'transactions',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new FocusSoftnetClient(credentials)
    const raw = await client.get<FocusSoftnetTransaction>(`transactions/${id}`)
    return transformTransaction(raw)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new FocusSoftnetClient(credentials)
    const res = await client.get<PagedResponse<FocusSoftnetTaxRate>>(
      'tax_codes',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new FocusSoftnetClient(credentials)
    const raw = await client.get<FocusSoftnetTaxRate>(`tax_codes/${id}`)
    return transformTaxRate(raw)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new FocusSoftnetClient(credentials)
    const res = await client.get<PagedResponse<FocusSoftnetExpense>>(
      'expenses',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new FocusSoftnetClient(credentials)
    const raw = await client.get<FocusSoftnetExpense>(`expenses/${id}`)
    return transformExpense(raw)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new FocusSoftnetClient(credentials)
    const raw = await client.post<FocusSoftnetExpense>('expenses', untransformExpense(data))
    return transformExpense(raw)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new FocusSoftnetClient(credentials)
    const res = await client.get<PagedResponse<FocusSoftnetCreditMemo>>(
      'credit_notes',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new FocusSoftnetClient(credentials)
    const raw = await client.get<FocusSoftnetCreditMemo>(`credit_notes/${id}`)
    return transformCreditMemo(raw)
  }

  async createCreditMemo(
    credentials: Credentials,
    data: Partial<CreditMemo>,
  ): Promise<CreditMemo> {
    const client = new FocusSoftnetClient(credentials)
    const raw = await client.post<FocusSoftnetCreditMemo>(
      'credit_notes',
      untransformCreditMemo(data),
    )
    return transformCreditMemo(raw)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new FocusSoftnetClient(credentials)
    const res = await client.get<PagedResponse<FocusSoftnetOrder>>(
      'orders',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new FocusSoftnetClient(credentials)
    const raw = await client.get<FocusSoftnetOrder>(`orders/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new FocusSoftnetClient(credentials)
    const raw = await client.post<FocusSoftnetOrder>('orders', untransformOrder(data))
    return transformOrder(raw)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new FocusSoftnetClient(credentials)
    const res = await client.get<PagedResponse<FocusSoftnetSalesOrder>>(
      'sales_orders',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new FocusSoftnetClient(credentials)
    const raw = await client.get<FocusSoftnetSalesOrder>(`sales_orders/${id}`)
    return transformSalesOrder(raw)
  }

  async createSalesOrder(
    credentials: Credentials,
    data: Partial<SalesOrder>,
  ): Promise<SalesOrder> {
    const client = new FocusSoftnetClient(credentials)
    const raw = await client.post<FocusSoftnetSalesOrder>(
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
    const client = new FocusSoftnetClient(credentials)
    const res = await client.get<PagedResponse<FocusSoftnetPurchaseOrder>>(
      'purchase_orders',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new FocusSoftnetClient(credentials)
    const raw = await client.get<FocusSoftnetPurchaseOrder>(`purchase_orders/${id}`)
    return transformPurchaseOrder(raw)
  }

  async createPurchaseOrder(
    credentials: Credentials,
    data: Partial<PurchaseOrder>,
  ): Promise<PurchaseOrder> {
    const client = new FocusSoftnetClient(credentials)
    const raw = await client.post<FocusSoftnetPurchaseOrder>(
      'purchase_orders',
      untransformPurchaseOrder(data),
    )
    return transformPurchaseOrder(raw)
  }
}
