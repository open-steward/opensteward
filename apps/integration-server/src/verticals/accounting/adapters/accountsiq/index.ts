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
import { AccountsIQClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type AccountsIQInvoice } from './transform/invoice'
import { transformBill, type AccountsIQBill } from './transform/bill'
import { transformContact, type AccountsIQContact } from './transform/contact'
import { transformAccount, type AccountsIQAccount } from './transform/account'
import { transformJournal, type AccountsIQJournal } from './transform/journal'
import { transformOrganization, type AccountsIQOrganization } from './transform/organization'
import { transformExpense, type AccountsIQExpense } from './transform/expense'
import { transformTaxRate, type AccountsIQTaxRate } from './transform/taxrate'
import { transformTransaction, type AccountsIQTransaction } from './transform/transaction'
import { transformCreditMemo, type AccountsIQCreditMemo } from './transform/creditmemo'
import { transformOrder, type AccountsIQOrder } from './transform/order'
import { transformSalesOrder, type AccountsIQSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type AccountsIQPurchaseOrder } from './transform/purchaseorder'

interface AccountsIQAdapterConfig {
  clientId: string
  clientSecret: string
  // regionCode: the sub-domain region for the AccountsIQ instance (e.g. "eu1", "us1")
  regionCode?: string
  redirectUri?: string
  scopes?: string[]
}

export class AccountsIQAdapter implements AccountingAdapter {
  readonly platform = 'accountsiq'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private regionCode: string | undefined

  constructor(config: AccountsIQAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.regionCode = config.regionCode
  }

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // AccountsIQ does not use an authorization code flow; credentials are exchanged server-side via SOAP
    return exchangeCode(this.clientId, this.clientSecret, this.regionCode ?? '')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    const regionCode = (credentials.extra?.['regionCode'] as string) ?? this.regionCode
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret, regionCode)
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
    const client = new AccountsIQClient(credentials)
    const res = await client.get<AccountsIQOrganization>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<{ data: AccountsIQInvoice[] }>('invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<AccountsIQInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<{ data: AccountsIQBill[] }>('bills', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<AccountsIQBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<{ data: AccountsIQContact[] }>('contacts', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<AccountsIQContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<{ data: AccountsIQAccount[] }>('accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<AccountsIQAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<{ data: AccountsIQJournal[] }>('journals', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<AccountsIQJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<{ data: AccountsIQTransaction[] }>('transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<AccountsIQTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<{ data: AccountsIQTaxRate[] }>('taxRates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<AccountsIQTaxRate>(`taxRates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<{ data: AccountsIQExpense[] }>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<AccountsIQExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<{ data: AccountsIQCreditMemo[] }>('creditNotes', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<AccountsIQCreditMemo>(`creditNotes/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<{ data: AccountsIQOrder[] }>('orders', this.paginationParams(params))
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<AccountsIQOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<{ data: AccountsIQSalesOrder[] }>('salesOrders', this.paginationParams(params))
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<AccountsIQSalesOrder>(`salesOrders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<{ data: AccountsIQPurchaseOrder[] }>('purchaseOrders', this.paginationParams(params))
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new AccountsIQClient(credentials)
    const res = await client.get<AccountsIQPurchaseOrder>(`purchaseOrders/${id}`)
    return transformPurchaseOrder(res)
  }
}
