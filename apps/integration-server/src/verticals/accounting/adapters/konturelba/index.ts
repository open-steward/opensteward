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
import { KonturelbaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type KonturelbaInvoice } from './transform/invoice'
import { transformBill, type KonturelbaExpenseBill } from './transform/bill'
import { transformContact, type KonturelbaContact } from './transform/contact'
import { transformAccount, type KonturelbaAccount } from './transform/account'
import { transformJournal, type KonturelbaJournal } from './transform/journal'
import { transformTransaction, type KonturelbaTransaction } from './transform/transaction'
import { transformTaxRate, type KontuerelbaTaxRate } from './transform/taxrate'
import { transformExpense, type KonturelbaExpense } from './transform/expense'
import { transformCreditMemo, type KontuerelbaCreditMemo } from './transform/creditmemo'
import { transformOrder, type KonturelbaOrder } from './transform/order'
import { transformSalesOrder, type KontuerelbaSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type KontuerelbaPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type KonturelbaOrganization } from './transform/organization'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class KonturelbaAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'konturelba'
  readonly version = '0.1.0'

  getAuthUrl(_state: string): string { return buildAuthUrl(_state) }
  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> { return exchangeCodeFn(code) }
  async refreshCredentials(credentials: Credentials): Promise<Credentials> { return refreshCreds(credentials) }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<KonturelbaOrganization>('organization')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<{ data: KonturelbaInvoice[] } | KonturelbaInvoice[]>('invoices', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KonturelbaInvoice[] }).data ?? (res as KonturelbaInvoice[]) ?? []
    return items.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<KonturelbaInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<{ data: KonturelbaExpenseBill[] } | KonturelbaExpenseBill[]>('expenses', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KonturelbaExpenseBill[] }).data ?? (res as KonturelbaExpenseBill[]) ?? []
    return items.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<KonturelbaExpenseBill>(`expenses/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<{ data: KonturelbaContact[] } | KonturelbaContact[]>('counterparties', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KonturelbaContact[] }).data ?? (res as KonturelbaContact[]) ?? []
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<KonturelbaContact>(`counterparties/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<{ data: KonturelbaAccount[] } | KonturelbaAccount[]>('accounts', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KonturelbaAccount[] }).data ?? (res as KonturelbaAccount[]) ?? []
    return items.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<KonturelbaAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<{ data: KonturelbaJournal[] } | KonturelbaJournal[]>('journal', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KonturelbaJournal[] }).data ?? (res as KonturelbaJournal[]) ?? []
    return items.map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<KonturelbaJournal>(`journal/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<{ data: KonturelbaTransaction[] } | KonturelbaTransaction[]>('transactions', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KonturelbaTransaction[] }).data ?? (res as KonturelbaTransaction[]) ?? []
    return items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<KonturelbaTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<{ data: KontuerelbaTaxRate[] } | KontuerelbaTaxRate[]>('vatrates', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KontuerelbaTaxRate[] }).data ?? (res as KontuerelbaTaxRate[]) ?? []
    return items.map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<KontuerelbaTaxRate>(`vatrates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<{ data: KonturelbaExpense[] } | KonturelbaExpense[]>('expenses', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KonturelbaExpense[] }).data ?? (res as KonturelbaExpense[]) ?? []
    return items.map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<KonturelbaExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<{ data: KontuerelbaCreditMemo[] } | KontuerelbaCreditMemo[]>('returns', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KontuerelbaCreditMemo[] }).data ?? (res as KontuerelbaCreditMemo[]) ?? []
    return items.map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<KontuerelbaCreditMemo>(`returns/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<{ data: KonturelbaOrder[] } | KonturelbaOrder[]>('orders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KonturelbaOrder[] }).data ?? (res as KonturelbaOrder[]) ?? []
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<KonturelbaOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<{ data: KontuerelbaSalesOrder[] } | KontuerelbaSalesOrder[]>('orders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KontuerelbaSalesOrder[] }).data ?? (res as KontuerelbaSalesOrder[]) ?? []
    return items.map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<KontuerelbaSalesOrder>(`orders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<{ data: KontuerelbaPurchaseOrder[] } | KontuerelbaPurchaseOrder[]>('orders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: KontuerelbaPurchaseOrder[] }).data ?? (res as KontuerelbaPurchaseOrder[]) ?? []
    return items.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new KonturelbaClient(credentials)
    const res = await client.get<KontuerelbaPurchaseOrder>(`orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
