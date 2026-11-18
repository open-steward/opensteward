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
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Organization } from '../../schema/organization'

import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefreshCredentials,
} from './auth'
import { FinancioClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type FinancioInvoice } from './transform/invoice'
import { transformBill, type FinancioBill } from './transform/bill'
import { transformContact, type FinancioContact } from './transform/contact'
import { transformAccount, type FinancioAccount } from './transform/account'
import { transformJournal, type FinancioJournal } from './transform/journal'
import { transformOrganization, type FinancioCompany } from './transform/organization'
import { transformExpense, type FinancioExpense } from './transform/expense'
import { transformTaxRate, type FinancioTaxRate } from './transform/taxrate'
import { transformTransaction, type FinancioPayment } from './transform/transaction'
import { transformCreditMemo, type FinancioCreditNote } from './transform/creditmemo'
import { transformSalesOrder, type FinancioQuote } from './transform/salesorder'
import { transformPurchaseOrder, type FinancioPurchaseOrder } from './transform/purchaseorder'

interface FinancioAdapterConfig {
  apiKey: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class FinancioAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'financio'
  readonly version = '0.1.0'

  constructor(_config: FinancioAdapterConfig) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new FinancioClient(credentials)
    const res = await client.get<FinancioCompany>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new FinancioClient(credentials)
    const res = await client.get<{ data: FinancioInvoice[] }>('invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new FinancioClient(credentials)
    const res = await client.get<FinancioInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new FinancioClient(credentials)
    const res = await client.get<{ data: FinancioBill[] }>('bills', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new FinancioClient(credentials)
    const res = await client.get<FinancioBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new FinancioClient(credentials)
    const res = await client.get<{ data: FinancioContact[] }>('contacts', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new FinancioClient(credentials)
    const res = await client.get<FinancioContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new FinancioClient(credentials)
    const res = await client.get<{ data: FinancioAccount[] }>('accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new FinancioClient(credentials)
    const res = await client.get<FinancioAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new FinancioClient(credentials)
    const res = await client.get<{ data: FinancioJournal[] }>('journal_entries', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new FinancioClient(credentials)
    const res = await client.get<FinancioJournal>(`journal_entries/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new FinancioClient(credentials)
    const res = await client.get<{ data: FinancioPayment[] }>('payments', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new FinancioClient(credentials)
    const res = await client.get<FinancioPayment>(`payments/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new FinancioClient(credentials)
    const res = await client.get<{ data: FinancioTaxRate[] }>('tax_rates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new FinancioClient(credentials)
    const res = await client.get<FinancioTaxRate>(`tax_rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new FinancioClient(credentials)
    const res = await client.get<{ data: FinancioExpense[] }>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new FinancioClient(credentials)
    const res = await client.get<FinancioExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new FinancioClient(credentials)
    const res = await client.get<{ data: FinancioCreditNote[] }>('credit_notes', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new FinancioClient(credentials)
    const res = await client.get<FinancioCreditNote>(`credit_notes/${id}`)
    return transformCreditMemo(res)
  }

  // Orders are not supported by Financio — omit to return 501 automatically.

  // --- Sales Orders (Quotes) ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new FinancioClient(credentials)
    const res = await client.get<{ data: FinancioQuote[] }>('quotes', this.paginationParams(params))
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new FinancioClient(credentials)
    const res = await client.get<FinancioQuote>(`quotes/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new FinancioClient(credentials)
    const res = await client.get<{ data: FinancioPurchaseOrder[] }>('purchase_orders', this.paginationParams(params))
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new FinancioClient(credentials)
    const res = await client.get<FinancioPurchaseOrder>(`purchase_orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
