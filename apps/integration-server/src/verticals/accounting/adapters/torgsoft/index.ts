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
import { TorgsoftClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type TorgsoftInvoice } from './transform/invoice'
import { transformBill, type TorgsoftBill } from './transform/bill'
import { transformContact, type TorgsoftContact } from './transform/contact'
import { transformAccount, type TorgsoftAccount } from './transform/account'
import { transformJournal, type TorgsoftJournal } from './transform/journal'
import { transformTransaction, type TorgsoftTransaction } from './transform/transaction'
import { transformTaxRate, type TorgsoftTaxRate } from './transform/taxrate'
import { transformExpense, type TorgsoftExpense } from './transform/expense'
import { transformCreditMemo, type TorgsoftCreditMemo } from './transform/creditmemo'
import { transformOrder, type TorgsoftOrder } from './transform/order'
import { transformSalesOrder, type TorgsoftSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type TorgsoftPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type TorgsoftOrganization } from './transform/organization'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class TorgsoftAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'torgsoft'
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

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<TorgsoftOrganization | { data: TorgsoftOrganization }>('organization')
    const raw = (res as { data: TorgsoftOrganization }).data ?? (res as TorgsoftOrganization)
    return transformOrganization(raw)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftInvoice[] } | TorgsoftInvoice[]>('invoices', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: TorgsoftInvoice[] }).data ?? (res as TorgsoftInvoice[]) ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftInvoice } | TorgsoftInvoice>(`invoices/${id}`)
    const raw = (res as { data: TorgsoftInvoice }).data ?? (res as TorgsoftInvoice)
    return transformInvoice(raw)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftBill[] } | TorgsoftBill[]>('bills', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: TorgsoftBill[] }).data ?? (res as TorgsoftBill[]) ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftBill } | TorgsoftBill>(`bills/${id}`)
    const raw = (res as { data: TorgsoftBill }).data ?? (res as TorgsoftBill)
    return transformBill(raw)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftContact[] } | TorgsoftContact[]>('contacts', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: TorgsoftContact[] }).data ?? (res as TorgsoftContact[]) ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftContact } | TorgsoftContact>(`contacts/${id}`)
    const raw = (res as { data: TorgsoftContact }).data ?? (res as TorgsoftContact)
    return transformContact(raw)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftAccount[] } | TorgsoftAccount[]>('accounts', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: TorgsoftAccount[] }).data ?? (res as TorgsoftAccount[]) ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftAccount } | TorgsoftAccount>(`accounts/${id}`)
    const raw = (res as { data: TorgsoftAccount }).data ?? (res as TorgsoftAccount)
    return transformAccount(raw)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftJournal[] } | TorgsoftJournal[]>('journals', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: TorgsoftJournal[] }).data ?? (res as TorgsoftJournal[]) ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftJournal } | TorgsoftJournal>(`journals/${id}`)
    const raw = (res as { data: TorgsoftJournal }).data ?? (res as TorgsoftJournal)
    return transformJournal(raw)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftTransaction[] } | TorgsoftTransaction[]>('transactions', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: TorgsoftTransaction[] }).data ?? (res as TorgsoftTransaction[]) ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftTransaction } | TorgsoftTransaction>(`transactions/${id}`)
    const raw = (res as { data: TorgsoftTransaction }).data ?? (res as TorgsoftTransaction)
    return transformTransaction(raw)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftTaxRate[] } | TorgsoftTaxRate[]>('taxrates', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: TorgsoftTaxRate[] }).data ?? (res as TorgsoftTaxRate[]) ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftTaxRate } | TorgsoftTaxRate>(`taxrates/${id}`)
    const raw = (res as { data: TorgsoftTaxRate }).data ?? (res as TorgsoftTaxRate)
    return transformTaxRate(raw)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftExpense[] } | TorgsoftExpense[]>('expenses', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: TorgsoftExpense[] }).data ?? (res as TorgsoftExpense[]) ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftExpense } | TorgsoftExpense>(`expenses/${id}`)
    const raw = (res as { data: TorgsoftExpense }).data ?? (res as TorgsoftExpense)
    return transformExpense(raw)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftCreditMemo[] } | TorgsoftCreditMemo[]>('creditmemos', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: TorgsoftCreditMemo[] }).data ?? (res as TorgsoftCreditMemo[]) ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftCreditMemo } | TorgsoftCreditMemo>(`creditmemos/${id}`)
    const raw = (res as { data: TorgsoftCreditMemo }).data ?? (res as TorgsoftCreditMemo)
    return transformCreditMemo(raw)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftOrder[] } | TorgsoftOrder[]>('orders', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: TorgsoftOrder[] }).data ?? (res as TorgsoftOrder[]) ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftOrder } | TorgsoftOrder>(`orders/${id}`)
    const raw = (res as { data: TorgsoftOrder }).data ?? (res as TorgsoftOrder)
    return transformOrder(raw)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftSalesOrder[] } | TorgsoftSalesOrder[]>('salesorders', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: TorgsoftSalesOrder[] }).data ?? (res as TorgsoftSalesOrder[]) ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftSalesOrder } | TorgsoftSalesOrder>(`salesorders/${id}`)
    const raw = (res as { data: TorgsoftSalesOrder }).data ?? (res as TorgsoftSalesOrder)
    return transformSalesOrder(raw)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftPurchaseOrder[] } | TorgsoftPurchaseOrder[]>('purchaseorders', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: TorgsoftPurchaseOrder[] }).data ?? (res as TorgsoftPurchaseOrder[]) ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new TorgsoftClient(credentials)
    const res = await client.get<{ data: TorgsoftPurchaseOrder } | TorgsoftPurchaseOrder>(`purchaseorders/${id}`)
    const raw = (res as { data: TorgsoftPurchaseOrder }).data ?? (res as TorgsoftPurchaseOrder)
    return transformPurchaseOrder(raw)
  }
}
