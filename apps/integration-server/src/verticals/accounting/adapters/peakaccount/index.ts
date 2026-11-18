import { toCalendarDate } from '../shared/transform'
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
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { PeakAccountClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type PeakAccountInvoice } from './transform/invoice'
import { transformBill, type PeakAccountBill } from './transform/bill'
import { transformContact, type PeakAccountContact } from './transform/contact'
import { transformAccount, type PeakAccountAccount } from './transform/account'
import { transformJournal, type PeakAccountJournal } from './transform/journal'
import { transformOrganization, type PeakAccountOrganization } from './transform/organization'
import { transformExpense, type PeakAccountExpense } from './transform/expense'
import { transformTaxRate, type PeakAccountTaxRate } from './transform/taxrate'
import { transformTransaction, type PeakAccountTransaction } from './transform/transaction'
import { transformCreditMemo, type PeakAccountCreditMemo } from './transform/creditmemo'
import { transformOrder, type PeakAccountOrder } from './transform/order'
import { transformSalesOrder, type PeakAccountSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type PeakAccountPurchaseOrder } from './transform/purchaseorder'

interface PeakAccountAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class PeakAccountAdapter implements AccountingAdapter {
  readonly platform = 'peakaccount'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: PeakAccountAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, (overrideScopes ?? this.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
      ...(params.updatedAfter && { updated_after: params.updatedAfter.toISOString() }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<PeakAccountOrganization>('organization')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<{ data: PeakAccountInvoice[] }>('invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<PeakAccountInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new PeakAccountClient(credentials)
    const res = await client.post<PeakAccountInvoice>('invoices', {
      contactId: data.contactId,
      currency: data.currency,
      issueDate: toCalendarDate(data.postedAt),
      dueDate: toCalendarDate(data.dueAt),
      items: data.lineItems?.map((li) => ({
        description: li.itemDescription,
        unitPrice: li.unitAmount,
        quantity: li.unitQuantity,
        accountCode: li.accountId,
      })),
    })
    return transformInvoice(res)
  }

  async updateInvoice(credentials: Credentials, id: string, data: Partial<Invoice>): Promise<Invoice> {
    const client = new PeakAccountClient(credentials)
    const res = await client.put<PeakAccountInvoice>(`invoices/${id}`, {
      contactId: data.contactId,
      currency: data.currency,
      issueDate: toCalendarDate(data.postedAt),
      dueDate: toCalendarDate(data.dueAt),
    })
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<{ data: PeakAccountBill[] }>('bills', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<PeakAccountBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<{ data: PeakAccountContact[] }>('contacts', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<PeakAccountContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new PeakAccountClient(credentials)
    const res = await client.post<PeakAccountContact>('contacts', {
      name: data.name,
      type: data.isSupplier && !data.isCustomer ? 'supplier' : 'customer',
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      taxId: data.identification,
    })
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<{ data: PeakAccountAccount[] }>('accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<PeakAccountAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<{ data: PeakAccountJournal[] }>('journals', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<PeakAccountJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<{ data: PeakAccountTransaction[] }>('transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<PeakAccountTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<{ data: PeakAccountTaxRate[] }>('tax-rates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<PeakAccountTaxRate>(`tax-rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<{ data: PeakAccountExpense[] }>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<PeakAccountExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<{ data: PeakAccountCreditMemo[] }>('credit-notes', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<PeakAccountCreditMemo>(`credit-notes/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<{ data: PeakAccountOrder[] }>('orders', this.paginationParams(params))
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<PeakAccountOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<{ data: PeakAccountSalesOrder[] }>('sales-orders', this.paginationParams(params))
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<PeakAccountSalesOrder>(`sales-orders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<{ data: PeakAccountPurchaseOrder[] }>('purchase-orders', this.paginationParams(params))
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new PeakAccountClient(credentials)
    const res = await client.get<PeakAccountPurchaseOrder>(`purchase-orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
