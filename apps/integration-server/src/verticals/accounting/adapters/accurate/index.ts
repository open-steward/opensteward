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
import { AccurateClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type AccurateInvoice } from './transform/invoice'
import { transformBill, type AccurateBill } from './transform/bill'
import { transformContact, type AccurateContact } from './transform/contact'
import { transformAccount, type AccurateAccount } from './transform/account'
import { transformJournal, type AccurateJournal } from './transform/journal'
import { transformOrganization, type AccurateCompany } from './transform/organization'
import { transformExpense, type AccurateExpense } from './transform/expense'
import { transformTaxRate, type AccurateTaxRate } from './transform/taxrate'
import { transformTransaction, type AccurateTransaction } from './transform/transaction'
import { transformCreditMemo, type AccurateCreditMemo } from './transform/creditmemo'
import { transformOrder, type AccurateOrder } from './transform/order'
import { transformSalesOrder, type AccurateSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type AccuratePurchaseOrder } from './transform/purchaseorder'

interface AccurateAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

interface AccurateListResponse<T> {
  d: T[]
  total: number
}

export class AccurateAdapter implements AccountingAdapter {
  readonly platform = 'accurate'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: AccurateAdapterConfig) {
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
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateCompany>('company-info.do')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateListResponse<AccurateInvoice>>(
      'sales-invoice/list.do',
      this.paginationParams(params),
    )
    return (res.d ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateInvoice>(`sales-invoice/${id}.do`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateListResponse<AccurateBill>>(
      'purchase-invoice/list.do',
      this.paginationParams(params),
    )
    return (res.d ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateBill>(`purchase-invoice/${id}.do`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateListResponse<AccurateContact>>(
      'customer/list.do',
      this.paginationParams(params),
    )
    return (res.d ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateContact>(`customer/${id}.do`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateListResponse<AccurateAccount>>(
      'coa/list.do',
      this.paginationParams(params),
    )
    return (res.d ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateAccount>(`coa/${id}.do`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateListResponse<AccurateJournal>>(
      'journal-voucher/list.do',
      this.paginationParams(params),
    )
    return (res.d ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateJournal>(`journal-voucher/${id}.do`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateListResponse<AccurateTransaction>>(
      'bank-transaction/list.do',
      this.paginationParams(params),
    )
    return (res.d ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateTransaction>(`bank-transaction/${id}.do`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateListResponse<AccurateTaxRate>>(
      'tax/list.do',
      this.paginationParams(params),
    )
    return (res.d ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateTaxRate>(`tax/${id}.do`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateListResponse<AccurateExpense>>(
      'expense-claim/list.do',
      this.paginationParams(params),
    )
    return (res.d ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateExpense>(`expense-claim/${id}.do`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateListResponse<AccurateCreditMemo>>(
      'credit-memo/list.do',
      this.paginationParams(params),
    )
    return (res.d ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateCreditMemo>(`credit-memo/${id}.do`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateListResponse<AccurateOrder>>(
      'sales-order/list.do',
      this.paginationParams(params),
    )
    return (res.d ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateOrder>(`sales-order/${id}.do`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateListResponse<AccurateSalesOrder>>(
      'sales-order/list.do',
      this.paginationParams(params),
    )
    return (res.d ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateSalesOrder>(`sales-order/${id}.do`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccurateListResponse<AccuratePurchaseOrder>>(
      'purchase-order/list.do',
      this.paginationParams(params),
    )
    return (res.d ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new AccurateClient(credentials)
    const res = await client.get<AccuratePurchaseOrder>(`purchase-order/${id}.do`)
    return transformPurchaseOrder(res)
  }
}
