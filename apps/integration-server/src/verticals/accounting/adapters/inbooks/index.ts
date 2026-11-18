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

import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefreshCredentials,
} from './auth'
import { InbooksClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type InbooksInvoice } from './transform/invoice'
import { transformBill, type InbooksBill } from './transform/bill'
import { transformContact, type InbooksContact } from './transform/contact'
import { transformAccount, type InbooksAccount } from './transform/account'
import { transformJournal, type InbooksJournal } from './transform/journal'
import { transformOrganization, type InbooksOrganization } from './transform/organization'
import { transformExpense, type InbooksExpense } from './transform/expense'
import { transformTaxRate, type InbooksTaxRate } from './transform/taxrate'
import { transformTransaction, type InbooksTransaction } from './transform/transaction'
import { transformCreditMemo, type InbooksCreditMemo } from './transform/creditmemo'
import { transformOrder, type InbooksOrder } from './transform/order'
import { transformSalesOrder, type InbooksSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type InbooksPurchaseOrder } from './transform/purchaseorder'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class InbooksAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'inbooks'
  readonly version = '0.1.0'

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private pagination(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksOrganization>('organization')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksInvoice[]>('invoices', this.pagination(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksBill[]>('bills', this.pagination(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksContact[]>('contacts', this.pagination(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksAccount[]>('accounts', this.pagination(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksJournal[]>('journal-entries', this.pagination(params))
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksJournal>(`journal-entries/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksTransaction[]>('transactions', this.pagination(params))
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksTaxRate[]>('tax-rates', this.pagination(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksTaxRate>(`tax-rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksExpense[]>('expenses', this.pagination(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksCreditMemo[]>('credit-notes', this.pagination(params))
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksCreditMemo>(`credit-notes/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksOrder[]>('orders', this.pagination(params))
    return (res ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksSalesOrder[]>('sales-orders', this.pagination(params))
    return (res ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksSalesOrder>(`sales-orders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksPurchaseOrder[]>('purchase-orders', this.pagination(params))
    return (res ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new InbooksClient(credentials)
    const res = await client.get<InbooksPurchaseOrder>(`purchase-orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
