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

import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefreshCredentials,
} from './auth'
import { PromikBookClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type PromikBookInvoice } from './transform/invoice'
import { transformBill, type PromikBookBill } from './transform/bill'
import { transformContact, type PromikBookContact } from './transform/contact'
import { transformAccount, type PromikBookAccount } from './transform/account'
import { transformJournal, type PromikBookJournal } from './transform/journal'
import { transformOrganization, type PromikBookOrganization } from './transform/organization'
import { transformExpense, type PromikBookExpense } from './transform/expense'
import { transformTaxRate, type PromikBookTaxRate } from './transform/taxrate'
import { transformTransaction, type PromikBookTransaction } from './transform/transaction'
import { transformCreditMemo, type PromikBookCreditMemo } from './transform/creditmemo'
import { transformOrder, type PromikBookOrder } from './transform/order'
import { transformSalesOrder, type PromikBookSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type PromikBookPurchaseOrder } from './transform/purchaseorder'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class PromikBookAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'promikbook'
  readonly version = '0.1.0'

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private pagination(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookOrganization>('organization')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookInvoice[]>('invoices', this.pagination(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookBill[]>('bills', this.pagination(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookContact[]>('contacts', this.pagination(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookAccount[]>('accounts', this.pagination(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookJournal[]>('journal-entries', this.pagination(params))
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookJournal>(`journal-entries/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookTransaction[]>('transactions', this.pagination(params))
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookTaxRate[]>('tax-rates', this.pagination(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookTaxRate>(`tax-rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookExpense[]>('expenses', this.pagination(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookCreditMemo[]>('credit-memos', this.pagination(params))
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookCreditMemo>(`credit-memos/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookOrder[]>('orders', this.pagination(params))
    return (res ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookSalesOrder[]>('sales-orders', this.pagination(params))
    return (res ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookSalesOrder>(`sales-orders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookPurchaseOrder[]>(
      'purchase-orders',
      this.pagination(params),
    )
    return (res ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new PromikBookClient(credentials)
    const res = await client.get<PromikBookPurchaseOrder>(`purchase-orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
