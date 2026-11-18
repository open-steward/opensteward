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
import type { Organization } from '../../schema/organization'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { ParasutClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type ParasutInvoice } from './transform/invoice'
import { transformBill, type ParasutBill } from './transform/bill'
import { transformContact, type ParasutContact } from './transform/contact'
import { transformAccount, type ParasutAccount } from './transform/account'
import { transformJournal, type ParasutJournal } from './transform/journal'
import { transformOrganization, type ParasutMe } from './transform/organization'
import { transformTransaction, type ParasutTransaction } from './transform/transaction'
import { getStaticTaxRates } from './transform/taxrate'
import { transformExpense, type ParasutExpense } from './transform/expense'
import { transformCreditMemo, type ParasutCreditMemo } from './transform/creditmemo'
import { transformOrder, type ParasutOrder } from './transform/order'
import { transformSalesOrder, type ParasutSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type ParasutPurchaseOrder } from './transform/purchaseorder'

interface ParasutAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

interface ParasutListResponse<T> {
  data: T[]
  meta?: {
    current_page?: number
    total_pages?: number
    total_count?: number
  }
}

interface ParasutSingleResponse<T> {
  data: T
}

export class ParasutAdapter implements AccountingAdapter {
  readonly platform = 'parasut'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ParasutAdapterConfig) {
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
      'page[size]': Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      'page[number]': params.page ?? 1,
      ...(params.updatedAfter && {
        filter: { updated_at_gte: params.updatedAfter.toISOString() },
      }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutSingleResponse<ParasutMe>>('me')
    return transformOrganization(res.data)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutListResponse<ParasutInvoice>>(
      'sales_invoices',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutSingleResponse<ParasutInvoice>>(`sales_invoices/${id}`)
    return transformInvoice(res.data)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutListResponse<ParasutBill>>(
      'purchase_invoices',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutSingleResponse<ParasutBill>>(`purchase_invoices/${id}`)
    return transformBill(res.data)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutListResponse<ParasutContact>>(
      'contacts',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutSingleResponse<ParasutContact>>(`contacts/${id}`)
    return transformContact(res.data)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutListResponse<ParasutAccount>>(
      'accounts',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutSingleResponse<ParasutAccount>>(`accounts/${id}`)
    return transformAccount(res.data)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutListResponse<ParasutJournal>>(
      'ledger_entries',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutSingleResponse<ParasutJournal>>(`ledger_entries/${id}`)
    return transformJournal(res.data)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutListResponse<ParasutTransaction>>(
      'transactions',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutSingleResponse<ParasutTransaction>>(`transactions/${id}`)
    return transformTransaction(res.data)
  }

  // --- Tax Rates ---

  async listTaxRates(_credentials: Credentials, _params: QueryParams): Promise<TaxRate[]> {
    return getStaticTaxRates()
  }

  async getTaxRate(_credentials: Credentials, id: string): Promise<TaxRate> {
    const rates = getStaticTaxRates()
    const found = rates.find((r) => r.id === id)
    if (!found) throw new Error(`TaxRate not found: ${id}`)
    return found
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutListResponse<ParasutExpense>>(
      'salaries',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutSingleResponse<ParasutExpense>>(`salaries/${id}`)
    return transformExpense(res.data)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutListResponse<ParasutCreditMemo>>(
      'e_archives',
      { ...this.paginationParams(params), filter: { item_type: 'refund' } },
    )
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutSingleResponse<ParasutCreditMemo>>(`e_archives/${id}`)
    return transformCreditMemo(res.data)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutListResponse<ParasutOrder>>(
      'sales_invoices',
      { ...this.paginationParams(params), filter: { item_type: 'estimate' } },
    )
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutSingleResponse<ParasutOrder>>(`sales_invoices/${id}`)
    return transformOrder(res.data)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutListResponse<ParasutSalesOrder>>(
      'sales_invoices',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutSingleResponse<ParasutSalesOrder>>(`sales_invoices/${id}`)
    return transformSalesOrder(res.data)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutListResponse<ParasutPurchaseOrder>>(
      'purchase_invoices',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new ParasutClient(credentials)
    const res = await client.get<ParasutSingleResponse<ParasutPurchaseOrder>>(`purchase_invoices/${id}`)
    return transformPurchaseOrder(res.data)
  }
}
