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

import { buildAuthUrl, exchangeCode as exchangeCreds, refreshCredentials as refreshCreds } from './auth'
import { BillingoClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type BillingoInvoice } from './transform/invoice'
import { transformBill, type BillingoBill } from './transform/bill'
import { transformContact, type BillingoContact } from './transform/contact'
import { transformAccount, type BillingoAccount } from './transform/account'
import { transformJournal, type BillingoJournal } from './transform/journal'
import { transformTransaction, type BillingoTransaction } from './transform/transaction'
import { transformTaxRate, type BillingoTaxRate } from './transform/taxrate'
import { transformExpense, type BillingoExpense } from './transform/expense'
import { transformCreditMemo, type BillingoCreditMemo } from './transform/creditmemo'
import { transformOrder, type BillingoOrder } from './transform/order'
import { transformSalesOrder, type BillingoSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type BillingoPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type BillingoOrganization } from './transform/organization'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class BillingoAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'billingo'
  readonly version = '0.1.0'

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCreds(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCreds(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new BillingoClient(credentials)
    const res = await client.get<BillingoOrganization>('organization')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new BillingoClient(credentials)
    // Billingo API v3 uses 'documents' for all invoice types
    const res = await client.get<BillingoInvoice[] | { data: BillingoInvoice[] }>('documents', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new BillingoClient(credentials)
    const res = await client.get<BillingoInvoice>(`documents/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new BillingoClient(credentials)
    // Billingo uses 'spendings' for purchase bills
    const res = await client.get<BillingoBill[] | { data: BillingoBill[] }>('spendings', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new BillingoClient(credentials)
    const res = await client.get<BillingoBill>(`spendings/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new BillingoClient(credentials)
    // Billingo API v3 uses 'partners' for contacts
    const res = await client.get<BillingoContact[] | { data: BillingoContact[] }>('partners', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new BillingoClient(credentials)
    const res = await client.get<BillingoContact>(`partners/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new BillingoClient(credentials)
    // Billingo uses 'bank-accounts' for bank account resources
    const res = await client.get<BillingoAccount[] | { data: BillingoAccount[] }>('bank-accounts', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new BillingoClient(credentials)
    const res = await client.get<BillingoAccount>(`bank-accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new BillingoClient(credentials)
    const res = await client.get<BillingoJournal[] | { data: BillingoJournal[] }>('journals', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new BillingoClient(credentials)
    const res = await client.get<BillingoJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new BillingoClient(credentials)
    const res = await client.get<BillingoTransaction[] | { data: BillingoTransaction[] }>('transactions', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new BillingoClient(credentials)
    const res = await client.get<BillingoTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new BillingoClient(credentials)
    const res = await client.get<BillingoTaxRate[] | { data: BillingoTaxRate[] }>('taxrates', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new BillingoClient(credentials)
    const res = await client.get<BillingoTaxRate>(`taxrates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new BillingoClient(credentials)
    const res = await client.get<BillingoExpense[] | { data: BillingoExpense[] }>('expenses', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new BillingoClient(credentials)
    const res = await client.get<BillingoExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new BillingoClient(credentials)
    const res = await client.get<BillingoCreditMemo[] | { data: BillingoCreditMemo[] }>('creditmemos', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new BillingoClient(credentials)
    const res = await client.get<BillingoCreditMemo>(`creditmemos/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new BillingoClient(credentials)
    const res = await client.get<BillingoOrder[] | { data: BillingoOrder[] }>('orders', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new BillingoClient(credentials)
    const res = await client.get<BillingoOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new BillingoClient(credentials)
    const res = await client.get<BillingoSalesOrder[] | { data: BillingoSalesOrder[] }>('salesorders', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new BillingoClient(credentials)
    const res = await client.get<BillingoSalesOrder>(`salesorders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new BillingoClient(credentials)
    const res = await client.get<BillingoPurchaseOrder[] | { data: BillingoPurchaseOrder[] }>('purchaseorders', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new BillingoClient(credentials)
    const res = await client.get<BillingoPurchaseOrder>(`purchaseorders/${id}`)
    return transformPurchaseOrder(res)
  }
}
