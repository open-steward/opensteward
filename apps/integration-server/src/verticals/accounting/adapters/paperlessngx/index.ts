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
import { PaperlessNgxClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type PaperlessngxInvoice } from './transform/invoice'
import { transformBill } from './transform/bill'
import { transformContact, type PaperlessngxContact } from './transform/contact'
import { transformAccount, type PaperlessngxAccount } from './transform/account'
import { transformJournal } from './transform/journal'
import { transformOrganization } from './transform/organization'
import { transformExpense } from './transform/expense'
import { transformTaxRate, type PaperlessngxTaxRate } from './transform/taxrate'
import { transformTransaction } from './transform/transaction'
import { transformCreditMemo } from './transform/creditmemo'
import { transformOrder } from './transform/order'
import { transformSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder } from './transform/purchaseorder'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class PaperlessNgxAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'paperlessngx'
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
      page_size: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<PaperlessngxContact>('correspondents/1')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<{ results: PaperlessngxInvoice[] }>('documents', {
      ...this.paginationParams(params),
      document_type__name__icontains: 'invoice',
    })
    return (res.results ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<PaperlessngxInvoice>(`documents/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<{ results: PaperlessngxInvoice[] }>('documents', {
      ...this.paginationParams(params),
      document_type__name__icontains: 'bill',
    })
    return (res.results ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<PaperlessngxInvoice>(`documents/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<{ results: PaperlessngxContact[] }>('correspondents', this.paginationParams(params))
    return (res.results ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<PaperlessngxContact>(`correspondents/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<{ results: PaperlessngxAccount[] }>('document_types', this.paginationParams(params))
    return (res.results ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<PaperlessngxAccount>(`document_types/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<{ results: PaperlessngxInvoice[] }>('documents', this.paginationParams(params))
    return (res.results ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<PaperlessngxInvoice>(`documents/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<{ results: PaperlessngxInvoice[] }>('documents', this.paginationParams(params))
    return (res.results ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<PaperlessngxInvoice>(`documents/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<{ results: PaperlessngxTaxRate[] }>('custom_fields', this.paginationParams(params))
    return (res.results ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<PaperlessngxTaxRate>(`custom_fields/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<{ results: PaperlessngxInvoice[] }>('documents', {
      ...this.paginationParams(params),
      document_type__name__icontains: 'expense',
    })
    return (res.results ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<PaperlessngxInvoice>(`documents/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<{ results: PaperlessngxInvoice[] }>('documents', {
      ...this.paginationParams(params),
      document_type__name__icontains: 'credit',
    })
    return (res.results ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<PaperlessngxInvoice>(`documents/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<{ results: PaperlessngxInvoice[] }>('documents', {
      ...this.paginationParams(params),
      document_type__name__icontains: 'order',
    })
    return (res.results ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<PaperlessngxInvoice>(`documents/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<{ results: PaperlessngxInvoice[] }>('documents', {
      ...this.paginationParams(params),
      document_type__name__icontains: 'sales_order',
    })
    return (res.results ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<PaperlessngxInvoice>(`documents/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<{ results: PaperlessngxInvoice[] }>('documents', {
      ...this.paginationParams(params),
      document_type__name__icontains: 'purchase_order',
    })
    return (res.results ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new PaperlessNgxClient(credentials)
    const res = await client.get<PaperlessngxInvoice>(`documents/${id}`)
    return transformPurchaseOrder(res)
  }
}
