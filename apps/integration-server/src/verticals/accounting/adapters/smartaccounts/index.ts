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
import { SmartaccountsClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type SmartaccountsInvoice } from './transform/invoice'
import { transformBill, type SmartaccountsBill } from './transform/bill'
import { transformContact, type SmartaccountsContact } from './transform/contact'
import { transformAccount, type SmartaccountsAccount } from './transform/account'
import { transformJournal, type SmartaccountsJournal } from './transform/journal'
import { transformTransaction, type SmartaccountsTransaction } from './transform/transaction'
import { transformTaxRate, type SmartaccountsTaxRate } from './transform/taxrate'
import { transformExpense, type SmartaccountsExpense } from './transform/expense'
import { transformCreditMemo, type SmartaccountsCreditMemo } from './transform/creditmemo'
import { transformOrder, type SmartaccountsOrder } from './transform/order'
import { transformSalesOrder, type SmartaccountsSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type SmartaccountsPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type SmartaccountsOrganization } from './transform/organization'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SmartaccountsAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'smartaccounts'
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
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsOrganization>('organization')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsInvoice[] | { data: SmartaccountsInvoice[] }>('invoices', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsBill[] | { data: SmartaccountsBill[] }>('bills', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsBill>(`bills/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsContact[] | { data: SmartaccountsContact[] }>('contacts', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsAccount[] | { data: SmartaccountsAccount[] }>('accounts', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsJournal[] | { data: SmartaccountsJournal[] }>('journals', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsTransaction[] | { data: SmartaccountsTransaction[] }>('transactions', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsTaxRate[] | { data: SmartaccountsTaxRate[] }>('taxrates', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsTaxRate>(`taxrates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsExpense[] | { data: SmartaccountsExpense[] }>('expenses', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsCreditMemo[] | { data: SmartaccountsCreditMemo[] }>('creditmemos', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsCreditMemo>(`creditmemos/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsOrder[] | { data: SmartaccountsOrder[] }>('orders', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsSalesOrder[] | { data: SmartaccountsSalesOrder[] }>('salesorders', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsSalesOrder>(`salesorders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsPurchaseOrder[] | { data: SmartaccountsPurchaseOrder[] }>('purchaseorders', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new SmartaccountsClient(credentials)
    const res = await client.get<SmartaccountsPurchaseOrder>(`purchaseorders/${id}`)
    return transformPurchaseOrder(res)
  }
}
