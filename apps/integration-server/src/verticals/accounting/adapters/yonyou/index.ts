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
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { YonyouClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type YonyouInvoice } from './transform/invoice'
import { transformBill, type YonyouBill } from './transform/bill'
import { transformContact, type YonyouContact } from './transform/contact'
import { transformAccount, type YonyouAccount } from './transform/account'
import { transformJournal, type YonyouJournal } from './transform/journal'
import { transformTransaction, type YonyouTransaction } from './transform/transaction'
import { transformTaxRate, type YonyouTaxRate } from './transform/taxrate'
import { transformExpense, type YonyouExpense } from './transform/expense'
import { transformCreditMemo, type YonyouCreditMemo } from './transform/creditmemo'
import { transformOrder, type YonyouOrder } from './transform/order'
import { transformSalesOrder, type YonyouSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type YonyouPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type YonyouOrganization } from './transform/organization'

interface YonyouAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class YonyouAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'yonyou'
  readonly version = '0.1.0'
  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: YonyouAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string { return buildAuthUrl(this.clientId, this.redirectUri, (overrideScopes ?? this.scopes), state) }
  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> { return exchangeCode(code, this.clientId, this.clientSecret, redirectUri) }
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new YonyouClient(credentials)
    const res = await client.get<YonyouOrganization>('organization')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new YonyouClient(credentials)
    const res = await client.get<{ data: YonyouInvoice[] } | YonyouInvoice[]>('arinvoices', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: YonyouInvoice[] }).data ?? (res as YonyouInvoice[]) ?? []
    return items.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new YonyouClient(credentials)
    const res = await client.get<YonyouInvoice>(`arinvoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new YonyouClient(credentials)
    const res = await client.get<{ data: YonyouBill[] } | YonyouBill[]>('apinvoices', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: YonyouBill[] }).data ?? (res as YonyouBill[]) ?? []
    return items.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new YonyouClient(credentials)
    const res = await client.get<YonyouBill>(`apinvoices/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new YonyouClient(credentials)
    const res = await client.get<{ data: YonyouContact[] } | YonyouContact[]>('customers', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: YonyouContact[] }).data ?? (res as YonyouContact[]) ?? []
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new YonyouClient(credentials)
    const res = await client.get<YonyouContact>(`customers/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new YonyouClient(credentials)
    const res = await client.get<{ data: YonyouAccount[] } | YonyouAccount[]>('accounts', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: YonyouAccount[] }).data ?? (res as YonyouAccount[]) ?? []
    return items.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new YonyouClient(credentials)
    const res = await client.get<YonyouAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new YonyouClient(credentials)
    const res = await client.get<{ data: YonyouJournal[] } | YonyouJournal[]>('journals', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: YonyouJournal[] }).data ?? (res as YonyouJournal[]) ?? []
    return items.map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new YonyouClient(credentials)
    const res = await client.get<YonyouJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new YonyouClient(credentials)
    const res = await client.get<{ data: YonyouTransaction[] } | YonyouTransaction[]>('transactions', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: YonyouTransaction[] }).data ?? (res as YonyouTransaction[]) ?? []
    return items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new YonyouClient(credentials)
    const res = await client.get<YonyouTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new YonyouClient(credentials)
    const res = await client.get<{ data: YonyouTaxRate[] } | YonyouTaxRate[]>('taxrates', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: YonyouTaxRate[] }).data ?? (res as YonyouTaxRate[]) ?? []
    return items.map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new YonyouClient(credentials)
    const res = await client.get<YonyouTaxRate>(`taxrates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new YonyouClient(credentials)
    const res = await client.get<{ data: YonyouExpense[] } | YonyouExpense[]>('expenses', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: YonyouExpense[] }).data ?? (res as YonyouExpense[]) ?? []
    return items.map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new YonyouClient(credentials)
    const res = await client.get<YonyouExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new YonyouClient(credentials)
    const res = await client.get<{ data: YonyouCreditMemo[] } | YonyouCreditMemo[]>('creditmemos', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: YonyouCreditMemo[] }).data ?? (res as YonyouCreditMemo[]) ?? []
    return items.map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new YonyouClient(credentials)
    const res = await client.get<YonyouCreditMemo>(`creditmemos/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new YonyouClient(credentials)
    const res = await client.get<{ data: YonyouOrder[] } | YonyouOrder[]>('orders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: YonyouOrder[] }).data ?? (res as YonyouOrder[]) ?? []
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new YonyouClient(credentials)
    const res = await client.get<YonyouOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new YonyouClient(credentials)
    const res = await client.get<{ data: YonyouSalesOrder[] } | YonyouSalesOrder[]>('salesorders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: YonyouSalesOrder[] }).data ?? (res as YonyouSalesOrder[]) ?? []
    return items.map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new YonyouClient(credentials)
    const res = await client.get<YonyouSalesOrder>(`salesorders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new YonyouClient(credentials)
    const res = await client.get<{ data: YonyouPurchaseOrder[] } | YonyouPurchaseOrder[]>('purchaseorders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: YonyouPurchaseOrder[] }).data ?? (res as YonyouPurchaseOrder[]) ?? []
    return items.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new YonyouClient(credentials)
    const res = await client.get<YonyouPurchaseOrder>(`purchaseorders/${id}`)
    return transformPurchaseOrder(res)
  }
}
