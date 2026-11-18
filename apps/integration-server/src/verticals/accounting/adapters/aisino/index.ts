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
import { AisinoClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type AisinoInvoice } from './transform/invoice'
import { transformBill, type AisinoBill } from './transform/bill'
import { transformContact, type AisinoContact } from './transform/contact'
import { transformAccount, type AisinoAccount } from './transform/account'
import { transformJournal, type AisinoJournal } from './transform/journal'
import { transformTransaction, type AisinoTransaction } from './transform/transaction'
import { transformTaxRate, type AisinoTaxRate } from './transform/taxrate'
import { transformExpense, type AisinoExpense } from './transform/expense'
import { transformCreditMemo, type AisinoCreditMemo } from './transform/creditmemo'
import { transformOrder, type AisinoOrder } from './transform/order'
import { transformSalesOrder, type AisinoSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type AisinoPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type AisinoOrganization } from './transform/organization'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class AisinoAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'aisino'
  readonly version = '0.1.0'

  getAuthUrl(_state: string): string { return buildAuthUrl(_state) }
  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> { return exchangeCodeFn(code) }
  async refreshCredentials(credentials: Credentials): Promise<Credentials> { return refreshCreds(credentials) }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new AisinoClient(credentials)
    const res = await client.get<AisinoOrganization>('organization')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new AisinoClient(credentials)
    const res = await client.get<{ data: AisinoInvoice[] } | AisinoInvoice[]>('invoices', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: AisinoInvoice[] }).data ?? (res as AisinoInvoice[]) ?? []
    return items.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new AisinoClient(credentials)
    const res = await client.get<AisinoInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new AisinoClient(credentials)
    const res = await client.get<{ data: AisinoBill[] } | AisinoBill[]>('purchaseinvoices', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: AisinoBill[] }).data ?? (res as AisinoBill[]) ?? []
    return items.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new AisinoClient(credentials)
    const res = await client.get<AisinoBill>(`purchaseinvoices/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new AisinoClient(credentials)
    const res = await client.get<{ data: AisinoContact[] } | AisinoContact[]>('customers', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: AisinoContact[] }).data ?? (res as AisinoContact[]) ?? []
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new AisinoClient(credentials)
    const res = await client.get<AisinoContact>(`customers/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new AisinoClient(credentials)
    const res = await client.get<{ data: AisinoAccount[] } | AisinoAccount[]>('accounts', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: AisinoAccount[] }).data ?? (res as AisinoAccount[]) ?? []
    return items.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new AisinoClient(credentials)
    const res = await client.get<AisinoAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new AisinoClient(credentials)
    const res = await client.get<{ data: AisinoJournal[] } | AisinoJournal[]>('journals', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: AisinoJournal[] }).data ?? (res as AisinoJournal[]) ?? []
    return items.map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new AisinoClient(credentials)
    const res = await client.get<AisinoJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new AisinoClient(credentials)
    const res = await client.get<{ data: AisinoTransaction[] } | AisinoTransaction[]>('transactions', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: AisinoTransaction[] }).data ?? (res as AisinoTransaction[]) ?? []
    return items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new AisinoClient(credentials)
    const res = await client.get<AisinoTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new AisinoClient(credentials)
    const res = await client.get<{ data: AisinoTaxRate[] } | AisinoTaxRate[]>('taxrates', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: AisinoTaxRate[] }).data ?? (res as AisinoTaxRate[]) ?? []
    return items.map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new AisinoClient(credentials)
    const res = await client.get<AisinoTaxRate>(`taxrates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new AisinoClient(credentials)
    const res = await client.get<{ data: AisinoExpense[] } | AisinoExpense[]>('expenses', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: AisinoExpense[] }).data ?? (res as AisinoExpense[]) ?? []
    return items.map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new AisinoClient(credentials)
    const res = await client.get<AisinoExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new AisinoClient(credentials)
    const res = await client.get<{ data: AisinoCreditMemo[] } | AisinoCreditMemo[]>('creditmemos', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: AisinoCreditMemo[] }).data ?? (res as AisinoCreditMemo[]) ?? []
    return items.map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new AisinoClient(credentials)
    const res = await client.get<AisinoCreditMemo>(`creditmemos/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new AisinoClient(credentials)
    const res = await client.get<{ data: AisinoOrder[] } | AisinoOrder[]>('orders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: AisinoOrder[] }).data ?? (res as AisinoOrder[]) ?? []
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new AisinoClient(credentials)
    const res = await client.get<AisinoOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new AisinoClient(credentials)
    const res = await client.get<{ data: AisinoSalesOrder[] } | AisinoSalesOrder[]>('salesorders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: AisinoSalesOrder[] }).data ?? (res as AisinoSalesOrder[]) ?? []
    return items.map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new AisinoClient(credentials)
    const res = await client.get<AisinoSalesOrder>(`salesorders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new AisinoClient(credentials)
    const res = await client.get<{ data: AisinoPurchaseOrder[] } | AisinoPurchaseOrder[]>('purchaseorders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: AisinoPurchaseOrder[] }).data ?? (res as AisinoPurchaseOrder[]) ?? []
    return items.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new AisinoClient(credentials)
    const res = await client.get<AisinoPurchaseOrder>(`purchaseorders/${id}`)
    return transformPurchaseOrder(res)
  }
}
