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

import { CREDENTIAL_FORM, buildAuthUrl, exchangeCode, refreshCredentials as refreshCreds } from './auth'
import { MaxioClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type MaxioInvoice } from './transform/invoice'
import { transformBill, type MaxioBill } from './transform/bill'
import { transformContact, type MaxioCustomer } from './transform/contact'
import { transformAccount, type MaxioAccount } from './transform/account'
import { transformJournal, type MaxioJournalEntry } from './transform/journal'
import { transformOrganization, type MaxioOrganization } from './transform/organization'
import { transformTransaction, type MaxioTransaction } from './transform/transaction'
import { transformTaxRate, type MaxioTaxRate } from './transform/taxrate'
import { transformExpense, type MaxioExpense } from './transform/expense'
import { transformCreditMemo, type MaxioCreditNote } from './transform/creditmemo'
import { transformOrder, type MaxioOrder } from './transform/order'
import { transformSalesOrder, type MaxioSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type MaxioPurchaseOrder } from './transform/purchaseorder'

interface MaxioAdapterConfig {
  apiKey?: string
  subdomain?: string
}


export class MaxioAdapter implements AccountingAdapter {

  // Connect Link support — per-customer form (see ./auth.ts).

  credentialFields = CREDENTIAL_FORM.credentialFields

  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'maxio'
  readonly version = '0.1.0'

  private apiKey: string
  private subdomain: string

  constructor(config: MaxioAdapterConfig = {}) {
    this.apiKey = config.apiKey ?? ''
    this.subdomain = config.subdomain ?? ''
  }

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCreds(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  /**
   * Key and site come from the connection (the Connect Link form stores
   * `extra.subdomain`); deployment-level config is only a fallback for
   * connections created without them.
   */
  private client(credentials: Credentials): MaxioClient {
    const stored = credentials.extra?.['subdomain']
    const subdomain = typeof stored === 'string' && stored ? stored : this.subdomain
    const accessToken = credentials.accessToken || this.apiKey
    return new MaxioClient({ ...credentials, accessToken }, subdomain)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const res = await this.client(credentials).get<MaxioOrganization>('portal.json')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const res = await this.client(credentials).get<{ invoices: MaxioInvoice[] }>('invoices.json', this.paginationParams(params))
    return (res.invoices ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).get<{ invoice: MaxioInvoice }>(`invoices/${id}.json`)
    return transformInvoice(res.invoice)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const res = await this.client(credentials).post<{ invoice: MaxioInvoice }>('invoices.json', {
      invoice: untransformInvoice(data),
    })
    return transformInvoice(res.invoice)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const res = await this.client(credentials).get<{ bills: MaxioBill[] }>('bills.json', this.paginationParams(params))
    return (res.bills ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const res = await this.client(credentials).get<{ bill: MaxioBill }>(`bills/${id}.json`)
    return transformBill(res.bill)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<MaxioCustomer[]>('customers.json', this.paginationParams(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<{ customer: MaxioCustomer }>(`customers/${id}.json`)
    return transformContact(res.customer)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const res = await this.client(credentials).get<MaxioAccount[]>('accounts.json', this.paginationParams(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const res = await this.client(credentials).get<{ account: MaxioAccount }>(`accounts/${id}.json`)
    return transformAccount(res.account)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const res = await this.client(credentials).get<MaxioJournalEntry[]>('journal_entries.json', this.paginationParams(params))
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const res = await this.client(credentials).get<MaxioJournalEntry>(`journal_entries/${id}.json`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const res = await this.client(credentials).get<Array<{ transaction: MaxioTransaction }>>('transactions.json', this.paginationParams(params))
    return (res ?? []).map((item) => transformTransaction(item.transaction ?? item as unknown as MaxioTransaction))
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const res = await this.client(credentials).get<{ transaction: MaxioTransaction }>(`transactions/${id}.json`)
    return transformTransaction(res.transaction)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const res = await this.client(credentials).get<MaxioTaxRate[]>('tax_configurations.json', this.paginationParams(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const res = await this.client(credentials).get<MaxioTaxRate>(`tax_configurations/${id}.json`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const res = await this.client(credentials).get<MaxioExpense[]>('expenses.json', this.paginationParams(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const res = await this.client(credentials).get<MaxioExpense>(`expenses/${id}.json`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const res = await this.client(credentials).get<{ credit_notes: MaxioCreditNote[] }>('credit_notes.json', this.paginationParams(params))
    return (res.credit_notes ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const res = await this.client(credentials).get<{ credit_note: MaxioCreditNote }>(`credit_notes/${id}.json`)
    return transformCreditMemo(res.credit_note)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.client(credentials).get<MaxioOrder[]>('orders.json', this.paginationParams(params))
    return (res ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<MaxioOrder>(`orders/${id}.json`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const res = await this.client(credentials).get<MaxioSalesOrder[]>('sales_orders.json', this.paginationParams(params))
    return (res ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const res = await this.client(credentials).get<MaxioSalesOrder>(`sales_orders/${id}.json`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<MaxioPurchaseOrder[]>('purchase_orders.json', this.paginationParams(params))
    return (res ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<MaxioPurchaseOrder>(`purchase_orders/${id}.json`)
    return transformPurchaseOrder(res)
  }
}
