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
import { CertiniaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type CertiniaInvoice } from './transform/invoice'
import { transformBill, type CertiniaBill } from './transform/bill'
import { transformContact, type CertiniaContact } from './transform/contact'
import { transformAccount, type CertiniaAccount } from './transform/account'
import { transformJournal, type CertiniaJournal } from './transform/journal'
import { transformOrganization, type CertiniaOrganization } from './transform/organization'
import { transformExpense, type CertiniaExpense } from './transform/expense'
import { transformTaxRate, type CertiniaTaxRate } from './transform/taxrate'
import { transformTransaction, type CertiniaTransaction } from './transform/transaction'
import { transformCreditMemo, type CertiniaCreditMemo } from './transform/creditmemo'
import { transformOrder, type CertiniaOrder } from './transform/order'
import { transformSalesOrder, type CertiniaSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type CertiniaPurchaseOrder } from './transform/purchaseorder'

interface CertiniaAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class CertiniaAdapter implements AccountingAdapter {
  readonly platform = 'certinia'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: CertiniaAdapterConfig) {
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
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
      ...(params.updatedAfter && { modifiedAfter: params.updatedAfter.toISOString() }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<CertiniaOrganization>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<{ records: CertiniaInvoice[] }>('invoices', this.paginationParams(params))
    return (res.records ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<CertiniaInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<{ records: CertiniaBill[] }>('bills', this.paginationParams(params))
    return (res.records ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<CertiniaBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<{ records: CertiniaContact[] }>('contacts', this.paginationParams(params))
    return (res.records ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<CertiniaContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<{ records: CertiniaAccount[] }>('accounts', this.paginationParams(params))
    return (res.records ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<CertiniaAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<{ records: CertiniaJournal[] }>('journals', this.paginationParams(params))
    return (res.records ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<CertiniaJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<{ records: CertiniaTransaction[] }>('transactions', this.paginationParams(params))
    return (res.records ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<CertiniaTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<{ records: CertiniaTaxRate[] }>('taxRates', this.paginationParams(params))
    return (res.records ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<CertiniaTaxRate>(`taxRates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<{ records: CertiniaExpense[] }>('expenses', this.paginationParams(params))
    return (res.records ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<CertiniaExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<{ records: CertiniaCreditMemo[] }>('creditMemos', this.paginationParams(params))
    return (res.records ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<CertiniaCreditMemo>(`creditMemos/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<{ records: CertiniaOrder[] }>('orders', this.paginationParams(params))
    return (res.records ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<CertiniaOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<{ records: CertiniaSalesOrder[] }>('salesOrders', this.paginationParams(params))
    return (res.records ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<CertiniaSalesOrder>(`salesOrders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<{ records: CertiniaPurchaseOrder[] }>('purchaseOrders', this.paginationParams(params))
    return (res.records ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new CertiniaClient(credentials)
    const res = await client.get<CertiniaPurchaseOrder>(`purchaseOrders/${id}`)
    return transformPurchaseOrder(res)
  }
}
