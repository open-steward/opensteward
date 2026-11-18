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
import { ProsvasisClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type ProsvasisInvoice } from './transform/invoice'
import { transformBill, type ProsvasisBill } from './transform/bill'
import { transformContact, type ProsvasisContact } from './transform/contact'
import { transformAccount, type ProsvasisAccount } from './transform/account'
import { transformJournal, type ProsvasisJournal } from './transform/journal'
import { transformOrganization, type ProsvasisOrganization } from './transform/organization'
import { transformExpense, type ProsvasisExpense } from './transform/expense'
import { transformTaxRate, type ProsvasisTaxRate } from './transform/taxrate'
import { transformTransaction, type ProsvasisTransaction } from './transform/transaction'
import { transformCreditMemo, type ProsvasisCreditMemo } from './transform/creditmemo'
import { transformOrder, type ProsvasisOrder } from './transform/order'
import { transformSalesOrder, type ProsvasisSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type ProsvasisPurchaseOrder } from './transform/purchaseorder'

interface ProsvasisAdapterConfig {
  apiKey: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ProsvasisAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'prosvasis'
  readonly version = '0.1.0'

  constructor(_config: ProsvasisAdapterConfig) {}

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
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
      ...(params.updatedAfter && { modifiedAfter: params.updatedAfter.toISOString() }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<ProsvasisOrganization>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<{ data: ProsvasisInvoice[] }>(
      'invoices',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<ProsvasisInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<{ data: ProsvasisBill[] }>(
      'bills',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<ProsvasisBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<{ data: ProsvasisContact[] }>(
      'contacts',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<ProsvasisContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<{ data: ProsvasisAccount[] }>(
      'accounts',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<ProsvasisAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<{ data: ProsvasisJournal[] }>(
      'journals',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<ProsvasisJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<{ data: ProsvasisTransaction[] }>(
      'transactions',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<ProsvasisTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<{ data: ProsvasisTaxRate[] }>(
      'taxrates',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<ProsvasisTaxRate>(`taxrates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<{ data: ProsvasisExpense[] }>(
      'expenses',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<ProsvasisExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<{ data: ProsvasisCreditMemo[] }>(
      'creditmemos',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<ProsvasisCreditMemo>(`creditmemos/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<{ data: ProsvasisOrder[] }>(
      'orders',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<ProsvasisOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<{ data: ProsvasisSalesOrder[] }>(
      'salesorders',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<ProsvasisSalesOrder>(`salesorders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<{ data: ProsvasisPurchaseOrder[] }>(
      'purchaseorders',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new ProsvasisClient(credentials)
    const res = await client.get<ProsvasisPurchaseOrder>(`purchaseorders/${id}`)
    return transformPurchaseOrder(res)
  }
}
