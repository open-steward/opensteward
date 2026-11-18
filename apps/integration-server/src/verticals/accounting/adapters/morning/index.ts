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

import { getAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefreshCredentials } from './auth'
import { MorningClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type MorningDocument } from './transform/invoice'
import { transformBill } from './transform/bill'
import { transformContact, type MorningClient as MorningClientData } from './transform/contact'
import { transformAccount, type MorningAccount } from './transform/account'
import { transformOrganization, type MorningBusiness } from './transform/organization'
import { transformTransaction, type MorningIncome } from './transform/transaction'
import { transformTaxRate, MORNING_TAX_RATES } from './transform/taxrate'
import { transformExpense, type MorningExpense } from './transform/expense'
import { transformCreditMemo } from './transform/creditmemo'
import { transformJournal, type MorningJournal } from './transform/journal'
import { transformOrder } from './transform/order'
import { transformSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder } from './transform/purchaseorder'

interface MorningAdapterConfig {
  apiKey: string
  apiSecret: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class MorningAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'morning'
  readonly version = '0.1.0'

  private apiKey: string
  private apiSecret: string

  constructor(config: MorningAdapterConfig) {
    this.apiKey = config.apiKey
    this.apiSecret = config.apiSecret
  }

  getAuthUrl(_state: string): string {
    return getAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private makeCredentials(): Credentials {
    return {
      accessToken: this.apiKey,
      extra: { apiSecret: this.apiSecret },
    }
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new MorningClient(credentials)
    const res = await client.get<MorningBusiness>('business')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new MorningClient(credentials)
    const res = await client.get<{ items: MorningDocument[] }>('documents', {
      ...this.paginationParams(params),
      type: 320, // invoice type
    })
    return (res.items ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new MorningClient(credentials)
    const res = await client.get<MorningDocument>(`documents/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new MorningClient(credentials)
    const res = await client.get<{ items: MorningDocument[] }>('documents', {
      ...this.paginationParams(params),
      type: 400, // purchase invoice type
    })
    return (res.items ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new MorningClient(credentials)
    const res = await client.get<MorningDocument>(`documents/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new MorningClient(credentials)
    const res = await client.get<{ items: MorningClientData[] }>('clients', this.paginationParams(params))
    return (res.items ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new MorningClient(credentials)
    const res = await client.get<MorningClientData>(`clients/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new MorningClient(credentials)
    const res = await client.get<{ items: MorningAccount[] }>('accounts', this.paginationParams(params))
    return (res.items ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new MorningClient(credentials)
    const res = await client.get<MorningAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new MorningClient(credentials)
    const res = await client.get<{ items: MorningJournal[] }>('journals', this.paginationParams(params))
    return (res.items ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new MorningClient(credentials)
    const res = await client.get<MorningJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new MorningClient(credentials)
    const res = await client.get<{ items: MorningIncome[] }>('incomes', this.paginationParams(params))
    return (res.items ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new MorningClient(credentials)
    const res = await client.get<MorningIncome>(`incomes/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(_credentials: Credentials, _params: QueryParams): Promise<TaxRate[]> {
    return MORNING_TAX_RATES.map(transformTaxRate)
  }

  async getTaxRate(_credentials: Credentials, id: string): Promise<TaxRate> {
    const rate = MORNING_TAX_RATES.find((r) => r.id === id)
    if (!rate) throw new Error(`TaxRate not found: ${id}`)
    return transformTaxRate(rate)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new MorningClient(credentials)
    const res = await client.get<{ items: MorningExpense[] }>('expenses', this.paginationParams(params))
    return (res.items ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new MorningClient(credentials)
    const res = await client.get<MorningExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new MorningClient(credentials)
    const res = await client.get<{ items: MorningDocument[] }>('documents', {
      ...this.paginationParams(params),
      type: 330, // credit note type
    })
    return (res.items ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new MorningClient(credentials)
    const res = await client.get<MorningDocument>(`documents/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new MorningClient(credentials)
    const res = await client.get<{ items: MorningDocument[] }>('documents', {
      ...this.paginationParams(params),
      type: 100, // order type
    })
    return (res.items ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new MorningClient(credentials)
    const res = await client.get<MorningDocument>(`documents/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new MorningClient(credentials)
    const res = await client.get<{ items: MorningDocument[] }>('documents', {
      ...this.paginationParams(params),
      type: 200, // sales order type
    })
    return (res.items ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new MorningClient(credentials)
    const res = await client.get<MorningDocument>(`documents/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new MorningClient(credentials)
    const res = await client.get<{ items: MorningDocument[] }>('documents', {
      ...this.paginationParams(params),
      type: 400, // purchase order type
    })
    return (res.items ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new MorningClient(credentials)
    const res = await client.get<MorningDocument>(`documents/${id}`)
    return transformPurchaseOrder(res)
  }
}
