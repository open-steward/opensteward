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
import { SilverfinClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type SilverfinInvoice } from './transform/invoice'
import { transformBill, type SilverfinBill } from './transform/bill'
import { transformContact, type SilverfinContact } from './transform/contact'
import { transformAccount, type SilverfinAccount } from './transform/account'
import { transformJournal, type SilverfinJournal } from './transform/journal'
import { transformOrganization, type SilverfinOrganization } from './transform/organization'
import { transformExpense, type SilverfinExpense } from './transform/expense'
import { transformTaxRate, type SilverfinTaxRate } from './transform/taxrate'
import { transformTransaction, type SilverfinTransaction } from './transform/transaction'
import { transformCreditMemo, type SilverfinCreditMemo } from './transform/creditmemo'
import { transformOrder, type SilverfinOrder } from './transform/order'
import { transformSalesOrder, type SilverfinSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type SilverfinPurchaseOrder } from './transform/purchaseorder'

interface SilverfinAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class SilverfinAdapter implements AccountingAdapter {
  readonly platform = 'silverfin'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: SilverfinAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, (overrideScopes ?? this.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string, extra?: Record<string, string>): Promise<Credentials> {
    // firm_id is returned in the OAuth2 redirect query params and must be passed here
    const firmId = extra?.['firm_id'] ?? ''
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri, firmId)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    const firmId = (credentials.extra?.['firmId'] as string) ?? ''
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret, firmId)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
      ...(params.updatedAfter && { updated_after: params.updatedAfter.toISOString() }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<SilverfinOrganization>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<{ data: SilverfinInvoice[] }>('invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<SilverfinInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<{ data: SilverfinBill[] }>('bills', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<SilverfinBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<{ data: SilverfinContact[] }>('contacts', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<SilverfinContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<{ data: SilverfinAccount[] }>('accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<SilverfinAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<{ data: SilverfinJournal[] }>('journal_entries', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<SilverfinJournal>(`journal_entries/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<{ data: SilverfinTransaction[] }>('transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<SilverfinTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<{ data: SilverfinTaxRate[] }>('tax_rates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<SilverfinTaxRate>(`tax_rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<{ data: SilverfinExpense[] }>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<SilverfinExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<{ data: SilverfinCreditMemo[] }>('credit_notes', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<SilverfinCreditMemo>(`credit_notes/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<{ data: SilverfinOrder[] }>('orders', this.paginationParams(params))
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<SilverfinOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<{ data: SilverfinSalesOrder[] }>('sales_orders', this.paginationParams(params))
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<SilverfinSalesOrder>(`sales_orders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<{ data: SilverfinPurchaseOrder[] }>('purchase_orders', this.paginationParams(params))
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new SilverfinClient(credentials)
    const res = await client.get<SilverfinPurchaseOrder>(`purchase_orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
