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
import { AppFolioClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type AppFolioInvoice } from './transform/invoice'
import { transformBill, type AppFolioBill } from './transform/bill'
import { transformContact, type AppFolioContact } from './transform/contact'
import { transformAccount, type AppFolioAccount } from './transform/account'
import { transformJournal, type AppFolioJournal } from './transform/journal'
import { transformOrganization, type AppFolioOrganization } from './transform/organization'
import { transformExpense, type AppFolioExpense } from './transform/expense'
import { transformTaxRate, type AppFolioTaxRate } from './transform/taxrate'
import { transformTransaction, type AppFolioTransaction } from './transform/transaction'
import { transformCreditMemo, type AppFolioCreditMemo } from './transform/creditmemo'
import { transformOrder, type AppFolioOrder } from './transform/order'
import { transformSalesOrder, type AppFolioSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type AppFolioPurchaseOrder } from './transform/purchaseorder'

interface AppFolioAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class AppFolioAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'appfolio'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: AppFolioAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, (overrideScopes ?? this.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    // database must be passed via state or config; here we fall back to env
    const database = process.env['APPFOLIO_DATABASE'] ?? ''
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri, database)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    const refreshed = await refreshAccessToken(
      credentials.refreshToken,
      this.clientId,
      this.clientSecret,
    )
    // Preserve extra (database subdomain) from original credentials
    refreshed.extra = { ...credentials.extra, ...refreshed.extra }
    return refreshed
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
      ...(params.updatedAfter && {
        updated_after: params.updatedAfter.toISOString(),
      }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<AppFolioOrganization>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<{ results: AppFolioInvoice[] }>(
      'invoices',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<AppFolioInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<{ results: AppFolioBill[] }>(
      'bills',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<AppFolioBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts (Tenants/Owners/Vendors) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<{ results: AppFolioContact[] }>(
      'contacts',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<AppFolioContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<{ results: AppFolioAccount[] }>(
      'accounts',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<AppFolioAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<{ results: AppFolioJournal[] }>(
      'journal_entries',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<AppFolioJournal>(`journal_entries/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<{ results: AppFolioTransaction[] }>(
      'transactions',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<AppFolioTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<{ results: AppFolioTaxRate[] }>(
      'tax_rates',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<AppFolioTaxRate>(`tax_rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<{ results: AppFolioExpense[] }>(
      'expenses',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<AppFolioExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<{ results: AppFolioCreditMemo[] }>(
      'credit_memos',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<AppFolioCreditMemo>(`credit_memos/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<{ results: AppFolioOrder[] }>(
      'orders',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<AppFolioOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<{ results: AppFolioSalesOrder[] }>(
      'sales_orders',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<AppFolioSalesOrder>(`sales_orders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<{ results: AppFolioPurchaseOrder[] }>(
      'purchase_orders',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new AppFolioClient(credentials)
    const res = await client.get<AppFolioPurchaseOrder>(`purchase_orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
