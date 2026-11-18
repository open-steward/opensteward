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
import { ComarchoptimaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type ComarchoptimaInvoice } from './transform/invoice'
import { transformBill, type ComarchoptimaBill } from './transform/bill'
import { transformContact, type ComarchoptimaContact } from './transform/contact'
import { transformAccount, type ComarchoptimaAccount } from './transform/account'
import { transformJournal, type ComarchoptimaJournal } from './transform/journal'
import { transformTransaction, type ComarchoptimaTransaction } from './transform/transaction'
import { transformTaxRate, type ComarchoptimaTaxRate } from './transform/taxrate'
import { transformExpense, type ComarchoptimaExpense } from './transform/expense'
import { transformCreditMemo, type ComarchoptimaCreditMemo } from './transform/creditmemo'
import { transformOrder, type ComarchoptimaOrder } from './transform/order'
import { transformSalesOrder, type ComarchoptimaSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type ComarchoptimaPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type ComarchoptimaOrganization } from './transform/organization'

interface ComarchoptimaAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ComarchoptimaAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'comarchoptima'
  readonly version = '0.1.0'
  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ComarchoptimaAdapterConfig) {
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
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<ComarchoptimaOrganization>('organization')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<{ data: ComarchoptimaInvoice[] } | ComarchoptimaInvoice[]>('invoices', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ComarchoptimaInvoice[] }).data ?? (res as ComarchoptimaInvoice[]) ?? []
    return items.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<ComarchoptimaInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<{ data: ComarchoptimaBill[] } | ComarchoptimaBill[]>('bills', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ComarchoptimaBill[] }).data ?? (res as ComarchoptimaBill[]) ?? []
    return items.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<ComarchoptimaBill>(`bills/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<{ data: ComarchoptimaContact[] } | ComarchoptimaContact[]>('contacts', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ComarchoptimaContact[] }).data ?? (res as ComarchoptimaContact[]) ?? []
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<ComarchoptimaContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<{ data: ComarchoptimaAccount[] } | ComarchoptimaAccount[]>('accounts', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ComarchoptimaAccount[] }).data ?? (res as ComarchoptimaAccount[]) ?? []
    return items.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<ComarchoptimaAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<{ data: ComarchoptimaJournal[] } | ComarchoptimaJournal[]>('journals', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ComarchoptimaJournal[] }).data ?? (res as ComarchoptimaJournal[]) ?? []
    return items.map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<ComarchoptimaJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<{ data: ComarchoptimaTransaction[] } | ComarchoptimaTransaction[]>('transactions', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ComarchoptimaTransaction[] }).data ?? (res as ComarchoptimaTransaction[]) ?? []
    return items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<ComarchoptimaTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<{ data: ComarchoptimaTaxRate[] } | ComarchoptimaTaxRate[]>('taxrates', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ComarchoptimaTaxRate[] }).data ?? (res as ComarchoptimaTaxRate[]) ?? []
    return items.map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<ComarchoptimaTaxRate>(`taxrates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<{ data: ComarchoptimaExpense[] } | ComarchoptimaExpense[]>('expenses', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ComarchoptimaExpense[] }).data ?? (res as ComarchoptimaExpense[]) ?? []
    return items.map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<ComarchoptimaExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<{ data: ComarchoptimaCreditMemo[] } | ComarchoptimaCreditMemo[]>('creditmemos', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ComarchoptimaCreditMemo[] }).data ?? (res as ComarchoptimaCreditMemo[]) ?? []
    return items.map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<ComarchoptimaCreditMemo>(`creditmemos/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<{ data: ComarchoptimaOrder[] } | ComarchoptimaOrder[]>('orders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ComarchoptimaOrder[] }).data ?? (res as ComarchoptimaOrder[]) ?? []
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<ComarchoptimaOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<{ data: ComarchoptimaSalesOrder[] } | ComarchoptimaSalesOrder[]>('salesorders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ComarchoptimaSalesOrder[] }).data ?? (res as ComarchoptimaSalesOrder[]) ?? []
    return items.map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<ComarchoptimaSalesOrder>(`salesorders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<{ data: ComarchoptimaPurchaseOrder[] } | ComarchoptimaPurchaseOrder[]>('purchaseorders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: ComarchoptimaPurchaseOrder[] }).data ?? (res as ComarchoptimaPurchaseOrder[]) ?? []
    return items.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new ComarchoptimaClient(credentials)
    const res = await client.get<ComarchoptimaPurchaseOrder>(`purchaseorders/${id}`)
    return transformPurchaseOrder(res)
  }
}
