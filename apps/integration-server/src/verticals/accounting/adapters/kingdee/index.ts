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
import { KingdeeClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type KingdeeInvoice } from './transform/invoice'
import { transformBill, type KingdeeBill } from './transform/bill'
import { transformContact, type KingdeeContact } from './transform/contact'
import { transformAccount, type KingdeeAccount } from './transform/account'
import { transformJournal, type KingdeeJournal } from './transform/journal'
import { transformTransaction, type KingdeeTransaction } from './transform/transaction'
import { transformTaxRate, type KingdeeTaxRate } from './transform/taxrate'
import { transformExpense, type KingdeeExpense } from './transform/expense'
import { transformCreditMemo, type KingdeeCreditMemo } from './transform/creditmemo'
import { transformOrder, type KingdeeOrder } from './transform/order'
import { transformSalesOrder, type KingdeeSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type KingdeePurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type KingdeeOrganization } from './transform/organization'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class KingdeeAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'kingdee'
  readonly version = '0.1.0'

  getAuthUrl(_state: string): string { return buildAuthUrl(_state) }
  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> { return exchangeCodeFn(code) }
  async refreshCredentials(credentials: Credentials): Promise<Credentials> { return refreshCreds(credentials) }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<KingdeeOrganization>('organization')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<{ data: KingdeeInvoice[] } | KingdeeInvoice[]>('invoices', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KingdeeInvoice[] }).data ?? (res as KingdeeInvoice[]) ?? []
    return items.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<KingdeeInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<{ data: KingdeeBill[] } | KingdeeBill[]>('bills', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KingdeeBill[] }).data ?? (res as KingdeeBill[]) ?? []
    return items.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<KingdeeBill>(`bills/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<{ data: KingdeeContact[] } | KingdeeContact[]>('customers', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KingdeeContact[] }).data ?? (res as KingdeeContact[]) ?? []
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<KingdeeContact>(`customers/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<{ data: KingdeeAccount[] } | KingdeeAccount[]>('accounts', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KingdeeAccount[] }).data ?? (res as KingdeeAccount[]) ?? []
    return items.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<KingdeeAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<{ data: KingdeeJournal[] } | KingdeeJournal[]>('journals', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KingdeeJournal[] }).data ?? (res as KingdeeJournal[]) ?? []
    return items.map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<KingdeeJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<{ data: KingdeeTransaction[] } | KingdeeTransaction[]>('transactions', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KingdeeTransaction[] }).data ?? (res as KingdeeTransaction[]) ?? []
    return items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<KingdeeTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<{ data: KingdeeTaxRate[] } | KingdeeTaxRate[]>('taxrates', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KingdeeTaxRate[] }).data ?? (res as KingdeeTaxRate[]) ?? []
    return items.map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<KingdeeTaxRate>(`taxrates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<{ data: KingdeeExpense[] } | KingdeeExpense[]>('expenses', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KingdeeExpense[] }).data ?? (res as KingdeeExpense[]) ?? []
    return items.map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<KingdeeExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<{ data: KingdeeCreditMemo[] } | KingdeeCreditMemo[]>('creditmemos', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KingdeeCreditMemo[] }).data ?? (res as KingdeeCreditMemo[]) ?? []
    return items.map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<KingdeeCreditMemo>(`creditmemos/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<{ data: KingdeeOrder[] } | KingdeeOrder[]>('orders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KingdeeOrder[] }).data ?? (res as KingdeeOrder[]) ?? []
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<KingdeeOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<{ data: KingdeeSalesOrder[] } | KingdeeSalesOrder[]>('salesorders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KingdeeSalesOrder[] }).data ?? (res as KingdeeSalesOrder[]) ?? []
    return items.map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<KingdeeSalesOrder>(`salesorders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<{ data: KingdeePurchaseOrder[] } | KingdeePurchaseOrder[]>('purchaseorders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KingdeePurchaseOrder[] }).data ?? (res as KingdeePurchaseOrder[]) ?? []
    return items.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new KingdeeClient(credentials)
    const res = await client.get<KingdeePurchaseOrder>(`purchaseorders/${id}`)
    return transformPurchaseOrder(res)
  }
}
