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
import { GeeyeeClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type GeeyeeInvoice } from './transform/invoice'
import { transformBill, type GeeyeeBill } from './transform/bill'
import { transformContact, type GeeyeeContact } from './transform/contact'
import { transformAccount, type GeeyeeAccount } from './transform/account'
import { transformJournal, type GeeyeeJournal } from './transform/journal'
import { transformTransaction, type GeeyeeTransaction } from './transform/transaction'
import { transformTaxRate, type GeeyeeTaxRate } from './transform/taxrate'
import { transformExpense, type GeeyeeExpense } from './transform/expense'
import { transformCreditMemo, type GeeyeeCreditMemo } from './transform/creditmemo'
import { transformOrder, type GeeyeeOrder } from './transform/order'
import { transformSalesOrder, type GeeyeeSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type GeeyeePurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type GeeyeeOrganization } from './transform/organization'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class GeeyeeAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'geeyee'
  readonly version = '0.1.0'

  getAuthUrl(_state: string): string { return buildAuthUrl(_state) }
  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> { return exchangeCodeFn(code) }
  async refreshCredentials(credentials: Credentials): Promise<Credentials> { return refreshCreds(credentials) }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<GeeyeeOrganization>('organization')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<{ data: GeeyeeInvoice[] } | GeeyeeInvoice[]>('invoices', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: GeeyeeInvoice[] }).data ?? (res as GeeyeeInvoice[]) ?? []
    return items.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<GeeyeeInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<{ data: GeeyeeBill[] } | GeeyeeBill[]>('bills', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: GeeyeeBill[] }).data ?? (res as GeeyeeBill[]) ?? []
    return items.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<GeeyeeBill>(`bills/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<{ data: GeeyeeContact[] } | GeeyeeContact[]>('contacts', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: GeeyeeContact[] }).data ?? (res as GeeyeeContact[]) ?? []
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<GeeyeeContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<{ data: GeeyeeAccount[] } | GeeyeeAccount[]>('accounts', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: GeeyeeAccount[] }).data ?? (res as GeeyeeAccount[]) ?? []
    return items.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<GeeyeeAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<{ data: GeeyeeJournal[] } | GeeyeeJournal[]>('journals', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: GeeyeeJournal[] }).data ?? (res as GeeyeeJournal[]) ?? []
    return items.map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<GeeyeeJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<{ data: GeeyeeTransaction[] } | GeeyeeTransaction[]>('transactions', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: GeeyeeTransaction[] }).data ?? (res as GeeyeeTransaction[]) ?? []
    return items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<GeeyeeTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<{ data: GeeyeeTaxRate[] } | GeeyeeTaxRate[]>('taxrates', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: GeeyeeTaxRate[] }).data ?? (res as GeeyeeTaxRate[]) ?? []
    return items.map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<GeeyeeTaxRate>(`taxrates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<{ data: GeeyeeExpense[] } | GeeyeeExpense[]>('expenses', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: GeeyeeExpense[] }).data ?? (res as GeeyeeExpense[]) ?? []
    return items.map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<GeeyeeExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<{ data: GeeyeeCreditMemo[] } | GeeyeeCreditMemo[]>('creditmemos', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: GeeyeeCreditMemo[] }).data ?? (res as GeeyeeCreditMemo[]) ?? []
    return items.map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<GeeyeeCreditMemo>(`creditmemos/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<{ data: GeeyeeOrder[] } | GeeyeeOrder[]>('orders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: GeeyeeOrder[] }).data ?? (res as GeeyeeOrder[]) ?? []
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<GeeyeeOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<{ data: GeeyeeSalesOrder[] } | GeeyeeSalesOrder[]>('salesorders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: GeeyeeSalesOrder[] }).data ?? (res as GeeyeeSalesOrder[]) ?? []
    return items.map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<GeeyeeSalesOrder>(`salesorders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<{ data: GeeyeePurchaseOrder[] } | GeeyeePurchaseOrder[]>('purchaseorders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: GeeyeePurchaseOrder[] }).data ?? (res as GeeyeePurchaseOrder[]) ?? []
    return items.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new GeeyeeClient(credentials)
    const res = await client.get<GeeyeePurchaseOrder>(`purchaseorders/${id}`)
    return transformPurchaseOrder(res)
  }
}
