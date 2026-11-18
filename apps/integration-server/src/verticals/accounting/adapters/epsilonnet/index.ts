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
import { EpsilonNetClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type EpsilonNetInvoice } from './transform/invoice'
import { transformBill, type EpsilonNetBill } from './transform/bill'
import { transformContact, type EpsilonNetCounterpart } from './transform/contact'
import { transformAccount, type EpsilonNetAccount } from './transform/account'
import { transformJournal, type EpsilonNetJournal } from './transform/journal'
import { transformOrganization, type EpsilonNetOrganization } from './transform/organization'
import { transformExpense, type EpsilonNetExpense } from './transform/expense'
import { transformTaxRate, type EpsilonNetTaxRate } from './transform/taxrate'
import { transformTransaction, type EpsilonNetTransaction } from './transform/transaction'
import { transformCreditMemo, type EpsilonNetCreditMemo } from './transform/creditmemo'
import { transformOrder, type EpsilonNetOrder } from './transform/order'
import { transformSalesOrder, type EpsilonNetSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type EpsilonNetPurchaseOrder } from './transform/purchaseorder'

interface EpsilonNetAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class EpsilonNetAdapter implements AccountingAdapter {
  readonly platform = 'epsilonnet'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: EpsilonNetAdapterConfig) {
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
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<EpsilonNetOrganization>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<{ data: EpsilonNetInvoice[] }>('invoices', {
      ...this.paginationParams(params),
      invoiceType: 'SalesInvoice,RetailSalesReceipt',
    })
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<EpsilonNetInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills (Purchase Invoices) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<{ data: EpsilonNetBill[] }>('invoices', {
      ...this.paginationParams(params),
      invoiceType: 'PurchaseInvoice',
    })
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<EpsilonNetBill>(`invoices/${id}`)
    return transformBill(res)
  }

  // --- Contacts (Counterparts) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<{ data: EpsilonNetCounterpart[] }>(
      'counterparts',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<EpsilonNetCounterpart>(`counterparts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<{ data: EpsilonNetAccount[] }>(
      'accounts',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<EpsilonNetAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<{ data: EpsilonNetJournal[] }>(
      'journalEntries',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<EpsilonNetJournal>(`journalEntries/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<{ data: EpsilonNetTransaction[] }>(
      'transactions',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<EpsilonNetTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<{ data: EpsilonNetTaxRate[] }>(
      'taxRates',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<EpsilonNetTaxRate>(`taxRates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<{ data: EpsilonNetExpense[] }>(
      'expenses',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<EpsilonNetExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<{ data: EpsilonNetCreditMemo[] }>('invoices', {
      ...this.paginationParams(params),
      invoiceType: 'CreditInvoice',
    })
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<EpsilonNetCreditMemo>(`invoices/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<{ data: EpsilonNetOrder[] }>(
      'orders',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<EpsilonNetOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<{ data: EpsilonNetSalesOrder[] }>(
      'salesOrders',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<EpsilonNetSalesOrder>(`salesOrders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<{ data: EpsilonNetPurchaseOrder[] }>(
      'purchaseOrders',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new EpsilonNetClient(credentials)
    const res = await client.get<EpsilonNetPurchaseOrder>(`purchaseOrders/${id}`)
    return transformPurchaseOrder(res)
  }
}
