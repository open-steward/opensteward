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

import { buildAuthUrl, exchangeCode as doExchangeCode, refreshAccessToken } from './auth'
import { AccountableClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type AccountableInvoice } from './transform/invoice'
import { transformBill, type AccountableBill } from './transform/bill'
import { transformContact, type AccountableContact } from './transform/contact'
import { transformAccount, type AccountableAccount } from './transform/account'
import { transformJournal, type AccountableJournal } from './transform/journal'
import { transformOrganization, type AccountableOrganization } from './transform/organization'
import { transformExpense, type AccountableExpense } from './transform/expense'
import { transformTaxRate, type AccountableTaxRate } from './transform/taxrate'
import { transformTransaction, type AccountableTransaction } from './transform/transaction'
import { transformCreditMemo, type AccountableCreditMemo } from './transform/creditmemo'
import { transformOrder, type AccountableOrder } from './transform/order'
import { transformSalesOrder, type AccountableSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type AccountablePurchaseOrder } from './transform/purchaseorder'

interface AccountableAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class AccountableAdapter implements AccountingAdapter {
  readonly platform = 'accountable'
  readonly version = '0.1.0'

  constructor(private config: AccountableAdapterConfig) {}

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.config.clientId, this.config.redirectUri, (overrideScopes ?? this.config.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code, this.config.clientId, this.config.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    return refreshAccessToken(credentials.refreshToken, this.config.clientId, this.config.clientSecret)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new AccountableClient(credentials)
    const res = await client.get<AccountableOrganization>('organization')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new AccountableClient(credentials)
    const res = await client.get<{ data: AccountableInvoice[] }>('invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new AccountableClient(credentials)
    const res = await client.get<AccountableInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new AccountableClient(credentials)
    const res = await client.get<{ data: AccountableBill[] }>('bills', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new AccountableClient(credentials)
    const res = await client.get<AccountableBill>(`bills/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new AccountableClient(credentials)
    const res = await client.get<{ data: AccountableContact[] }>('contacts', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new AccountableClient(credentials)
    const res = await client.get<AccountableContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new AccountableClient(credentials)
    const res = await client.get<{ data: AccountableAccount[] }>('accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new AccountableClient(credentials)
    const res = await client.get<AccountableAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new AccountableClient(credentials)
    const res = await client.get<{ data: AccountableJournal[] }>('journals', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new AccountableClient(credentials)
    const res = await client.get<AccountableJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new AccountableClient(credentials)
    const res = await client.get<{ data: AccountableTransaction[] }>('transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new AccountableClient(credentials)
    const res = await client.get<AccountableTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new AccountableClient(credentials)
    const res = await client.get<{ data: AccountableTaxRate[] }>('tax-rates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new AccountableClient(credentials)
    const res = await client.get<AccountableTaxRate>(`tax-rates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new AccountableClient(credentials)
    const res = await client.get<{ data: AccountableExpense[] }>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new AccountableClient(credentials)
    const res = await client.get<AccountableExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new AccountableClient(credentials)
    const res = await client.get<{ data: AccountableCreditMemo[] }>('credit-notes', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new AccountableClient(credentials)
    const res = await client.get<AccountableCreditMemo>(`credit-notes/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new AccountableClient(credentials)
    const res = await client.get<{ data: AccountableOrder[] }>('orders', this.paginationParams(params))
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new AccountableClient(credentials)
    const res = await client.get<AccountableOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new AccountableClient(credentials)
    const res = await client.get<{ data: AccountableSalesOrder[] }>('sales-orders', this.paginationParams(params))
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new AccountableClient(credentials)
    const res = await client.get<AccountableSalesOrder>(`sales-orders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new AccountableClient(credentials)
    const res = await client.get<{ data: AccountablePurchaseOrder[] }>('purchase-orders', this.paginationParams(params))
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new AccountableClient(credentials)
    const res = await client.get<AccountablePurchaseOrder>(`purchase-orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
