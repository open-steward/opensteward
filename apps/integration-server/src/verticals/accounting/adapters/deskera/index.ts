import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Organization } from '../../schema/organization'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { DeskeraClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type DeskeraInvoice } from './transform/invoice'
import { transformBill, type DeskeraBill } from './transform/bill'
import { transformContact, type DeskeraContact } from './transform/contact'
import { transformAccount, type DeskeraAccount } from './transform/account'
import { transformJournal, type DeskeraJournal } from './transform/journal'
import { transformOrganization, type DeskeraOrganization } from './transform/organization'
import { transformTransaction, type DeskeraTransaction } from './transform/transaction'
import { transformTaxRate, type DeskeraTaxCode } from './transform/taxrate'
import { transformExpense, type DeskeraExpense } from './transform/expense'
import { transformCreditMemo, type DeskeraCreditMemo } from './transform/creditmemo'
import { transformOrder, type DeskeraOrder } from './transform/order'
import { transformSalesOrder, type DeskeraSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type DeskeraPurchaseOrder } from './transform/purchaseorder'

interface DeskeraAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

interface DeskeraPagedResponse<T> {
  data?: T[]
  content?: T[]
  totalElements?: number
  totalPages?: number
}

export class DeskeraAdapter implements AccountingAdapter {
  readonly platform = 'deskera'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: DeskeraAdapterConfig) {
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
      page: params.page ?? 0,
      ...(params.updatedAfter && {
        updatedAfter: params.updatedAfter.toISOString(),
      }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraOrganization>('iam/companies/brief')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraPagedResponse<DeskeraInvoice>>(
      'invoice/sales',
      this.paginationParams(params),
    )
    return (res.content ?? res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraInvoice>(`invoice/sales/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraPagedResponse<DeskeraBill>>(
      'invoice/purchase',
      this.paginationParams(params),
    )
    return (res.content ?? res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraBill>(`invoice/purchase/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraPagedResponse<DeskeraContact>>(
      'contacts',
      this.paginationParams(params),
    )
    return (res.content ?? res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraPagedResponse<DeskeraAccount>>(
      'Account',
      this.paginationParams(params),
    )
    return (res.content ?? res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraAccount>(`Account/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraPagedResponse<DeskeraJournal>>(
      'journalentries',
      this.paginationParams(params),
    )
    return (res.content ?? res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraJournal>(`journalentries/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraPagedResponse<DeskeraTransaction>>(
      'bankaccounts/transactions',
      this.paginationParams(params),
    )
    return (res.content ?? res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraTransaction>(`bankaccounts/transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraPagedResponse<DeskeraTaxCode>>(
      'taxes',
      this.paginationParams(params),
    )
    return (res.content ?? res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraTaxCode>(`taxes/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraPagedResponse<DeskeraExpense>>(
      'expense-reports',
      this.paginationParams(params),
    )
    return (res.content ?? res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraExpense>(`expense-reports/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraPagedResponse<DeskeraCreditMemo>>(
      'creditnotes',
      this.paginationParams(params),
    )
    return (res.content ?? res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraCreditMemo>(`creditnotes/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraPagedResponse<DeskeraOrder>>(
      'Quotations',
      this.paginationParams(params),
    )
    return (res.content ?? res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraOrder>(`Quotations/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraPagedResponse<DeskeraSalesOrder>>(
      'Quotations',
      this.paginationParams(params),
    )
    return (res.content ?? res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraSalesOrder>(`Quotations/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraPagedResponse<DeskeraPurchaseOrder>>(
      'orders/purchase',
      this.paginationParams(params),
    )
    return (res.content ?? res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new DeskeraClient(credentials)
    const res = await client.get<DeskeraPurchaseOrder>(`orders/purchase/${id}`)
    return transformPurchaseOrder(res)
  }
}
