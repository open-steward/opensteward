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

import { buildAuthUrl, exchangeCode as exchangeCodeFn, refreshCredentials as refreshCreds } from './auth'
import { FenbeitongClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type FenbeitongInvoice } from './transform/invoice'
import { transformBill, type FenbeitongBill } from './transform/bill'
import { transformContact, type FenbeitongContact } from './transform/contact'
import { transformAccount, type FenbeitongAccount } from './transform/account'
import { transformJournal, type FenbeitongJournal } from './transform/journal'
import { transformTransaction, type FenbeitongTransaction } from './transform/transaction'
import { transformTaxRate, type FenbeitongTaxRate } from './transform/taxrate'
import { transformExpense, type FenbeitongExpense } from './transform/expense'
import { transformCreditMemo, type FenbeitongCreditMemo } from './transform/creditmemo'
import { transformOrder, type FenbeitongOrder } from './transform/order'
import { transformSalesOrder, type FenbeitongSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type FenbeitongPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type FenbeitongOrganization } from './transform/organization'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class FenbeitongAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'fenbeitong'
  readonly version = '0.1.0'

  getAuthUrl(_state: string): string { return buildAuthUrl(_state) }
  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> { return exchangeCodeFn(code) }
  async refreshCredentials(credentials: Credentials): Promise<Credentials> { return refreshCreds(credentials) }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<FenbeitongOrganization>('company')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<{ data: FenbeitongInvoice[] } | FenbeitongInvoice[]>('expenses', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: FenbeitongInvoice[] }).data ?? (res as FenbeitongInvoice[]) ?? []
    return items.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<FenbeitongInvoice>(`expenses/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<{ data: FenbeitongBill[] } | FenbeitongBill[]>('bills', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: FenbeitongBill[] }).data ?? (res as FenbeitongBill[]) ?? []
    return items.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<FenbeitongBill>(`bills/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<{ data: FenbeitongContact[] } | FenbeitongContact[]>('employees', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: FenbeitongContact[] }).data ?? (res as FenbeitongContact[]) ?? []
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<FenbeitongContact>(`employees/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<{ data: FenbeitongAccount[] } | FenbeitongAccount[]>('accounts', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: FenbeitongAccount[] }).data ?? (res as FenbeitongAccount[]) ?? []
    return items.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<FenbeitongAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<{ data: FenbeitongJournal[] } | FenbeitongJournal[]>('journals', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: FenbeitongJournal[] }).data ?? (res as FenbeitongJournal[]) ?? []
    return items.map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<FenbeitongJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<{ data: FenbeitongTransaction[] } | FenbeitongTransaction[]>('transactions', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: FenbeitongTransaction[] }).data ?? (res as FenbeitongTransaction[]) ?? []
    return items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<FenbeitongTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<{ data: FenbeitongTaxRate[] } | FenbeitongTaxRate[]>('taxrates', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: FenbeitongTaxRate[] }).data ?? (res as FenbeitongTaxRate[]) ?? []
    return items.map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<FenbeitongTaxRate>(`taxrates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<{ data: FenbeitongExpense[] } | FenbeitongExpense[]>('expenses', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: FenbeitongExpense[] }).data ?? (res as FenbeitongExpense[]) ?? []
    return items.map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<FenbeitongExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<{ data: FenbeitongCreditMemo[] } | FenbeitongCreditMemo[]>('creditmemos', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: FenbeitongCreditMemo[] }).data ?? (res as FenbeitongCreditMemo[]) ?? []
    return items.map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<FenbeitongCreditMemo>(`creditmemos/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<{ data: FenbeitongOrder[] } | FenbeitongOrder[]>('orders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: FenbeitongOrder[] }).data ?? (res as FenbeitongOrder[]) ?? []
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<FenbeitongOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<{ data: FenbeitongSalesOrder[] } | FenbeitongSalesOrder[]>('salesorders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: FenbeitongSalesOrder[] }).data ?? (res as FenbeitongSalesOrder[]) ?? []
    return items.map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<FenbeitongSalesOrder>(`salesorders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<{ data: FenbeitongPurchaseOrder[] } | FenbeitongPurchaseOrder[]>('purchaseorders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: FenbeitongPurchaseOrder[] }).data ?? (res as FenbeitongPurchaseOrder[]) ?? []
    return items.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new FenbeitongClient(credentials)
    const res = await client.get<FenbeitongPurchaseOrder>(`purchaseorders/${id}`)
    return transformPurchaseOrder(res)
  }
}
