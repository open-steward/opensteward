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
import type { Organization } from '../../schema/organization'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'

import { getAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefreshCredentials } from './auth'
import { LogoYazilimClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type LogoInvoice } from './transform/invoice'
import { transformBill, type LogoBill } from './transform/bill'
import { transformContact, type LogoContact } from './transform/contact'
import { transformAccount, type LogoAccount } from './transform/account'
import { transformJournal, type LogoJournal } from './transform/journal'
import { transformOrganization, type LogoOrganization } from './transform/organization'
import { transformTransaction, type LogoTransaction } from './transform/transaction'
import { transformTaxRate, type LogoTaxRate } from './transform/taxrate'
import { transformExpense, type LogoExpense } from './transform/expense'
import { transformCreditMemo, type LogoCreditMemo } from './transform/creditmemo'
import { transformOrder, type LogoOrder } from './transform/order'
import { transformSalesOrder, type LogoSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type LogoPurchaseOrder } from './transform/purchaseorder'

interface LogoYazilimAdapterConfig {
  apiKey: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class LogoYazilimAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'logoyazilim'
  readonly version = '0.1.0'

  private apiKey: string

  constructor(config: LogoYazilimAdapterConfig) {
    this.apiKey = config.apiKey
  }

  getAuthUrl(state: string): string {
    return getAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private credentials(): Credentials {
    return { accessToken: this.apiKey }
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      ...(params.updatedAfter && {
        updated_after: params.updatedAfter.toISOString(),
      }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoOrganization>('organization')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoInvoice[]>('invoices', this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoBill[]>('purchase_invoices', this.paginationParams(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoBill>(`purchase_invoices/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoContact[]>('contacts', this.paginationParams(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoAccount[]>('accounts', this.paginationParams(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoJournal[]>('journal_entries', this.paginationParams(params))
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoJournal>(`journal_entries/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoTransaction[]>('transactions', this.paginationParams(params))
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoTaxRate[]>('tax_rates', this.paginationParams(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoTaxRate>(`tax_rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoExpense[]>('expenses', this.paginationParams(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoCreditMemo[]>('credit_memos', this.paginationParams(params))
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoCreditMemo>(`credit_memos/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoOrder[]>('orders', this.paginationParams(params))
    return (res ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoSalesOrder[]>('sales_orders', this.paginationParams(params))
    return (res ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoSalesOrder>(`sales_orders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoPurchaseOrder[]>('purchase_orders', this.paginationParams(params))
    return (res ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new LogoYazilimClient(credentials)
    const res = await client.get<LogoPurchaseOrder>(`purchase_orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
