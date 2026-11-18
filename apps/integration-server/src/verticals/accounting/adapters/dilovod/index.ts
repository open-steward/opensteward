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
import { DilovodClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type DilovodInvoice } from './transform/invoice'
import { transformBill, type DilovodBill } from './transform/bill'
import { transformContact, type DilovodContact } from './transform/contact'
import { transformAccount, type DilovodAccount } from './transform/account'
import { transformJournal, type DilovodJournal } from './transform/journal'
import { transformTransaction, type DilovodTransaction } from './transform/transaction'
import { transformTaxRate, type DilovodTaxRate } from './transform/taxrate'
import { transformExpense, type DilovodExpense } from './transform/expense'
import { transformCreditMemo, type DilovodCreditMemo } from './transform/creditmemo'
import { transformOrder, type DilovodOrder } from './transform/order'
import { transformSalesOrder, type DilovodSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type DilovodPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type DilovodOrganization } from './transform/organization'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class DilovodAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'dilovod'
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
    const client = new DilovodClient(credentials)
    const res = await client.get<DilovodOrganization | { data: DilovodOrganization }>('organization')
    const raw = (res as { data: DilovodOrganization }).data ?? (res as DilovodOrganization)
    return transformOrganization(raw)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodInvoice[] } | DilovodInvoice[]>('invoices', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: DilovodInvoice[] }).data ?? (res as DilovodInvoice[]) ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodInvoice } | DilovodInvoice>(`invoices/${id}`)
    const raw = (res as { data: DilovodInvoice }).data ?? (res as DilovodInvoice)
    return transformInvoice(raw)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodBill[] } | DilovodBill[]>('bills', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: DilovodBill[] }).data ?? (res as DilovodBill[]) ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodBill } | DilovodBill>(`bills/${id}`)
    const raw = (res as { data: DilovodBill }).data ?? (res as DilovodBill)
    return transformBill(raw)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodContact[] } | DilovodContact[]>('contacts', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: DilovodContact[] }).data ?? (res as DilovodContact[]) ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodContact } | DilovodContact>(`contacts/${id}`)
    const raw = (res as { data: DilovodContact }).data ?? (res as DilovodContact)
    return transformContact(raw)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodAccount[] } | DilovodAccount[]>('accounts', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: DilovodAccount[] }).data ?? (res as DilovodAccount[]) ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodAccount } | DilovodAccount>(`accounts/${id}`)
    const raw = (res as { data: DilovodAccount }).data ?? (res as DilovodAccount)
    return transformAccount(raw)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodJournal[] } | DilovodJournal[]>('journals', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: DilovodJournal[] }).data ?? (res as DilovodJournal[]) ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodJournal } | DilovodJournal>(`journals/${id}`)
    const raw = (res as { data: DilovodJournal }).data ?? (res as DilovodJournal)
    return transformJournal(raw)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodTransaction[] } | DilovodTransaction[]>('transactions', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: DilovodTransaction[] }).data ?? (res as DilovodTransaction[]) ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodTransaction } | DilovodTransaction>(`transactions/${id}`)
    const raw = (res as { data: DilovodTransaction }).data ?? (res as DilovodTransaction)
    return transformTransaction(raw)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodTaxRate[] } | DilovodTaxRate[]>('taxrates', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: DilovodTaxRate[] }).data ?? (res as DilovodTaxRate[]) ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodTaxRate } | DilovodTaxRate>(`taxrates/${id}`)
    const raw = (res as { data: DilovodTaxRate }).data ?? (res as DilovodTaxRate)
    return transformTaxRate(raw)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodExpense[] } | DilovodExpense[]>('expenses', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: DilovodExpense[] }).data ?? (res as DilovodExpense[]) ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodExpense } | DilovodExpense>(`expenses/${id}`)
    const raw = (res as { data: DilovodExpense }).data ?? (res as DilovodExpense)
    return transformExpense(raw)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodCreditMemo[] } | DilovodCreditMemo[]>('creditmemos', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: DilovodCreditMemo[] }).data ?? (res as DilovodCreditMemo[]) ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodCreditMemo } | DilovodCreditMemo>(`creditmemos/${id}`)
    const raw = (res as { data: DilovodCreditMemo }).data ?? (res as DilovodCreditMemo)
    return transformCreditMemo(raw)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodOrder[] } | DilovodOrder[]>('orders', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: DilovodOrder[] }).data ?? (res as DilovodOrder[]) ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodOrder } | DilovodOrder>(`orders/${id}`)
    const raw = (res as { data: DilovodOrder }).data ?? (res as DilovodOrder)
    return transformOrder(raw)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodSalesOrder[] } | DilovodSalesOrder[]>('salesorders', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: DilovodSalesOrder[] }).data ?? (res as DilovodSalesOrder[]) ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodSalesOrder } | DilovodSalesOrder>(`salesorders/${id}`)
    const raw = (res as { data: DilovodSalesOrder }).data ?? (res as DilovodSalesOrder)
    return transformSalesOrder(raw)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodPurchaseOrder[] } | DilovodPurchaseOrder[]>('purchaseorders', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: DilovodPurchaseOrder[] }).data ?? (res as DilovodPurchaseOrder[]) ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new DilovodClient(credentials)
    const res = await client.get<{ data: DilovodPurchaseOrder } | DilovodPurchaseOrder>(`purchaseorders/${id}`)
    const raw = (res as { data: DilovodPurchaseOrder }).data ?? (res as DilovodPurchaseOrder)
    return transformPurchaseOrder(raw)
  }
}
