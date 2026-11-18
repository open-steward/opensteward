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
import { PohodaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type PohodaInvoice } from './transform/invoice'
import { transformBill, type PohodaBill } from './transform/bill'
import { transformContact, type PohodaContact } from './transform/contact'
import { transformAccount, type PohodaAccount } from './transform/account'
import { transformJournal, type PohodaJournal } from './transform/journal'
import { transformTransaction, type PohodaTransaction } from './transform/transaction'
import { transformTaxRate, type PohodaTaxRate } from './transform/taxrate'
import { transformExpense, type PohodaExpense } from './transform/expense'
import { transformCreditMemo, type PohodaCreditMemo } from './transform/creditmemo'
import { transformOrder, type PohodaOrder } from './transform/order'
import { transformSalesOrder, type PohodaSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type PohodaPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type PohodaOrganization } from './transform/organization'

interface PohodaAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class PohodaAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'pohoda'
  readonly version = '0.1.0'
  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: PohodaAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string { return buildAuthUrl(this.clientId, this.redirectUri, (overrideScopes ?? this.scopes), state) }
  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> { return exchangeCode(code, this.clientId, this.clientSecret, redirectUri) }
  async refreshCredentials(_credentials: Credentials): Promise<Credentials> {
    // mPohoda tokens cannot be refreshed; obtain a new client_credentials token
    return refreshAccessToken(this.clientId, this.clientSecret)
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new PohodaClient(credentials)
    const res = await client.get<PohodaOrganization>('organization')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new PohodaClient(credentials)
    const res = await client.get<{ data: PohodaInvoice[] } | PohodaInvoice[]>('invoices', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: PohodaInvoice[] }).data ?? (res as PohodaInvoice[]) ?? []
    return items.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new PohodaClient(credentials)
    const res = await client.get<PohodaInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new PohodaClient(credentials)
    const res = await client.get<{ data: PohodaBill[] } | PohodaBill[]>('bills', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: PohodaBill[] }).data ?? (res as PohodaBill[]) ?? []
    return items.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new PohodaClient(credentials)
    const res = await client.get<PohodaBill>(`bills/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new PohodaClient(credentials)
    const res = await client.get<{ data: PohodaContact[] } | PohodaContact[]>('contacts', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: PohodaContact[] }).data ?? (res as PohodaContact[]) ?? []
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new PohodaClient(credentials)
    const res = await client.get<PohodaContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new PohodaClient(credentials)
    const res = await client.get<{ data: PohodaAccount[] } | PohodaAccount[]>('accounts', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: PohodaAccount[] }).data ?? (res as PohodaAccount[]) ?? []
    return items.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new PohodaClient(credentials)
    const res = await client.get<PohodaAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new PohodaClient(credentials)
    const res = await client.get<{ data: PohodaJournal[] } | PohodaJournal[]>('journals', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: PohodaJournal[] }).data ?? (res as PohodaJournal[]) ?? []
    return items.map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new PohodaClient(credentials)
    const res = await client.get<PohodaJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new PohodaClient(credentials)
    const res = await client.get<{ data: PohodaTransaction[] } | PohodaTransaction[]>('transactions', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: PohodaTransaction[] }).data ?? (res as PohodaTransaction[]) ?? []
    return items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new PohodaClient(credentials)
    const res = await client.get<PohodaTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new PohodaClient(credentials)
    const res = await client.get<{ data: PohodaTaxRate[] } | PohodaTaxRate[]>('taxrates', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: PohodaTaxRate[] }).data ?? (res as PohodaTaxRate[]) ?? []
    return items.map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new PohodaClient(credentials)
    const res = await client.get<PohodaTaxRate>(`taxrates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new PohodaClient(credentials)
    const res = await client.get<{ data: PohodaExpense[] } | PohodaExpense[]>('expenses', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: PohodaExpense[] }).data ?? (res as PohodaExpense[]) ?? []
    return items.map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new PohodaClient(credentials)
    const res = await client.get<PohodaExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new PohodaClient(credentials)
    const res = await client.get<{ data: PohodaCreditMemo[] } | PohodaCreditMemo[]>('creditmemos', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: PohodaCreditMemo[] }).data ?? (res as PohodaCreditMemo[]) ?? []
    return items.map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new PohodaClient(credentials)
    const res = await client.get<PohodaCreditMemo>(`creditmemos/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new PohodaClient(credentials)
    const res = await client.get<{ data: PohodaOrder[] } | PohodaOrder[]>('orders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: PohodaOrder[] }).data ?? (res as PohodaOrder[]) ?? []
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new PohodaClient(credentials)
    const res = await client.get<PohodaOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new PohodaClient(credentials)
    const res = await client.get<{ data: PohodaSalesOrder[] } | PohodaSalesOrder[]>('salesorders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: PohodaSalesOrder[] }).data ?? (res as PohodaSalesOrder[]) ?? []
    return items.map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new PohodaClient(credentials)
    const res = await client.get<PohodaSalesOrder>(`salesorders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new PohodaClient(credentials)
    const res = await client.get<{ data: PohodaPurchaseOrder[] } | PohodaPurchaseOrder[]>('purchaseorders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: PohodaPurchaseOrder[] }).data ?? (res as PohodaPurchaseOrder[]) ?? []
    return items.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new PohodaClient(credentials)
    const res = await client.get<PohodaPurchaseOrder>(`purchaseorders/${id}`)
    return transformPurchaseOrder(res)
  }
}
