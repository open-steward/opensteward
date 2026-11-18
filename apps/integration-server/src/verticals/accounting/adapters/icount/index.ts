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

import { getAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefreshCredentials } from './auth'
import { ICountClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type ICountInvoice } from './transform/invoice'
import { transformBill } from './transform/bill'
import { transformContact, type ICountContact } from './transform/contact'
import { transformAccount, type ICountAccount } from './transform/account'
import { transformOrganization, type ICountOrganization } from './transform/organization'
import { transformTransaction, type ICountPayment } from './transform/transaction'
import { transformTaxRate, ICOUNT_TAX_RATES } from './transform/taxrate'
import { transformExpense, type ICountExpense } from './transform/expense'
import { transformCreditMemo } from './transform/creditmemo'
import { transformJournal, type ICountJournal } from './transform/journal'
import { transformOrder } from './transform/order'
import { transformSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder } from './transform/purchaseorder'

interface ICountAdapterConfig {
  apiKey: string
  cid?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ICountAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'icount'
  readonly version = '0.1.0'

  private apiKey: string
  private cid?: string

  constructor(config: ICountAdapterConfig) {
    this.apiKey = config.apiKey
    this.cid = config.cid
  }

  getAuthUrl(_state: string): string {
    return getAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private makeCredentials(): Credentials {
    return {
      accessToken: this.apiKey,
      extra: this.cid ? { cid: this.cid } : undefined,
    }
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new ICountClient(credentials)
    const res = await client.post<ICountOrganization>('company/get')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new ICountClient(credentials)
    const res = await client.post<{ data: ICountInvoice[] }>('doc/getList', {
      doc_type: 'invrec',
      ...this.paginationParams(params),
    })
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new ICountClient(credentials)
    const res = await client.post<ICountInvoice>('doc/get', { doc_id: id })
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new ICountClient(credentials)
    const res = await client.post<{ data: ICountInvoice[] }>('doc/getList', {
      doc_type: 'purchase',
      ...this.paginationParams(params),
    })
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new ICountClient(credentials)
    const res = await client.post<ICountInvoice>('doc/get', { doc_id: id })
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new ICountClient(credentials)
    const res = await client.post<{ data: ICountContact[] }>('client/getList', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new ICountClient(credentials)
    const res = await client.post<ICountContact>('client/get', { client_id: id })
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new ICountClient(credentials)
    const res = await client.post<{ data: ICountAccount[] }>('account/getList', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new ICountClient(credentials)
    const res = await client.post<ICountAccount>('account/get', { account_id: id })
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new ICountClient(credentials)
    const res = await client.post<{ data: ICountJournal[] }>('journal/getList', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new ICountClient(credentials)
    const res = await client.post<ICountJournal>('journal/get', { doc_id: id })
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new ICountClient(credentials)
    const res = await client.post<{ data: ICountPayment[] }>('payment/getList', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new ICountClient(credentials)
    const res = await client.post<ICountPayment>('payment/get', { payment_id: id })
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(_credentials: Credentials, _params: QueryParams): Promise<TaxRate[]> {
    return ICOUNT_TAX_RATES.map(transformTaxRate)
  }

  async getTaxRate(_credentials: Credentials, id: string): Promise<TaxRate> {
    const rate = ICOUNT_TAX_RATES.find((r) => r.id === id)
    if (!rate) throw new Error(`TaxRate not found: ${id}`)
    return transformTaxRate(rate)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new ICountClient(credentials)
    const res = await client.post<{ data: ICountExpense[] }>('expense/getList', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new ICountClient(credentials)
    const res = await client.post<ICountExpense>('expense/get', { doc_id: id })
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new ICountClient(credentials)
    const res = await client.post<{ data: ICountInvoice[] }>('doc/getList', {
      doc_type: 'creditmemo',
      ...this.paginationParams(params),
    })
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new ICountClient(credentials)
    const res = await client.post<ICountInvoice>('doc/get', { doc_id: id })
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ICountClient(credentials)
    const res = await client.post<{ data: ICountInvoice[] }>('doc/getList', {
      doc_type: 'order',
      ...this.paginationParams(params),
    })
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ICountClient(credentials)
    const res = await client.post<ICountInvoice>('doc/get', { doc_id: id })
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new ICountClient(credentials)
    const res = await client.post<{ data: ICountInvoice[] }>('doc/getList', {
      doc_type: 'salesorder',
      ...this.paginationParams(params),
    })
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new ICountClient(credentials)
    const res = await client.post<ICountInvoice>('doc/get', { doc_id: id })
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new ICountClient(credentials)
    const res = await client.post<{ data: ICountInvoice[] }>('doc/getList', {
      doc_type: 'purchaseorder',
      ...this.paginationParams(params),
    })
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new ICountClient(credentials)
    const res = await client.post<ICountInvoice>('doc/get', { doc_id: id })
    return transformPurchaseOrder(res)
  }
}
