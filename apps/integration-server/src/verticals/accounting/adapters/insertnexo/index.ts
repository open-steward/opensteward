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
import { InsertnexoClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type InsertnexoInvoice } from './transform/invoice'
import { transformBill, type InsertnexoBill } from './transform/bill'
import { transformContact, type InsertnexoContact } from './transform/contact'
import { transformAccount, type InsertnexoAccount } from './transform/account'
import { transformJournal, type InsertnexoJournal } from './transform/journal'
import { transformTransaction, type InsertnexoTransaction } from './transform/transaction'
import { transformTaxRate, type InsertnexoTaxRate } from './transform/taxrate'
import { transformExpense, type InsertnexoExpense } from './transform/expense'
import { transformCreditMemo, type InsertnexoCreditMemo } from './transform/creditmemo'
import { transformOrder, type InsertnexoOrder } from './transform/order'
import { transformSalesOrder, type InsertnexoSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type InsertnexoPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type InsertnexoOrganization } from './transform/organization'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class InsertnexoAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'insertnexo'
  readonly version = '0.1.0'

  getAuthUrl(_state: string): string { return buildAuthUrl(_state) }
  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> { return exchangeCodeFn(code) }
  async refreshCredentials(credentials: Credentials): Promise<Credentials> { return refreshCreds(credentials) }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<InsertnexoOrganization>('organization')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<{ data: InsertnexoInvoice[] } | InsertnexoInvoice[]>('invoices', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: InsertnexoInvoice[] }).data ?? (res as InsertnexoInvoice[]) ?? []
    return items.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<InsertnexoInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<{ data: InsertnexoBill[] } | InsertnexoBill[]>('bills', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: InsertnexoBill[] }).data ?? (res as InsertnexoBill[]) ?? []
    return items.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<InsertnexoBill>(`bills/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<{ data: InsertnexoContact[] } | InsertnexoContact[]>('contacts', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: InsertnexoContact[] }).data ?? (res as InsertnexoContact[]) ?? []
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<InsertnexoContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<{ data: InsertnexoAccount[] } | InsertnexoAccount[]>('accounts', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: InsertnexoAccount[] }).data ?? (res as InsertnexoAccount[]) ?? []
    return items.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<InsertnexoAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<{ data: InsertnexoJournal[] } | InsertnexoJournal[]>('journals', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: InsertnexoJournal[] }).data ?? (res as InsertnexoJournal[]) ?? []
    return items.map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<InsertnexoJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<{ data: InsertnexoTransaction[] } | InsertnexoTransaction[]>('transactions', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: InsertnexoTransaction[] }).data ?? (res as InsertnexoTransaction[]) ?? []
    return items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<InsertnexoTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<{ data: InsertnexoTaxRate[] } | InsertnexoTaxRate[]>('taxrates', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: InsertnexoTaxRate[] }).data ?? (res as InsertnexoTaxRate[]) ?? []
    return items.map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<InsertnexoTaxRate>(`taxrates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<{ data: InsertnexoExpense[] } | InsertnexoExpense[]>('expenses', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: InsertnexoExpense[] }).data ?? (res as InsertnexoExpense[]) ?? []
    return items.map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<InsertnexoExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<{ data: InsertnexoCreditMemo[] } | InsertnexoCreditMemo[]>('creditmemos', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: InsertnexoCreditMemo[] }).data ?? (res as InsertnexoCreditMemo[]) ?? []
    return items.map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<InsertnexoCreditMemo>(`creditmemos/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<{ data: InsertnexoOrder[] } | InsertnexoOrder[]>('orders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: InsertnexoOrder[] }).data ?? (res as InsertnexoOrder[]) ?? []
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<InsertnexoOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<{ data: InsertnexoSalesOrder[] } | InsertnexoSalesOrder[]>('salesorders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: InsertnexoSalesOrder[] }).data ?? (res as InsertnexoSalesOrder[]) ?? []
    return items.map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<InsertnexoSalesOrder>(`salesorders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<{ data: InsertnexoPurchaseOrder[] } | InsertnexoPurchaseOrder[]>('purchaseorders', { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    const items = (res as { data: InsertnexoPurchaseOrder[] }).data ?? (res as InsertnexoPurchaseOrder[]) ?? []
    return items.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new InsertnexoClient(credentials)
    const res = await client.get<InsertnexoPurchaseOrder>(`purchaseorders/${id}`)
    return transformPurchaseOrder(res)
  }
}
