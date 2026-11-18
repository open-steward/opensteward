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

import { buildAuthUrl, exchangeCode, refreshCredentials } from './auth'
import { FoundationClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type FoundationInvoice } from './transform/invoice'
import { transformBill, type FoundationBill } from './transform/bill'
import { transformContact, type FoundationContact } from './transform/contact'
import { transformAccount, type FoundationAccount } from './transform/account'
import { transformJournal, type FoundationJournal } from './transform/journal'
import { transformOrganization, type FoundationOrganization } from './transform/organization'
import { transformExpense, type FoundationExpense } from './transform/expense'
import { transformTaxRate, type FoundationTaxRate } from './transform/taxrate'
import { transformTransaction, type FoundationTransaction } from './transform/transaction'
import { transformCreditMemo, type FoundationCreditMemo } from './transform/creditmemo'
import { transformOrder, type FoundationOrder } from './transform/order'
import { transformSalesOrder, type FoundationSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type FoundationPurchaseOrder } from './transform/purchaseorder'

interface FoundationAdapterConfig {
  apiKey: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class FoundationAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'foundation'
  readonly version = '0.1.0'

  private apiKey: string

  constructor(config: FoundationAdapterConfig) {
    this.apiKey = config.apiKey
  }

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
      ...(params.updatedAfter && { modifiedAfter: params.updatedAfter.toISOString() }),
    }
  }

  private makeClient(): FoundationClient {
    return new FoundationClient({ accessToken: this.apiKey })
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new FoundationClient(credentials)
    const res = await client.get<FoundationOrganization>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new FoundationClient(credentials)
    const res = await client.get<{ data: FoundationInvoice[] }>('invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new FoundationClient(credentials)
    const res = await client.get<FoundationInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new FoundationClient(credentials)
    const res = await client.get<{ data: FoundationBill[] }>('bills', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new FoundationClient(credentials)
    const res = await client.get<FoundationBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new FoundationClient(credentials)
    const res = await client.get<{ data: FoundationContact[] }>('contacts', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new FoundationClient(credentials)
    const res = await client.get<FoundationContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new FoundationClient(credentials)
    const res = await client.get<{ data: FoundationAccount[] }>('accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new FoundationClient(credentials)
    const res = await client.get<FoundationAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new FoundationClient(credentials)
    const res = await client.get<{ data: FoundationJournal[] }>('journals', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new FoundationClient(credentials)
    const res = await client.get<FoundationJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new FoundationClient(credentials)
    const res = await client.get<{ data: FoundationTransaction[] }>('transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new FoundationClient(credentials)
    const res = await client.get<FoundationTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new FoundationClient(credentials)
    const res = await client.get<{ data: FoundationTaxRate[] }>('taxRates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new FoundationClient(credentials)
    const res = await client.get<FoundationTaxRate>(`taxRates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new FoundationClient(credentials)
    const res = await client.get<{ data: FoundationExpense[] }>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new FoundationClient(credentials)
    const res = await client.get<FoundationExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new FoundationClient(credentials)
    const res = await client.get<{ data: FoundationCreditMemo[] }>('creditMemos', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new FoundationClient(credentials)
    const res = await client.get<FoundationCreditMemo>(`creditMemos/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new FoundationClient(credentials)
    const res = await client.get<{ data: FoundationOrder[] }>('orders', this.paginationParams(params))
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new FoundationClient(credentials)
    const res = await client.get<FoundationOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new FoundationClient(credentials)
    const res = await client.get<{ data: FoundationSalesOrder[] }>('salesOrders', this.paginationParams(params))
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new FoundationClient(credentials)
    const res = await client.get<FoundationSalesOrder>(`salesOrders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new FoundationClient(credentials)
    const res = await client.get<{ data: FoundationPurchaseOrder[] }>('purchaseOrders', this.paginationParams(params))
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new FoundationClient(credentials)
    const res = await client.get<FoundationPurchaseOrder>(`purchaseOrders/${id}`)
    return transformPurchaseOrder(res)
  }
}
