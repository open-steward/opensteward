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
import { RivileClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type RivileInvoice } from './transform/invoice'
import { transformBill, type RivileBill } from './transform/bill'
import { transformContact, type RivileContact } from './transform/contact'
import { transformAccount, type RivileAccount } from './transform/account'
import { transformJournal, type RivileJournal } from './transform/journal'
import { transformTransaction, type RivileTransaction } from './transform/transaction'
import { transformTaxRate, type RivileTaxRate } from './transform/taxrate'
import { transformExpense, type RivileExpense } from './transform/expense'
import { transformCreditMemo, type RivileCreditMemo } from './transform/creditmemo'
import { transformOrder, type RivileOrder } from './transform/order'
import { transformSalesOrder, type RivileSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type RivilePurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type RivileOrganization } from './transform/organization'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class RivileAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'rivile'
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
    const client = new RivileClient(credentials)
    const res = await client.get<RivileOrganization>('organization')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivileInvoice[] | { data: RivileInvoice[] }>('invoices', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivileInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivileBill[] | { data: RivileBill[] }>('bills', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivileBill>(`bills/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivileContact[] | { data: RivileContact[] }>('contacts', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivileContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivileAccount[] | { data: RivileAccount[] }>('accounts', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivileAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivileJournal[] | { data: RivileJournal[] }>('journals', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivileJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivileTransaction[] | { data: RivileTransaction[] }>('transactions', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivileTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivileTaxRate[] | { data: RivileTaxRate[] }>('taxrates', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivileTaxRate>(`taxrates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivileExpense[] | { data: RivileExpense[] }>('expenses', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivileExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivileCreditMemo[] | { data: RivileCreditMemo[] }>('creditmemos', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivileCreditMemo>(`creditmemos/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivileOrder[] | { data: RivileOrder[] }>('orders', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivileOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivileSalesOrder[] | { data: RivileSalesOrder[] }>('salesorders', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivileSalesOrder>(`salesorders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivilePurchaseOrder[] | { data: RivilePurchaseOrder[] }>('purchaseorders', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new RivileClient(credentials)
    const res = await client.get<RivilePurchaseOrder>(`purchaseorders/${id}`)
    return transformPurchaseOrder(res)
  }
}
