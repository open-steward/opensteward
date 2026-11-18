import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Organization } from '../../schema/organization'
import type { TaxRate } from '../../schema/taxrate'
import type { Transaction } from '../../schema/transaction'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'

import { buildAuthUrl, exchangeCode, refreshCredentials as refreshCreds } from './auth'
import { AxonautClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type AxonautInvoice } from './transform/invoice'
import { transformBill, type AxonautBill } from './transform/bill'
import { transformContact, type AxonautContact } from './transform/contact'
import { transformAccount, type AxonautAccount } from './transform/account'
import { transformJournal, type AxonautJournal } from './transform/journal'
import { transformOrganization, type AxonautOrganization } from './transform/organization'
import { transformTaxRate, type AxonautTaxRate } from './transform/taxrate'
import { transformTransaction, type AxonautTransaction } from './transform/transaction'
import { transformExpense, type AxonautExpense } from './transform/expense'
import { transformCreditMemo, type AxonautCreditMemo } from './transform/creditmemo'
import { transformOrder, type AxonautOrder } from './transform/order'
import { transformSalesOrder, type AxonautSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type AxonautPurchaseOrder } from './transform/purchaseorder'

export class AxonautAdapter implements AccountingAdapter {
  readonly platform = 'axonaut'
  readonly version = '0.1.0'



  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCreds(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }


  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautOrganization>('company')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautInvoice[]>('invoices', this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautBill[]>('expenses', this.paginationParams(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautBill>(`expenses/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautContact[]>('companies', this.paginationParams(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautContact>(`companies/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautAccount[]>('accounting-codes', this.paginationParams(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautAccount>(`accounting-codes/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautJournal[]>('journal_entries', this.paginationParams(params))
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautJournal>(`journal_entries/${id}`)
    return transformJournal(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautTaxRate[]>('tax-rates', this.paginationParams(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautTaxRate>(`tax-rates/${id}`)
    return transformTaxRate(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautTransaction[]>('bank-transactions', this.paginationParams(params))
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautTransaction>(`bank-transactions/${id}`)
    return transformTransaction(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautExpense[]>('expenses', this.paginationParams(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautCreditMemo[]>('credit_notes', this.paginationParams(params))
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautCreditMemo>(`credit_notes/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautOrder[]>('orders', this.paginationParams(params))
    return (res ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautSalesOrder[]>('sales_orders', this.paginationParams(params))
    return (res ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautSalesOrder>(`sales_orders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautPurchaseOrder[]>('purchase_orders', this.paginationParams(params))
    return (res ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new AxonautClient(credentials)
    const res = await client.get<AxonautPurchaseOrder>(`purchase_orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
