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

import { buildAuthUrl, exchangeCode, refreshCredentials } from './auth'
import { AccounteerClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type AccounteerInvoice } from './transform/invoice'
import { transformBill, type AccounteerBill } from './transform/bill'
import { transformContact, type AccounteerContact } from './transform/contact'
import { transformAccount, type AccounteerAccount } from './transform/account'
import { transformJournal, type AccounteerJournal } from './transform/journal'
import { transformOrganization, type AccounteerBusiness } from './transform/organization'
import { transformTransaction, type AccounteerTransaction } from './transform/transaction'
import { transformTaxRate, type AccounteerTaxRate } from './transform/taxrate'
import { transformExpense, type AccounteerExpense } from './transform/expense'
import { transformCreditMemo, type AccounteerCreditMemo } from './transform/creditmemo'
import { transformOrder, type AccounteerOrder } from './transform/order'
import { transformSalesOrder, type AccounteerSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type AccounteerPurchaseOrder } from './transform/purchaseorder'

interface AccounteerAdapterConfig {
  apiKey: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class AccounteerAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'accounteer'
  readonly version = '0.1.0'

  private readonly apiKey: string

  constructor(config: AccounteerAdapterConfig) {
    this.apiKey = config.apiKey
  }

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  private credentialsFromConfig(): Credentials {
    return { accessToken: this.apiKey }
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  // --- Organization ---

  async getOrganization(_credentials: Credentials): Promise<Organization> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const raw = await client.get<AccounteerBusiness>('business')
    return transformOrganization(raw)
  }

  // --- Invoices ---

  async listInvoices(_credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const res = await client.get<{ data: AccounteerInvoice[] }>('invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(_credentials: Credentials, id: string): Promise<Invoice> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const raw = await client.get<AccounteerInvoice>(`invoices/${id}`)
    return transformInvoice(raw)
  }

  // --- Bills ---

  async listBills(_credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const res = await client.get<{ data: AccounteerBill[] }>('bills', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(_credentials: Credentials, id: string): Promise<Bill> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const raw = await client.get<AccounteerBill>(`bills/${id}`)
    return transformBill(raw)
  }

  // --- Contacts ---

  async listContacts(_credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const res = await client.get<{ data: AccounteerContact[] }>('contacts', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(_credentials: Credentials, id: string): Promise<Contact> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const raw = await client.get<AccounteerContact>(`contacts/${id}`)
    return transformContact(raw)
  }

  // --- Accounts ---

  async listAccounts(_credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const res = await client.get<{ data: AccounteerAccount[] }>('accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(_credentials: Credentials, id: string): Promise<Account> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const raw = await client.get<AccounteerAccount>(`accounts/${id}`)
    return transformAccount(raw)
  }

  // --- Journals ---

  async listJournals(_credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const res = await client.get<{ data: AccounteerJournal[] }>('journals', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(_credentials: Credentials, id: string): Promise<Journal> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const raw = await client.get<AccounteerJournal>(`journals/${id}`)
    return transformJournal(raw)
  }

  // --- Transactions ---

  async listTransactions(_credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const res = await client.get<{ data: AccounteerTransaction[] }>('transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(_credentials: Credentials, id: string): Promise<Transaction> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const raw = await client.get<AccounteerTransaction>(`transactions/${id}`)
    return transformTransaction(raw)
  }

  // --- Tax Rates ---

  async listTaxRates(_credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const res = await client.get<{ data: AccounteerTaxRate[] }>('tax-rates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  // --- Expenses ---

  async listExpenses(_credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const res = await client.get<{ data: AccounteerExpense[] }>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(_credentials: Credentials, id: string): Promise<Expense> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const raw = await client.get<AccounteerExpense>(`expenses/${id}`)
    return transformExpense(raw)
  }

  // --- Credit Memos ---

  async listCreditMemos(_credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const res = await client.get<{ data: AccounteerCreditMemo[] }>('credit-notes', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(_credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const raw = await client.get<AccounteerCreditMemo>(`credit-notes/${id}`)
    return transformCreditMemo(raw)
  }

  // --- Orders ---

  async listOrders(_credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const res = await client.get<{ data: AccounteerOrder[] }>('orders', this.paginationParams(params))
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(_credentials: Credentials, id: string): Promise<Order> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const raw = await client.get<AccounteerOrder>(`orders/${id}`)
    return transformOrder(raw)
  }

  // --- Sales Orders ---

  async listSalesOrders(_credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const res = await client.get<{ data: AccounteerSalesOrder[] }>('sales-orders', this.paginationParams(params))
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(_credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const raw = await client.get<AccounteerSalesOrder>(`sales-orders/${id}`)
    return transformSalesOrder(raw)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(_credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const res = await client.get<{ data: AccounteerPurchaseOrder[] }>('purchase-orders', this.paginationParams(params))
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(_credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new AccounteerClient(this.credentialsFromConfig())
    const raw = await client.get<AccounteerPurchaseOrder>(`purchase-orders/${id}`)
    return transformPurchaseOrder(raw)
  }
}
