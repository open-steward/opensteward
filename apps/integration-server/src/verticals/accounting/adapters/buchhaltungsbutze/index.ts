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
import { BuchhaltungsButzeClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type BuchhaltungsbutzeInvoice } from './transform/invoice'
import { transformBill, type BuchhaltungsbutzeBill } from './transform/bill'
import { transformContact, type BuchhaltungsbutzeContact } from './transform/contact'
import { transformAccount, type BuchhaltungsbutzeAccount } from './transform/account'
import { transformJournal, type BuchhaltungsbutzeJournal } from './transform/journal'
import { transformOrganization, type BuchhaltungsbutzeOrganization } from './transform/organization'
import { transformExpense, type BuchhaltungsbutzeExpense } from './transform/expense'
import { transformTaxRate, type BuchhaltungsbutzeTaxRate } from './transform/taxrate'
import { transformTransaction, type BuchhaltungsbutzeTransaction } from './transform/transaction'
import { transformCreditMemo, type BuchhaltungsbutzeCreditMemo } from './transform/creditmemo'
import { transformOrder, type BuchhaltungsbutzeOrder } from './transform/order'
import { transformSalesOrder, type BuchhaltungsbutzeSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type BuchhaltungsbutzePurchaseOrder } from './transform/purchaseorder'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class BuchhaltungsButzeAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'buchhaltungsbutze'
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
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<BuchhaltungsbutzeOrganization>('company')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<{ data: BuchhaltungsbutzeInvoice[] }>('invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<BuchhaltungsbutzeInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<{ data: BuchhaltungsbutzeBill[] }>('bills', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<BuchhaltungsbutzeBill>(`bills/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<{ data: BuchhaltungsbutzeContact[] }>('contacts', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<BuchhaltungsbutzeContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<{ data: BuchhaltungsbutzeAccount[] }>('accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<BuchhaltungsbutzeAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<{ data: BuchhaltungsbutzeJournal[] }>('journals', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<BuchhaltungsbutzeJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<{ data: BuchhaltungsbutzeTransaction[] }>('transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<BuchhaltungsbutzeTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<{ data: BuchhaltungsbutzeTaxRate[] }>('tax-rates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<BuchhaltungsbutzeTaxRate>(`tax-rates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<{ data: BuchhaltungsbutzeExpense[] }>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<BuchhaltungsbutzeExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<{ data: BuchhaltungsbutzeCreditMemo[] }>('credit-notes', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<BuchhaltungsbutzeCreditMemo>(`credit-notes/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<{ data: BuchhaltungsbutzeOrder[] }>('orders', this.paginationParams(params))
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<BuchhaltungsbutzeOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<{ data: BuchhaltungsbutzeSalesOrder[] }>('sales-orders', this.paginationParams(params))
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<BuchhaltungsbutzeSalesOrder>(`sales-orders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<{ data: BuchhaltungsbutzePurchaseOrder[] }>('purchase-orders', this.paginationParams(params))
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new BuchhaltungsButzeClient(credentials)
    const res = await client.get<BuchhaltungsbutzePurchaseOrder>(`purchase-orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
