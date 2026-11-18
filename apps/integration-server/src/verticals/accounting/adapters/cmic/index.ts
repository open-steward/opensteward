import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Organization } from '../../schema/organization'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'

import { buildAuthUrl, exchangeCode, refreshCredentials } from './auth'
import { CmicClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type CmicInvoice } from './transform/invoice'
import { transformBill, type CmicBill } from './transform/bill'
import { transformContact, type CmicContact } from './transform/contact'
import { transformAccount, type CmicAccount } from './transform/account'
import { transformJournal, type CmicJournal } from './transform/journal'
import { transformOrganization, type CmicOrganization } from './transform/organization'
import { transformTransaction, type CmicTransaction } from './transform/transaction'
import { transformTaxRate, type CmicTaxRate } from './transform/taxrate'
import { transformExpense, type CmicExpense } from './transform/expense'
import { transformCreditMemo, type CmicCreditMemo } from './transform/creditmemo'
import { transformOrder, type CmicOrder } from './transform/order'
import { transformSalesOrder, type CmicSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type CmicPurchaseOrder } from './transform/purchaseorder'

interface CmicAdapterConfig {
  apiKey: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class CmicAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'cmic'
  readonly version = '0.1.0'

  private apiKey: string

  constructor(config: CmicAdapterConfig) {
    this.apiKey = config.apiKey
  }

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  private credentials(): Credentials {
    return { accessToken: this.apiKey }
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
      ...(params.updatedAfter && { modifiedAfter: params.updatedAfter.toISOString() }),
    }
  }

  // --- Organization ---

  async getOrganization(_credentials: Credentials): Promise<Organization> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<CmicOrganization>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(_credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<{ Data: CmicInvoice[] }>('invoices', {
      ...this.paginationParams(params),
      Type: 'ProgressBilling',
    })
    return (res.Data ?? []).map(transformInvoice)
  }

  async getInvoice(_credentials: Credentials, id: string): Promise<Invoice> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<CmicInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(_credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<{ Data: CmicBill[] }>('invoices', {
      ...this.paginationParams(params),
      Type: 'SubcontractorInvoice',
    })
    return (res.Data ?? []).map(transformBill)
  }

  async getBill(_credentials: Credentials, id: string): Promise<Bill> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<CmicBill>(`invoices/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(_credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<{ Data: CmicContact[] }>(
      'vendors',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformContact)
  }

  async getContact(_credentials: Credentials, id: string): Promise<Contact> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<CmicContact>(`vendors/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(_credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<{ Data: CmicAccount[] }>(
      'accounts',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformAccount)
  }

  async getAccount(_credentials: Credentials, id: string): Promise<Account> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<CmicAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(_credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<{ Data: CmicJournal[] }>(
      'journalEntries',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformJournal)
  }

  async getJournal(_credentials: Credentials, id: string): Promise<Journal> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<CmicJournal>(`journalEntries/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(_credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<{ Data: CmicTransaction[] }>(
      'transactions',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformTransaction)
  }

  async getTransaction(_credentials: Credentials, id: string): Promise<Transaction> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<CmicTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(_credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<{ Data: CmicTaxRate[] }>(
      'taxRates',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformTaxRate)
  }

  async getTaxRate(_credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<CmicTaxRate>(`taxRates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(_credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<{ Data: CmicExpense[] }>(
      'expenses',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformExpense)
  }

  async getExpense(_credentials: Credentials, id: string): Promise<Expense> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<CmicExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(_credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<{ Data: CmicCreditMemo[] }>(
      'creditMemos',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(_credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<CmicCreditMemo>(`creditMemos/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(_credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<{ Data: CmicOrder[] }>(
      'subcontracts',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformOrder)
  }

  async getOrder(_credentials: Credentials, id: string): Promise<Order> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<CmicOrder>(`subcontracts/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(_credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<{ Data: CmicSalesOrder[] }>(
      'changeOrders',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(_credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<CmicSalesOrder>(`changeOrders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    _credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<{ Data: CmicPurchaseOrder[] }>(
      'purchaseOrders',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(_credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new CmicClient(this.credentials())
    const res = await client.get<CmicPurchaseOrder>(`purchaseOrders/${id}`)
    return transformPurchaseOrder(res)
  }
}
