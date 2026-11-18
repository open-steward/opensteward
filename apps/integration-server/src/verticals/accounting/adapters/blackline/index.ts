import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Organization } from '../../schema/organization'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { BlacklineClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type BlacklineInvoice } from './transform/invoice'
import { transformBill, type BlacklineBill } from './transform/bill'
import { transformContact, type BlacklineContact } from './transform/contact'
import { transformAccount, type BlacklineAccount } from './transform/account'
import { transformJournal, type BlacklineJournal } from './transform/journal'
import { transformOrganization, type BlacklineOrganization } from './transform/organization'
import { transformTransaction, type BlacklineTransaction } from './transform/transaction'
import { transformTaxRate, type BlacklineTaxRate } from './transform/taxrate'
import { transformExpense, type BlacklineExpense } from './transform/expense'
import { transformCreditMemo, type BlacklineCreditMemo } from './transform/creditmemo'
import { transformOrder, type BlacklineOrder } from './transform/order'
import { transformSalesOrder, type BlacklineSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type BlacklinePurchaseOrder } from './transform/purchaseorder'

interface BlacklineAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class BlacklineAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'blackline'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: BlacklineAdapterConfig) {
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
    const client = new BlacklineClient(credentials)
    const res = await client.get<BlacklineOrganization>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<{ data: BlacklineInvoice[] }>('reconciliations', {
      ...this.paginationParams(params),
      type: 'Invoice',
    })
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<BlacklineInvoice>(`reconciliations/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<{ data: BlacklineBill[] }>('reconciliations', {
      ...this.paginationParams(params),
      type: 'Bill',
    })
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<BlacklineBill>(`reconciliations/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<{ data: BlacklineContact[] }>(
      'users',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<BlacklineContact>(`users/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<{ data: BlacklineAccount[] }>(
      'accounts',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<BlacklineAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<{ data: BlacklineJournal[] }>(
      'journalEntries',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<BlacklineJournal>(`journalEntries/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<{ data: BlacklineTransaction[] }>(
      'transactions',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<BlacklineTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<{ data: BlacklineTaxRate[] }>(
      'taxRates',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<BlacklineTaxRate>(`taxRates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<{ data: BlacklineExpense[] }>(
      'expenses',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<BlacklineExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<{ data: BlacklineCreditMemo[] }>('reconciliations', {
      ...this.paginationParams(params),
      type: 'CreditMemo',
    })
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<BlacklineCreditMemo>(`reconciliations/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<{ data: BlacklineOrder[] }>(
      'orders',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<BlacklineOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<{ data: BlacklineSalesOrder[] }>(
      'salesOrders',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<BlacklineSalesOrder>(`salesOrders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<{ data: BlacklinePurchaseOrder[] }>(
      'purchaseOrders',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new BlacklineClient(credentials)
    const res = await client.get<BlacklinePurchaseOrder>(`purchaseOrders/${id}`)
    return transformPurchaseOrder(res)
  }
}
