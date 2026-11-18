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

import { buildAuthUrl, exchangeCode, refreshCredentials as apiRefreshCredentials } from './auth'
import { LucaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type LucaInvoice } from './transform/invoice'
import { transformBill, type LucaBill } from './transform/bill'
import { transformContact, type LucaContact } from './transform/contact'
import { transformAccount, type LucaAccount } from './transform/account'
import { transformJournal, type LucaJournal } from './transform/journal'
import { transformTransaction, type LucaTransaction } from './transform/transaction'
import { transformTaxRate, type LucaTaxRate } from './transform/taxrate'
import { transformExpense, type LucaExpense } from './transform/expense'
import { transformCreditMemo, type LucaCreditMemo } from './transform/creditmemo'
import { transformOrder, type LucaOrder } from './transform/order'
import { transformSalesOrder, type LucaSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type LucaPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type LucaOrganization } from './transform/organization'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class LucaAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'luca'
  readonly version = '0.1.0'

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return apiRefreshCredentials(credentials)
  }

  private pagination(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaOrganization>('organization')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaInvoice[]>('invoices', this.pagination(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaBill[]>('bills', this.pagination(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaContact[]>('contacts', this.pagination(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaAccount[]>('accounts', this.pagination(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaJournal[]>('journals', this.pagination(params))
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaTransaction[]>('transactions', this.pagination(params))
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaTaxRate[]>('tax-rates', this.pagination(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaTaxRate>(`tax-rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaExpense[]>('expenses', this.pagination(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaCreditMemo[]>('credit-memos', this.pagination(params))
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaCreditMemo>(`credit-memos/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaOrder[]>('orders', this.pagination(params))
    return (res ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaSalesOrder[]>('sales-orders', this.pagination(params))
    return (res ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaSalesOrder>(`sales-orders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaPurchaseOrder[]>('purchase-orders', this.pagination(params))
    return (res ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new LucaClient(credentials)
    const res = await client.get<LucaPurchaseOrder>(`purchase-orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
