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

import { CREDENTIAL_FORM, buildAuthUrl, exchangeCode, refreshCredentials } from './auth'
import { ManagerioClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformInvoice,
  untransformInvoice,
  type ManagerioInvoice,
} from './transform/invoice'
import { transformBill, untransformBill, type ManagerioBill } from './transform/bill'
import { transformContact, type ManagerioContact } from './transform/contact'
import { transformAccount, type ManagerioAccount } from './transform/account'
import {
  transformJournal,
  untransformJournal,
  type ManagerioJournal,
} from './transform/journal'
import {
  transformOrganization,
  type ManagerioOrganization,
} from './transform/organization'
import { transformTaxRate, type ManagerioTaxRate } from './transform/taxrate'
import { transformTransaction, type ManagerioTransaction } from './transform/transaction'
import {
  transformExpense,
  untransformExpense,
  type ManagerioExpense,
} from './transform/expense'
import {
  transformCreditMemo,
  untransformCreditMemo,
  type ManagerioCreditMemo,
} from './transform/creditmemo'
import { transformOrder, untransformOrder, type ManagerioOrder } from './transform/order'
import {
  transformSalesOrder,
  untransformSalesOrder,
  type ManagerioSalesOrder,
} from './transform/salesorder'
import {
  transformPurchaseOrder,
  untransformPurchaseOrder,
  type ManagerioPurchaseOrder,
} from './transform/purchaseorder'

export interface ManagerioAdapterConfig {
  instanceUrl?: string
}


export class ManagerioAdapter implements AccountingAdapter {

  // Connect Link support — per-customer form (see ./auth.ts).

  credentialFields = CREDENTIAL_FORM.credentialFields

  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'managerio'
  readonly version = '0.1.0'

  private instanceUrl: string

  constructor(config: ManagerioAdapterConfig = {}) {
    this.instanceUrl = config.instanceUrl ?? ''
  }

  getAuthUrl(_state: string): string {
    return buildAuthUrl(this.instanceUrl)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    return {
      from: (page - 1) * limit,
      count: limit,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const raw = await client.get<ManagerioOrganization>('business')
    return transformOrganization(raw)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const res = await client.get<ManagerioInvoice[]>('sales-invoices', this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const raw = await client.get<ManagerioInvoice>(`sales-invoices/${id}`)
    return transformInvoice(raw)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const raw = await client.post<ManagerioInvoice>('sales-invoices', untransformInvoice(data))
    return transformInvoice(raw)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const res = await client.get<ManagerioBill[]>('purchase-invoices', this.paginationParams(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const raw = await client.get<ManagerioBill>(`purchase-invoices/${id}`)
    return transformBill(raw)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const raw = await client.post<ManagerioBill>('purchase-invoices', untransformBill(data))
    return transformBill(raw)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const [custRes, supplRes] = await Promise.all([
      client.get<ManagerioContact[]>('customers', this.paginationParams(params)),
      client.get<ManagerioContact[]>('suppliers', this.paginationParams(params)),
    ])
    return [
      ...(custRes ?? []).map((c) => transformContact(c, true)),
      ...(supplRes ?? []).map((c) => transformContact(c, false)),
    ]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const raw = await client.get<ManagerioContact>(`customers/${id}`)
    return transformContact(raw, true)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const endpoint = data.isSupplier && !data.isCustomer ? 'suppliers' : 'customers'
    const isCustomer = !(data.isSupplier && !data.isCustomer)
    const raw = await client.post<ManagerioContact>(endpoint, {
      Name: data.name,
      Email: data.emails?.[0]?.email,
      Phone: data.telephones?.[0]?.telephone,
      TaxCode: data.taxNumber,
      BillingAddress: data.billingAddress
        ? {
            Line1: data.billingAddress.address1,
            Line2: data.billingAddress.address2,
            City: data.billingAddress.city,
            State: data.billingAddress.region,
            PostalCode: data.billingAddress.postalCode,
            Country: data.billingAddress.country,
          }
        : undefined,
    })
    return transformContact(raw, isCustomer)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const raw = await client.put<ManagerioContact>(`customers/${id}`, {
      Name: data.name,
      Email: data.emails?.[0]?.email,
      Phone: data.telephones?.[0]?.telephone,
    })
    return transformContact(raw, true)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const res = await client.get<ManagerioAccount[]>('chart-of-accounts', this.paginationParams(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const raw = await client.get<ManagerioAccount>(`chart-of-accounts/${id}`)
    return transformAccount(raw)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const res = await client.get<ManagerioJournal[]>('journal-entries', this.paginationParams(params))
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const raw = await client.get<ManagerioJournal>(`journal-entries/${id}`)
    return transformJournal(raw)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const raw = await client.post<ManagerioJournal>('journal-entries', untransformJournal(data))
    return transformJournal(raw)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const res = await client.get<ManagerioTransaction[]>('bank-transactions', this.paginationParams(params))
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const raw = await client.get<ManagerioTransaction>(`bank-transactions/${id}`)
    return transformTransaction(raw)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const res = await client.get<ManagerioTaxRate[]>('tax-codes', this.paginationParams(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const raw = await client.get<ManagerioTaxRate>(`tax-codes/${id}`)
    return transformTaxRate(raw)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const res = await client.get<ManagerioExpense[]>('expense-claims', this.paginationParams(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const raw = await client.get<ManagerioExpense>(`expense-claims/${id}`)
    return transformExpense(raw)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const raw = await client.post<ManagerioExpense>('expense-claims', untransformExpense(data))
    return transformExpense(raw)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const res = await client.get<ManagerioCreditMemo[]>('credit-notes', this.paginationParams(params))
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const raw = await client.get<ManagerioCreditMemo>(`credit-notes/${id}`)
    return transformCreditMemo(raw)
  }

  async createCreditMemo(
    credentials: Credentials,
    data: Partial<CreditMemo>,
  ): Promise<CreditMemo> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const raw = await client.post<ManagerioCreditMemo>('credit-notes', untransformCreditMemo(data))
    return transformCreditMemo(raw)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const res = await client.get<ManagerioOrder[]>('orders', this.paginationParams(params))
    return (res ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const raw = await client.get<ManagerioOrder>(`orders/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const raw = await client.post<ManagerioOrder>('orders', untransformOrder(data))
    return transformOrder(raw)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const res = await client.get<ManagerioSalesOrder[]>('sales-orders', this.paginationParams(params))
    return (res ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const raw = await client.get<ManagerioSalesOrder>(`sales-orders/${id}`)
    return transformSalesOrder(raw)
  }

  async createSalesOrder(
    credentials: Credentials,
    data: Partial<SalesOrder>,
  ): Promise<SalesOrder> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const raw = await client.post<ManagerioSalesOrder>('sales-orders', untransformSalesOrder(data))
    return transformSalesOrder(raw)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const res = await client.get<ManagerioPurchaseOrder[]>('purchase-orders', this.paginationParams(params))
    return (res ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const raw = await client.get<ManagerioPurchaseOrder>(`purchase-orders/${id}`)
    return transformPurchaseOrder(raw)
  }

  async createPurchaseOrder(
    credentials: Credentials,
    data: Partial<PurchaseOrder>,
  ): Promise<PurchaseOrder> {
    const client = new ManagerioClient(credentials, this.instanceUrl)
    const raw = await client.post<ManagerioPurchaseOrder>('purchase-orders', untransformPurchaseOrder(data))
    return transformPurchaseOrder(raw)
  }
}
