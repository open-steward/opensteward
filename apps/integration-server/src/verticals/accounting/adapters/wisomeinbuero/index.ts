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

import { buildAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefreshCredentials } from './auth'
import { WisoMeinBueroClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type WisomeinbueroInvoice } from './transform/invoice'
import { transformBill, type WisomeinbueroBill } from './transform/bill'
import { transformContact, type WisomeinbueroContact } from './transform/contact'
import { transformAccount, type WisomeinbueroAccount } from './transform/account'
import { transformJournal, type WisomeinbueroJournal } from './transform/journal'
import { transformOrganization, type WisomeinbueroOrganization } from './transform/organization'
import { transformExpense, type WisomeinbueroExpense } from './transform/expense'
import { transformTaxRate, type WisomeinbueroTaxRate } from './transform/taxrate'
import { transformTransaction, type WisomeinbueroTransaction } from './transform/transaction'
import { transformCreditMemo, type WisomeinbueroCreditMemo } from './transform/creditmemo'
import { transformOrder, type WisomeinbueroOrder } from './transform/order'
import { transformSalesOrder, type WisomeinbueroSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type WisomeinbueroPurchaseOrder } from './transform/purchaseorder'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class WisoMeinBueroAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'wisomeinbuero'
  readonly version = '0.1.0'

  constructor() {}

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
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<WisomeinbueroOrganization>('company')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<{ data: WisomeinbueroInvoice[] }>('invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<WisomeinbueroInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<{ data: WisomeinbueroBill[] }>('bills', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<WisomeinbueroBill>(`bills/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<{ data: WisomeinbueroContact[] }>('contacts', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<WisomeinbueroContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<{ data: WisomeinbueroAccount[] }>('accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<WisomeinbueroAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<{ data: WisomeinbueroJournal[] }>('journals', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<WisomeinbueroJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<{ data: WisomeinbueroTransaction[] }>('transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<WisomeinbueroTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<{ data: WisomeinbueroTaxRate[] }>('tax-rates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<WisomeinbueroTaxRate>(`tax-rates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<{ data: WisomeinbueroExpense[] }>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<WisomeinbueroExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<{ data: WisomeinbueroCreditMemo[] }>('credit-memos', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<WisomeinbueroCreditMemo>(`credit-memos/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<{ data: WisomeinbueroOrder[] }>('orders', this.paginationParams(params))
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<WisomeinbueroOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<{ data: WisomeinbueroSalesOrder[] }>('sales-orders', this.paginationParams(params))
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<WisomeinbueroSalesOrder>(`sales-orders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<{ data: WisomeinbueroPurchaseOrder[] }>('purchase-orders', this.paginationParams(params))
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new WisoMeinBueroClient(credentials)
    const res = await client.get<WisomeinbueroPurchaseOrder>(`purchase-orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
