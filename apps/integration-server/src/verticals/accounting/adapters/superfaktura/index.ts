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

import { buildAuthUrl, exchangeCode, refreshCredentials as refreshCreds } from './auth'
import { SuperfakturaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type SuperfakturaInvoice } from './transform/invoice'
import { transformBill, type SuperfakturaBill } from './transform/bill'
import { transformContact, type SuperfakturaContact } from './transform/contact'
import { transformAccount, type SuperfakturaAccount } from './transform/account'
import { transformJournal, type SuperfakturaJournal } from './transform/journal'
import { transformTransaction, type SuperfakturaTransaction } from './transform/transaction'
import { transformTaxRate, type SuperfakturaTaxRate } from './transform/taxrate'
import { transformExpense, type SuperfakturaExpense } from './transform/expense'
import { transformCreditMemo, type SuperfakturaCreditMemo } from './transform/creditmemo'
import { transformOrder, type SuperfakturaOrder } from './transform/order'
import { transformSalesOrder, type SuperfakturaSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type SuperfakturaPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type SuperfakturaOrganization } from './transform/organization'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SuperfakturaAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'superfaktura'
  readonly version = '0.1.0'

  getAuthUrl(_state: string): string { return buildAuthUrl(_state) }
  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> { return exchangeCode(code) }
  async refreshCredentials(credentials: Credentials): Promise<Credentials> { return refreshCreds(credentials) }

  private pagination(params: QueryParams) {
    return { page: params.page ?? 1, per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) }
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaOrganization>('organization')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaInvoice[]>('invoices', this.pagination(params))
    return (res ?? []).map(transformInvoice)
  }
  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaBill[]>('bills', this.pagination(params))
    return (res ?? []).map(transformBill)
  }
  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaBill>(`bills/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new SuperfakturaClient(credentials)
    // SuperFaktura uses 'clients' for contact/customer resources
    const res = await client.get<SuperfakturaContact[]>('clients', this.pagination(params))
    return (res ?? []).map(transformContact)
  }
  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaContact>(`clients/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaAccount[]>('accounts', this.pagination(params))
    return (res ?? []).map(transformAccount)
  }
  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaJournal[]>('journals', this.pagination(params))
    return (res ?? []).map(transformJournal)
  }
  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaTransaction[]>('transactions', this.pagination(params))
    return (res ?? []).map(transformTransaction)
  }
  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaTaxRate[]>('taxrates', this.pagination(params))
    return (res ?? []).map(transformTaxRate)
  }
  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaTaxRate>(`taxrates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaExpense[]>('expenses', this.pagination(params))
    return (res ?? []).map(transformExpense)
  }
  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaCreditMemo[]>('creditmemos', this.pagination(params))
    return (res ?? []).map(transformCreditMemo)
  }
  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaCreditMemo>(`creditmemos/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaOrder[]>('orders', this.pagination(params))
    return (res ?? []).map(transformOrder)
  }
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaSalesOrder[]>('salesorders', this.pagination(params))
    return (res ?? []).map(transformSalesOrder)
  }
  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaSalesOrder>(`salesorders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaPurchaseOrder[]>('purchaseorders', this.pagination(params))
    return (res ?? []).map(transformPurchaseOrder)
  }
  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new SuperfakturaClient(credentials)
    const res = await client.get<SuperfakturaPurchaseOrder>(`purchaseorders/${id}`)
    return transformPurchaseOrder(res)
  }
}
