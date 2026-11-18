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
import { MasteraccountingClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type MasteraccountingInvoice } from './transform/invoice'
import { transformBill, type MasteraccountingBill } from './transform/bill'
import { transformContact, type MasteraccountingContact } from './transform/contact'
import { transformAccount, type MasteraccountingAccount } from './transform/account'
import { transformJournal, type MasteraccountingJournal } from './transform/journal'
import { transformTransaction, type MasteraccountingTransaction } from './transform/transaction'
import { transformTaxRate, type MasteraccountingTaxRate } from './transform/taxrate'
import { transformExpense, type MasteraccountingExpense } from './transform/expense'
import { transformCreditMemo, type MasteraccountingCreditMemo } from './transform/creditmemo'
import { transformOrder, type MasteraccountingOrder } from './transform/order'
import { transformSalesOrder, type MasteraccountingSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type MasteraccountingPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type MasteraccountingOrganization } from './transform/organization'

interface MasteraccountingAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class MasteraccountingAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'masteraccounting'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: MasteraccountingAdapterConfig) {
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

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<MasteraccountingOrganization | { data: MasteraccountingOrganization }>('organization')
    const raw = (res as { data: MasteraccountingOrganization }).data ?? (res as MasteraccountingOrganization)
    return transformOrganization(raw)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingInvoice[] } | MasteraccountingInvoice[]>('invoices', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: MasteraccountingInvoice[] }).data ?? (res as MasteraccountingInvoice[]) ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingInvoice } | MasteraccountingInvoice>(`invoices/${id}`)
    const raw = (res as { data: MasteraccountingInvoice }).data ?? (res as MasteraccountingInvoice)
    return transformInvoice(raw)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingBill[] } | MasteraccountingBill[]>('bills', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: MasteraccountingBill[] }).data ?? (res as MasteraccountingBill[]) ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingBill } | MasteraccountingBill>(`bills/${id}`)
    const raw = (res as { data: MasteraccountingBill }).data ?? (res as MasteraccountingBill)
    return transformBill(raw)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingContact[] } | MasteraccountingContact[]>('contacts', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: MasteraccountingContact[] }).data ?? (res as MasteraccountingContact[]) ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingContact } | MasteraccountingContact>(`contacts/${id}`)
    const raw = (res as { data: MasteraccountingContact }).data ?? (res as MasteraccountingContact)
    return transformContact(raw)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingAccount[] } | MasteraccountingAccount[]>('accounts', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: MasteraccountingAccount[] }).data ?? (res as MasteraccountingAccount[]) ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingAccount } | MasteraccountingAccount>(`accounts/${id}`)
    const raw = (res as { data: MasteraccountingAccount }).data ?? (res as MasteraccountingAccount)
    return transformAccount(raw)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingJournal[] } | MasteraccountingJournal[]>('journals', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: MasteraccountingJournal[] }).data ?? (res as MasteraccountingJournal[]) ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingJournal } | MasteraccountingJournal>(`journals/${id}`)
    const raw = (res as { data: MasteraccountingJournal }).data ?? (res as MasteraccountingJournal)
    return transformJournal(raw)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingTransaction[] } | MasteraccountingTransaction[]>('transactions', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: MasteraccountingTransaction[] }).data ?? (res as MasteraccountingTransaction[]) ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingTransaction } | MasteraccountingTransaction>(`transactions/${id}`)
    const raw = (res as { data: MasteraccountingTransaction }).data ?? (res as MasteraccountingTransaction)
    return transformTransaction(raw)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingTaxRate[] } | MasteraccountingTaxRate[]>('taxrates', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: MasteraccountingTaxRate[] }).data ?? (res as MasteraccountingTaxRate[]) ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingTaxRate } | MasteraccountingTaxRate>(`taxrates/${id}`)
    const raw = (res as { data: MasteraccountingTaxRate }).data ?? (res as MasteraccountingTaxRate)
    return transformTaxRate(raw)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingExpense[] } | MasteraccountingExpense[]>('expenses', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: MasteraccountingExpense[] }).data ?? (res as MasteraccountingExpense[]) ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingExpense } | MasteraccountingExpense>(`expenses/${id}`)
    const raw = (res as { data: MasteraccountingExpense }).data ?? (res as MasteraccountingExpense)
    return transformExpense(raw)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingCreditMemo[] } | MasteraccountingCreditMemo[]>('creditmemos', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: MasteraccountingCreditMemo[] }).data ?? (res as MasteraccountingCreditMemo[]) ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingCreditMemo } | MasteraccountingCreditMemo>(`creditmemos/${id}`)
    const raw = (res as { data: MasteraccountingCreditMemo }).data ?? (res as MasteraccountingCreditMemo)
    return transformCreditMemo(raw)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingOrder[] } | MasteraccountingOrder[]>('orders', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: MasteraccountingOrder[] }).data ?? (res as MasteraccountingOrder[]) ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingOrder } | MasteraccountingOrder>(`orders/${id}`)
    const raw = (res as { data: MasteraccountingOrder }).data ?? (res as MasteraccountingOrder)
    return transformOrder(raw)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingSalesOrder[] } | MasteraccountingSalesOrder[]>('salesorders', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: MasteraccountingSalesOrder[] }).data ?? (res as MasteraccountingSalesOrder[]) ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingSalesOrder } | MasteraccountingSalesOrder>(`salesorders/${id}`)
    const raw = (res as { data: MasteraccountingSalesOrder }).data ?? (res as MasteraccountingSalesOrder)
    return transformSalesOrder(raw)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingPurchaseOrder[] } | MasteraccountingPurchaseOrder[]>('purchaseorders', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: MasteraccountingPurchaseOrder[] }).data ?? (res as MasteraccountingPurchaseOrder[]) ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new MasteraccountingClient(credentials)
    const res = await client.get<{ data: MasteraccountingPurchaseOrder } | MasteraccountingPurchaseOrder>(`purchaseorders/${id}`)
    const raw = (res as { data: MasteraccountingPurchaseOrder }).data ?? (res as MasteraccountingPurchaseOrder)
    return transformPurchaseOrder(raw)
  }
}
