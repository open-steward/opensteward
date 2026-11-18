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
import { GustoClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type GustoInvoice } from './transform/invoice'
import { transformBill, type GustoBill } from './transform/bill'
import { transformContact, type GustoContact } from './transform/contact'
import { transformAccount, type GustoAccount } from './transform/account'
import { transformJournal, type GustoJournal } from './transform/journal'
import { transformOrganization, type GustoOrganization } from './transform/organization'
import { transformTransaction, type GustoTransaction } from './transform/transaction'
import { transformTaxRate, type GustoTaxRate } from './transform/taxrate'
import { transformExpense, type GustoExpense } from './transform/expense'
import { transformCreditMemo, type GustoCreditMemo } from './transform/creditmemo'
import { transformOrder, type GustoOrder } from './transform/order'
import { transformSalesOrder, type GustoSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type GustoPurchaseOrder } from './transform/purchaseorder'

interface GustoAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class GustoAdapter implements AccountingAdapter {
  readonly platform = 'gusto'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: GustoAdapterConfig) {
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
      page: params.page ?? 1,
      per: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      ...(params.updatedAfter && { updated_since: params.updatedAfter.toISOString() }),
    }
  }

  // companyId is stored in credentials.tenantId after OAuth2 flow
  private companyId(credentials: Credentials): string {
    return credentials.tenantId ?? ''
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new GustoClient(credentials)
    const companyId = this.companyId(credentials)
    const res = await client.get<GustoOrganization>(`companies/${companyId}`)
    return transformOrganization(res)
  }

  // --- Invoices (Payroll Runs) ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new GustoClient(credentials)
    const companyId = this.companyId(credentials)
    const res = await client.get<GustoInvoice[]>(`companies/${companyId}/payrolls`, this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new GustoClient(credentials)
    const companyId = this.companyId(credentials)
    const res = await client.get<GustoInvoice>(`companies/${companyId}/payrolls/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new GustoClient(credentials)
    const companyId = this.companyId(credentials)
    const res = await client.get<GustoBill[]>(`companies/${companyId}/contractor_payments`, this.paginationParams(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new GustoClient(credentials)
    const companyId = this.companyId(credentials)
    const res = await client.get<GustoBill>(`companies/${companyId}/contractor_payments/${id}`)
    return transformBill(res)
  }

  // --- Contacts (Employees) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new GustoClient(credentials)
    const companyId = this.companyId(credentials)
    const res = await client.get<GustoContact[]>(`companies/${companyId}/employees`, this.paginationParams(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new GustoClient(credentials)
    const res = await client.get<GustoContact>(`employees/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new GustoClient(credentials)
    const res = await client.get<GustoAccount[]>('accounts', this.paginationParams(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new GustoClient(credentials)
    const res = await client.get<GustoAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new GustoClient(credentials)
    const res = await client.get<GustoJournal[]>('journal_entries', this.paginationParams(params))
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new GustoClient(credentials)
    const res = await client.get<GustoJournal>(`journal_entries/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new GustoClient(credentials)
    const res = await client.get<GustoTransaction[]>('transactions', this.paginationParams(params))
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new GustoClient(credentials)
    const res = await client.get<GustoTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new GustoClient(credentials)
    const res = await client.get<GustoTaxRate[]>('tax_rates', this.paginationParams(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new GustoClient(credentials)
    const res = await client.get<GustoTaxRate>(`tax_rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new GustoClient(credentials)
    const res = await client.get<GustoExpense[]>('expenses', this.paginationParams(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new GustoClient(credentials)
    const res = await client.get<GustoExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new GustoClient(credentials)
    const res = await client.get<GustoCreditMemo[]>('credit_memos', this.paginationParams(params))
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new GustoClient(credentials)
    const res = await client.get<GustoCreditMemo>(`credit_memos/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new GustoClient(credentials)
    const res = await client.get<GustoOrder[]>('orders', this.paginationParams(params))
    return (res ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new GustoClient(credentials)
    const res = await client.get<GustoOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new GustoClient(credentials)
    const res = await client.get<GustoSalesOrder[]>('sales_orders', this.paginationParams(params))
    return (res ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new GustoClient(credentials)
    const res = await client.get<GustoSalesOrder>(`sales_orders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new GustoClient(credentials)
    const res = await client.get<GustoPurchaseOrder[]>('purchase_orders', this.paginationParams(params))
    return (res ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new GustoClient(credentials)
    const res = await client.get<GustoPurchaseOrder>(`purchase_orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
