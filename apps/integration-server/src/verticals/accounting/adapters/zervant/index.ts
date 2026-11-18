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
import { ZervantClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type ZervantInvoice } from './transform/invoice'
import { transformContact, type ZervantContact } from './transform/contact'
import { transformAccount, type ZervantAccount } from './transform/account'
import { transformOrganization, type ZervantOrganization } from './transform/organization'
import { transformBill, type ZervantBill } from './transform/bill'
import { transformTaxRate, type ZervantTaxRate } from './transform/taxrate'
import { transformJournal, untransformJournal, type ZervantJournal } from './transform/journal'
import { transformTransaction, type ZervantTransaction } from './transform/transaction'
import { transformExpense, type ZervantExpense } from './transform/expense'
import { transformCreditMemo, type ZervantCreditMemo } from './transform/creditmemo'
import { transformOrder, type ZervantOrder } from './transform/order'
import { transformSalesOrder, type ZervantSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type ZervantPurchaseOrder } from './transform/purchaseorder'

interface ZervantAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class ZervantAdapter implements AccountingAdapter {
  readonly platform = 'zervant'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ZervantAdapterConfig) {
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
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantOrganization>('organization')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantInvoice[]>('invoices', this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new ZervantClient(credentials)
    const res = await client.post<ZervantInvoice>('invoices', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new ZervantClient(credentials)
    const res = await client.put<ZervantInvoice>(`invoices/${id}`, untransformInvoice(data))
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantBill[]>('bills', this.paginationParams(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantContact[]>('contacts', this.paginationParams(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new ZervantClient(credentials)
    const res = await client.post<ZervantContact>('contacts', {
      name: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      businessId: data.identification,
      isCustomer: data.isCustomer,
      isSupplier: data.isSupplier,
      address: data.billingAddress
        ? {
            street: data.billingAddress.address1,
            city: data.billingAddress.city,
            zipCode: data.billingAddress.postalCode,
            countryCode: data.billingAddress.country,
          }
        : undefined,
    })
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new ZervantClient(credentials)
    const res = await client.put<ZervantContact>(`contacts/${id}`, {
      name: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      businessId: data.identification,
      address: data.billingAddress
        ? {
            street: data.billingAddress.address1,
            city: data.billingAddress.city,
            zipCode: data.billingAddress.postalCode,
            countryCode: data.billingAddress.country,
          }
        : undefined,
    })
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    const client = new ZervantClient(credentials)
    await client.delete(`contacts/${id}`)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantAccount[]>('accounts', this.paginationParams(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantJournal[]>('journals', this.paginationParams(params))
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new ZervantClient(credentials)
    const res = await client.post<ZervantJournal>('journals', untransformJournal(data))
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantTransaction[]>('transactions', this.paginationParams(params))
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantTaxRate[]>('tax-rates', this.paginationParams(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantTaxRate>(`tax-rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantExpense[]>('expenses', this.paginationParams(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantCreditMemo[]>('credit-memos', this.paginationParams(params))
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantCreditMemo>(`credit-memos/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantOrder[]>('orders', this.paginationParams(params))
    return (res ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantSalesOrder[]>('sales-orders', this.paginationParams(params))
    return (res ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantSalesOrder>(`sales-orders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantPurchaseOrder[]>(
      'purchase-orders',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new ZervantClient(credentials)
    const res = await client.get<ZervantPurchaseOrder>(`purchase-orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
