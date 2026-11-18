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
import { ChanjetClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type ChanjetInvoice } from './transform/invoice'
import { transformBill, type ChanjetBill } from './transform/bill'
import { transformContact, type ChanjetContact } from './transform/contact'
import { transformAccount, type ChanjetAccount } from './transform/account'
import { transformJournal, type ChanjetJournal } from './transform/journal'
import { transformTransaction, type ChanjetTransaction } from './transform/transaction'
import { transformTaxRate, type ChanjetTaxRate } from './transform/taxrate'
import { transformExpense, type ChanjetExpense } from './transform/expense'
import { transformCreditMemo, type ChanjetCreditMemo } from './transform/creditmemo'
import { transformOrder, type ChanjetOrder } from './transform/order'
import { transformSalesOrder, type ChanjetSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type ChanjetPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type ChanjetOrganization } from './transform/organization'

interface ChanjetAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ChanjetAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'chanjet'
  readonly version = '0.1.0'
  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ChanjetAdapterConfig) {
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
    const client = new ChanjetClient(credentials)
    const res = await client.get<ChanjetOrganization>('company')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<{ data: ChanjetInvoice[] } | ChanjetInvoice[]>('invoices', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ChanjetInvoice[] }).data ?? (res as ChanjetInvoice[]) ?? []
    return items.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<ChanjetInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<{ data: ChanjetBill[] } | ChanjetBill[]>('bills', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ChanjetBill[] }).data ?? (res as ChanjetBill[]) ?? []
    return items.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<ChanjetBill>(`bills/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<{ data: ChanjetContact[] } | ChanjetContact[]>('customers', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ChanjetContact[] }).data ?? (res as ChanjetContact[]) ?? []
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<ChanjetContact>(`customers/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<{ data: ChanjetAccount[] } | ChanjetAccount[]>('accounts', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ChanjetAccount[] }).data ?? (res as ChanjetAccount[]) ?? []
    return items.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<ChanjetAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<{ data: ChanjetJournal[] } | ChanjetJournal[]>('journals', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ChanjetJournal[] }).data ?? (res as ChanjetJournal[]) ?? []
    return items.map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<ChanjetJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<{ data: ChanjetTransaction[] } | ChanjetTransaction[]>('transactions', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ChanjetTransaction[] }).data ?? (res as ChanjetTransaction[]) ?? []
    return items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<ChanjetTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<{ data: ChanjetTaxRate[] } | ChanjetTaxRate[]>('taxrates', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ChanjetTaxRate[] }).data ?? (res as ChanjetTaxRate[]) ?? []
    return items.map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<ChanjetTaxRate>(`taxrates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<{ data: ChanjetExpense[] } | ChanjetExpense[]>('expenses', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ChanjetExpense[] }).data ?? (res as ChanjetExpense[]) ?? []
    return items.map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<ChanjetExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<{ data: ChanjetCreditMemo[] } | ChanjetCreditMemo[]>('creditmemos', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ChanjetCreditMemo[] }).data ?? (res as ChanjetCreditMemo[]) ?? []
    return items.map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<ChanjetCreditMemo>(`creditmemos/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<{ data: ChanjetOrder[] } | ChanjetOrder[]>('orders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ChanjetOrder[] }).data ?? (res as ChanjetOrder[]) ?? []
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<ChanjetOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<{ data: ChanjetSalesOrder[] } | ChanjetSalesOrder[]>('salesorders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ChanjetSalesOrder[] }).data ?? (res as ChanjetSalesOrder[]) ?? []
    return items.map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<ChanjetSalesOrder>(`salesorders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<{ data: ChanjetPurchaseOrder[] } | ChanjetPurchaseOrder[]>('purchaseorders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ChanjetPurchaseOrder[] }).data ?? (res as ChanjetPurchaseOrder[]) ?? []
    return items.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new ChanjetClient(credentials)
    const res = await client.get<ChanjetPurchaseOrder>(`purchaseorders/${id}`)
    return transformPurchaseOrder(res)
  }
}
