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

import { buildAuthUrl, exchangeCode, refreshCredentials as doRefreshCredentials } from './auth'
import { SmartbillClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type SmartbillInvoice } from './transform/invoice'
import { transformBill, type SmartbillBill } from './transform/bill'
import { transformContact, type SmartbillContact } from './transform/contact'
import { transformAccount, type SmartbillAccount } from './transform/account'
import { transformJournal, type SmartbillJournal } from './transform/journal'
import { transformTransaction, type SmartbillTransaction } from './transform/transaction'
import { transformTaxRate, type SmartbillTaxRate } from './transform/taxrate'
import { transformExpense, type SmartbillExpense } from './transform/expense'
import { transformCreditMemo, type SmartbillCreditMemo } from './transform/creditmemo'
import { transformOrder, type SmartbillOrder } from './transform/order'
import { transformSalesOrder, type SmartbillSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type SmartbillPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type SmartbillOrganization } from './transform/organization'

interface SmartbillAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SmartbillAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'smartbill'
  readonly version = '0.1.0'

  constructor(_config: SmartbillAdapterConfig = {}) {}

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillOrganization>('organization')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillInvoice[] | { data: SmartbillInvoice[] }>('invoices', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillBill[] | { data: SmartbillBill[] }>('bills', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillBill>(`bills/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillContact[] | { data: SmartbillContact[] }>('contacts', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillAccount[] | { data: SmartbillAccount[] }>('accounts', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillJournal[] | { data: SmartbillJournal[] }>('journals', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillTransaction[] | { data: SmartbillTransaction[] }>('transactions', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillTaxRate[] | { data: SmartbillTaxRate[] }>('taxrates', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillTaxRate>(`taxrates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillExpense[] | { data: SmartbillExpense[] }>('expenses', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillCreditMemo[] | { data: SmartbillCreditMemo[] }>('creditmemos', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillCreditMemo>(`creditmemos/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillOrder[] | { data: SmartbillOrder[] }>('orders', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillSalesOrder[] | { data: SmartbillSalesOrder[] }>('salesorders', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillSalesOrder>(`salesorders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillPurchaseOrder[] | { data: SmartbillPurchaseOrder[] }>('purchaseorders', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new SmartbillClient(credentials)
    const res = await client.get<SmartbillPurchaseOrder>(`purchaseorders/${id}`)
    return transformPurchaseOrder(res)
  }
}
