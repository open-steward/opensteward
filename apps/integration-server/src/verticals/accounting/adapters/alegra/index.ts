import { simpleApiKey } from '@opensteward/shared'
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
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Order } from '../../schema/order'
import type { Organization } from '../../schema/organization'

import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefreshCredentials,
} from './auth'
import { AlegraClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type AlegraInvoice } from './transform/invoice'
import { transformBill, untransformBill, type AlegraBill } from './transform/bill'
import { transformContact, type AlegraContact } from './transform/contact'
import { transformAccount, type AlegraAccount } from './transform/account'
import { transformJournal, untransformJournal, type AlegraJournal } from './transform/journal'
import { transformOrganization, type AlegraCompanyInfo } from './transform/organization'
import { transformTaxRate, type AlegraTaxRate } from './transform/taxrate'
import { transformTransaction, type AlegraTransaction } from './transform/transaction'
import { transformExpense, untransformExpense, type AlegraExpense } from './transform/expense'
import {
  transformCreditMemo,
  untransformCreditMemo,
  type AlegraCreditMemo,
} from './transform/creditmemo'
import { transformOrder, untransformOrder, type AlegraOrder } from './transform/order'
import {
  transformSalesOrder,
  untransformSalesOrder,
  type AlegraSalesOrder,
} from './transform/salesorder'
import {
  transformPurchaseOrder,
  untransformPurchaseOrder,
  type AlegraPurchaseOrder,
} from './transform/purchaseorder'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class AlegraAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'alegra'
  readonly version = '0.1.0'

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
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    return {
      start: (page - 1) * limit,
      limit,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraCompanyInfo>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraInvoice[]>('invoices', this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new AlegraClient(credentials)
    const res = await client.post<AlegraInvoice>('invoices', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new AlegraClient(credentials)
    const res = await client.put<AlegraInvoice>(`invoices/${id}`, untransformInvoice(data))
    return transformInvoice(res)
  }

  async deleteInvoice(credentials: Credentials, id: string): Promise<void> {
    const client = new AlegraClient(credentials)
    await client.delete(`invoices/${id}`)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraBill[]>('bills', this.paginationParams(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraBill>(`bills/${id}`)
    return transformBill(res)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new AlegraClient(credentials)
    const res = await client.post<AlegraBill>('bills', untransformBill(data))
    return transformBill(res)
  }

  async updateBill(credentials: Credentials, id: string, data: Partial<Bill>): Promise<Bill> {
    const client = new AlegraClient(credentials)
    const res = await client.put<AlegraBill>(`bills/${id}`, untransformBill(data))
    return transformBill(res)
  }

  async deleteBill(credentials: Credentials, id: string): Promise<void> {
    const client = new AlegraClient(credentials)
    await client.delete(`bills/${id}`)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraContact[]>('contacts', this.paginationParams(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new AlegraClient(credentials)
    const types: string[] = []
    if (data.isCustomer) types.push('client')
    if (data.isSupplier) types.push('provider')
    if (types.length === 0) types.push('client')

    const res = await client.post<AlegraContact>('contacts', {
      name: data.name,
      identification: data.identification,
      email: data.emails?.[0]?.email,
      phonePrimary: data.telephones?.[0]?.telephone,
      type: types,
      address: data.billingAddress?.address1,
      city: data.billingAddress?.city,
      department: data.billingAddress?.region,
      country: data.billingAddress?.country,
    })
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new AlegraClient(credentials)
    const res = await client.put<AlegraContact>(`contacts/${id}`, {
      name: data.name,
      email: data.emails?.[0]?.email,
      phonePrimary: data.telephones?.[0]?.telephone,
      address: data.billingAddress?.address1,
      city: data.billingAddress?.city,
      department: data.billingAddress?.region,
      country: data.billingAddress?.country,
    })
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    const client = new AlegraClient(credentials)
    await client.delete(`contacts/${id}`)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraAccount[]>('accounts', this.paginationParams(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraJournal[]>(
      'journal-entries',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraJournal>(`journal-entries/${id}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new AlegraClient(credentials)
    const res = await client.post<AlegraJournal>(
      'journal-entries',
      untransformJournal(data),
    )
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraTransaction[]>(
      'payments',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraTransaction>(`payments/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraTaxRate[]>('taxes', this.paginationParams(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraTaxRate>(`taxes/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraExpense[]>('expenses', this.paginationParams(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new AlegraClient(credentials)
    const res = await client.post<AlegraExpense>('expenses', untransformExpense(data))
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<CreditMemo[]> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraCreditMemo[]>(
      'credit-notes',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraCreditMemo>(`credit-notes/${id}`)
    return transformCreditMemo(res)
  }

  async createCreditMemo(
    credentials: Credentials,
    data: Partial<CreditMemo>,
  ): Promise<CreditMemo> {
    const client = new AlegraClient(credentials)
    const res = await client.post<AlegraCreditMemo>(
      'credit-notes',
      untransformCreditMemo(data),
    )
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraOrder[]>('orders', this.paginationParams(params))
    return (res ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new AlegraClient(credentials)
    const res = await client.post<AlegraOrder>('orders', untransformOrder(data))
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<SalesOrder[]> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraSalesOrder[]>(
      'sales-orders',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraSalesOrder>(`sales-orders/${id}`)
    return transformSalesOrder(res)
  }

  async createSalesOrder(
    credentials: Credentials,
    data: Partial<SalesOrder>,
  ): Promise<SalesOrder> {
    const client = new AlegraClient(credentials)
    const res = await client.post<AlegraSalesOrder>(
      'sales-orders',
      untransformSalesOrder(data),
    )
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraPurchaseOrder[]>(
      'purchase-orders',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new AlegraClient(credentials)
    const res = await client.get<AlegraPurchaseOrder>(`purchase-orders/${id}`)
    return transformPurchaseOrder(res)
  }

  async createPurchaseOrder(
    credentials: Credentials,
    data: Partial<PurchaseOrder>,
  ): Promise<PurchaseOrder> {
    const client = new AlegraClient(credentials)
    const res = await client.post<AlegraPurchaseOrder>(
      'purchase-orders',
      untransformPurchaseOrder(data),
    )
    return transformPurchaseOrder(res)
  }
}
