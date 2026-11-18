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
import { JumisClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type JumisInvoice } from './transform/invoice'
import { transformBill, type JumisBill } from './transform/bill'
import { transformContact, type JumisContact } from './transform/contact'
import { transformAccount, type JumisAccount } from './transform/account'
import { transformJournal, type JumisJournal } from './transform/journal'
import { transformTransaction, type JumisTransaction } from './transform/transaction'
import { transformTaxRate, type JumisTaxRate } from './transform/taxrate'
import { transformExpense, type JumisExpense } from './transform/expense'
import { transformCreditMemo, type JumisCreditMemo } from './transform/creditmemo'
import { transformOrder, type JumisOrder } from './transform/order'
import { transformSalesOrder, type JumisSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type JumisPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type JumisOrganization } from './transform/organization'

interface JumisAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class JumisAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'jumis'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: JumisAdapterConfig) {
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
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisOrganization>('organization')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisInvoice[] | { data: JumisInvoice[] }>('invoices', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisBill[] | { data: JumisBill[] }>('bills', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisBill>(`bills/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisContact[] | { data: JumisContact[] }>('contacts', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisAccount[] | { data: JumisAccount[] }>('accounts', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisJournal[] | { data: JumisJournal[] }>('journals', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisTransaction[] | { data: JumisTransaction[] }>('transactions', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisTaxRate[] | { data: JumisTaxRate[] }>('taxrates', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisTaxRate>(`taxrates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisExpense[] | { data: JumisExpense[] }>('expenses', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisCreditMemo[] | { data: JumisCreditMemo[] }>('creditmemos', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisCreditMemo>(`creditmemos/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisOrder[] | { data: JumisOrder[] }>('orders', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisSalesOrder[] | { data: JumisSalesOrder[] }>('salesorders', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisSalesOrder>(`salesorders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisPurchaseOrder[] | { data: JumisPurchaseOrder[] }>('purchaseorders', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new JumisClient(credentials)
    const res = await client.get<JumisPurchaseOrder>(`purchaseorders/${id}`)
    return transformPurchaseOrder(res)
  }
}
