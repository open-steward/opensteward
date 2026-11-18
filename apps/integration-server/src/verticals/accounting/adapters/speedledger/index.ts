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
import { SpeedLedgerClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type SpeedLedgerInvoice } from './transform/invoice'
import { transformBill, type SpeedLedgerBill } from './transform/bill'
import { transformContact, type SpeedLedgerContact } from './transform/contact'
import { transformAccount, type SpeedLedgerAccount } from './transform/account'
import { transformJournal, type SpeedLedgerJournal } from './transform/journal'
import { transformOrganization, type SpeedLedgerOrganization } from './transform/organization'
import { transformExpense, type SpeedLedgerExpense } from './transform/expense'
import { transformTaxRate, type SpeedLedgerTaxRate } from './transform/taxrate'
import { transformTransaction, type SpeedLedgerTransaction } from './transform/transaction'
import { transformCreditMemo, type SpeedLedgerCreditMemo } from './transform/creditmemo'
import { transformOrder, type SpeedLedgerOrder } from './transform/order'
import { transformSalesOrder, type SpeedLedgerSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type SpeedLedgerPurchaseOrder } from './transform/purchaseorder'

export class SpeedLedgerAdapter implements AccountingAdapter {
  readonly platform = 'speedledger'
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
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerOrganization>('organization')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerInvoice[]>('invoices', this.pagination(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerBill[]>('bills', this.pagination(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerContact[]>('contacts', this.pagination(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerAccount[]>('accounts', this.pagination(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerJournal[]>('journal-entries', this.pagination(params))
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerJournal>(`journal-entries/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerTransaction[]>('transactions', this.pagination(params))
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerTaxRate[]>('tax-rates', this.pagination(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerTaxRate>(`tax-rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerExpense[]>('expenses', this.pagination(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerCreditMemo[]>('credit-memos', this.pagination(params))
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerCreditMemo>(`credit-memos/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerOrder[]>('orders', this.pagination(params))
    return (res ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerSalesOrder[]>('sales-orders', this.pagination(params))
    return (res ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerSalesOrder>(`sales-orders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerPurchaseOrder[]>(
      'purchase-orders',
      this.pagination(params),
    )
    return (res ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new SpeedLedgerClient(credentials)
    const res = await client.get<SpeedLedgerPurchaseOrder>(`purchase-orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
