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
import { FinmapClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type FinmapInvoice } from './transform/invoice'
import { transformBill, type FinmapBill } from './transform/bill'
import { transformContact, type FinmapContact } from './transform/contact'
import { transformAccount, type FinmapAccount } from './transform/account'
import { transformJournal, type FinmapJournal } from './transform/journal'
import { transformTransaction, type FinmapTransaction } from './transform/transaction'
import { transformTaxRate, type FinmapTaxRate } from './transform/taxrate'
import { transformExpense, type FinmapExpense } from './transform/expense'
import { transformCreditMemo, type FinmapCreditMemo } from './transform/creditmemo'
import { transformOrder, type FinmapOrder } from './transform/order'
import { transformSalesOrder, type FinmapSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type FinmapPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type FinmapOrganization } from './transform/organization'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class FinmapAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'finmap'
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
    const client = new FinmapClient(credentials)
    const res = await client.get<FinmapOrganization | { data: FinmapOrganization }>('organization')
    const raw = (res as { data: FinmapOrganization }).data ?? (res as FinmapOrganization)
    return transformOrganization(raw)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new FinmapClient(credentials)
    const res = await client.get<{ data: FinmapInvoice[] } | FinmapInvoice[]>('invoices', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: FinmapInvoice[] }).data ?? (res as FinmapInvoice[]) ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new FinmapClient(credentials)
    const res = await client.get<{ data: FinmapInvoice } | FinmapInvoice>(`invoices/${id}`)
    const raw = (res as { data: FinmapInvoice }).data ?? (res as FinmapInvoice)
    return transformInvoice(raw)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new FinmapClient(credentials)
    const res = await client.get<{ data: FinmapBill[] } | FinmapBill[]>('bills', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: FinmapBill[] }).data ?? (res as FinmapBill[]) ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new FinmapClient(credentials)
    const res = await client.get<{ data: FinmapBill } | FinmapBill>(`bills/${id}`)
    const raw = (res as { data: FinmapBill }).data ?? (res as FinmapBill)
    return transformBill(raw)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new FinmapClient(credentials)
    // Finmap uses 'customers' for customer contacts; suppliers are separate
    const res = await client.get<{ data: FinmapContact[] } | FinmapContact[]>('customers', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: FinmapContact[] }).data ?? (res as FinmapContact[]) ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new FinmapClient(credentials)
    const res = await client.get<{ data: FinmapContact } | FinmapContact>(`customers/${id}`)
    const raw = (res as { data: FinmapContact }).data ?? (res as FinmapContact)
    return transformContact(raw)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new FinmapClient(credentials)
    // Finmap exposes bank accounts via 'accounts' endpoint (read-only)
    const res = await client.get<{ data: FinmapAccount[] } | FinmapAccount[]>('accounts', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: FinmapAccount[] }).data ?? (res as FinmapAccount[]) ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new FinmapClient(credentials)
    const res = await client.get<{ data: FinmapAccount } | FinmapAccount>(`accounts/${id}`)
    const raw = (res as { data: FinmapAccount }).data ?? (res as FinmapAccount)
    return transformAccount(raw)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new FinmapClient(credentials)
    const res = await client.get<{ data: FinmapJournal[] } | FinmapJournal[]>('journals', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: FinmapJournal[] }).data ?? (res as FinmapJournal[]) ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new FinmapClient(credentials)
    const res = await client.get<{ data: FinmapJournal } | FinmapJournal>(`journals/${id}`)
    const raw = (res as { data: FinmapJournal }).data ?? (res as FinmapJournal)
    return transformJournal(raw)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new FinmapClient(credentials)
    // Finmap uses 'operations/income' for income and 'operations/expense' for outgoing.
    // We fetch income operations as the primary transaction list.
    const res = await client.get<{ data: FinmapTransaction[] } | FinmapTransaction[]>('operations/income', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: FinmapTransaction[] }).data ?? (res as FinmapTransaction[]) ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new FinmapClient(credentials)
    const res = await client.get<{ data: FinmapTransaction } | FinmapTransaction>(`operations/income/${id}`)
    const raw = (res as { data: FinmapTransaction }).data ?? (res as FinmapTransaction)
    return transformTransaction(raw)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new FinmapClient(credentials)
    const res = await client.get<{ data: FinmapTaxRate[] } | FinmapTaxRate[]>('taxrates', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: FinmapTaxRate[] }).data ?? (res as FinmapTaxRate[]) ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new FinmapClient(credentials)
    const res = await client.get<{ data: FinmapTaxRate } | FinmapTaxRate>(`taxrates/${id}`)
    const raw = (res as { data: FinmapTaxRate }).data ?? (res as FinmapTaxRate)
    return transformTaxRate(raw)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new FinmapClient(credentials)
    const res = await client.get<{ data: FinmapExpense[] } | FinmapExpense[]>('expenses', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: FinmapExpense[] }).data ?? (res as FinmapExpense[]) ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new FinmapClient(credentials)
    const res = await client.get<{ data: FinmapExpense } | FinmapExpense>(`expenses/${id}`)
    const raw = (res as { data: FinmapExpense }).data ?? (res as FinmapExpense)
    return transformExpense(raw)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new FinmapClient(credentials)
    const res = await client.get<{ data: FinmapCreditMemo[] } | FinmapCreditMemo[]>('creditmemos', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: FinmapCreditMemo[] }).data ?? (res as FinmapCreditMemo[]) ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new FinmapClient(credentials)
    const res = await client.get<{ data: FinmapCreditMemo } | FinmapCreditMemo>(`creditmemos/${id}`)
    const raw = (res as { data: FinmapCreditMemo }).data ?? (res as FinmapCreditMemo)
    return transformCreditMemo(raw)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new FinmapClient(credentials)
    const res = await client.get<{ data: FinmapOrder[] } | FinmapOrder[]>('orders', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: FinmapOrder[] }).data ?? (res as FinmapOrder[]) ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new FinmapClient(credentials)
    const res = await client.get<{ data: FinmapOrder } | FinmapOrder>(`orders/${id}`)
    const raw = (res as { data: FinmapOrder }).data ?? (res as FinmapOrder)
    return transformOrder(raw)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new FinmapClient(credentials)
    const res = await client.get<{ data: FinmapSalesOrder[] } | FinmapSalesOrder[]>('salesorders', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: FinmapSalesOrder[] }).data ?? (res as FinmapSalesOrder[]) ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new FinmapClient(credentials)
    const res = await client.get<{ data: FinmapSalesOrder } | FinmapSalesOrder>(`salesorders/${id}`)
    const raw = (res as { data: FinmapSalesOrder }).data ?? (res as FinmapSalesOrder)
    return transformSalesOrder(raw)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new FinmapClient(credentials)
    const res = await client.get<{ data: FinmapPurchaseOrder[] } | FinmapPurchaseOrder[]>('purchaseorders', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return ((res as { data: FinmapPurchaseOrder[] }).data ?? (res as FinmapPurchaseOrder[]) ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new FinmapClient(credentials)
    const res = await client.get<{ data: FinmapPurchaseOrder } | FinmapPurchaseOrder>(`purchaseorders/${id}`)
    const raw = (res as { data: FinmapPurchaseOrder }).data ?? (res as FinmapPurchaseOrder)
    return transformPurchaseOrder(raw)
  }
}
