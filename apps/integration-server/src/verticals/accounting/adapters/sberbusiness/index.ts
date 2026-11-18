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
import { SberbusinessClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type SberbusinessInvoice } from './transform/invoice'
import { transformBill, type SberbusinessBill } from './transform/bill'
import { transformContact, type SberbusinessContact } from './transform/contact'
import { transformAccount, type SberbusinessAccount } from './transform/account'
import { transformJournal, type SberbusinessJournal } from './transform/journal'
import { transformTransaction, type SberbusinessTransaction } from './transform/transaction'
import { transformTaxRate, type SberbusinessTaxRate } from './transform/taxrate'
import { transformExpense, type SberbusinessExpense } from './transform/expense'
import { transformCreditMemo, type SberbusinessCreditMemo } from './transform/creditmemo'
import { transformOrder, type SberbusinessOrder } from './transform/order'
import { transformSalesOrder, type SberbusinessSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type SberbusinessPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type SberbusinessOrganization } from './transform/organization'

interface SberbusinessAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SberbusinessAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'sberbusiness'
  readonly version = '0.1.0'
  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: SberbusinessAdapterConfig) {
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
    const client = new SberbusinessClient(credentials)
    const res = await client.get<SberbusinessOrganization>('organization')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<{ data: SberbusinessInvoice[] } | SberbusinessInvoice[]>('invoices', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: SberbusinessInvoice[] }).data ?? (res as SberbusinessInvoice[]) ?? []
    return items.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<SberbusinessInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<{ data: SberbusinessBill[] } | SberbusinessBill[]>('bills', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: SberbusinessBill[] }).data ?? (res as SberbusinessBill[]) ?? []
    return items.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<SberbusinessBill>(`bills/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<{ data: SberbusinessContact[] } | SberbusinessContact[]>('clients', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: SberbusinessContact[] }).data ?? (res as SberbusinessContact[]) ?? []
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<SberbusinessContact>(`clients/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<{ data: SberbusinessAccount[] } | SberbusinessAccount[]>('accounts', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: SberbusinessAccount[] }).data ?? (res as SberbusinessAccount[]) ?? []
    return items.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<SberbusinessAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<{ data: SberbusinessJournal[] } | SberbusinessJournal[]>('journal', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: SberbusinessJournal[] }).data ?? (res as SberbusinessJournal[]) ?? []
    return items.map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<SberbusinessJournal>(`journal/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<{ data: SberbusinessTransaction[] } | SberbusinessTransaction[]>('transactions', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: SberbusinessTransaction[] }).data ?? (res as SberbusinessTransaction[]) ?? []
    return items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<SberbusinessTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<{ data: SberbusinessTaxRate[] } | SberbusinessTaxRate[]>('taxrates', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: SberbusinessTaxRate[] }).data ?? (res as SberbusinessTaxRate[]) ?? []
    return items.map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<SberbusinessTaxRate>(`taxrates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<{ data: SberbusinessExpense[] } | SberbusinessExpense[]>('expenses', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: SberbusinessExpense[] }).data ?? (res as SberbusinessExpense[]) ?? []
    return items.map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<SberbusinessExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<{ data: SberbusinessCreditMemo[] } | SberbusinessCreditMemo[]>('creditmemos', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: SberbusinessCreditMemo[] }).data ?? (res as SberbusinessCreditMemo[]) ?? []
    return items.map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<SberbusinessCreditMemo>(`creditmemos/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<{ data: SberbusinessOrder[] } | SberbusinessOrder[]>('orders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: SberbusinessOrder[] }).data ?? (res as SberbusinessOrder[]) ?? []
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<SberbusinessOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<{ data: SberbusinessSalesOrder[] } | SberbusinessSalesOrder[]>('salesorders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: SberbusinessSalesOrder[] }).data ?? (res as SberbusinessSalesOrder[]) ?? []
    return items.map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<SberbusinessSalesOrder>(`salesorders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<{ data: SberbusinessPurchaseOrder[] } | SberbusinessPurchaseOrder[]>('purchaseorders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: SberbusinessPurchaseOrder[] }).data ?? (res as SberbusinessPurchaseOrder[]) ?? []
    return items.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new SberbusinessClient(credentials)
    const res = await client.get<SberbusinessPurchaseOrder>(`purchaseorders/${id}`)
    return transformPurchaseOrder(res)
  }
}
