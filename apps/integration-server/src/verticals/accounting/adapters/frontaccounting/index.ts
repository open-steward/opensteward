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
import { FrontAccountingClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type FAInvoice } from './transform/invoice'
import { transformBill, type FABill } from './transform/bill'
import { transformDebtor, transformSupplier, type FADebtor, type FASupplier } from './transform/contact'
import { transformAccount, type FAAccount } from './transform/account'
import { transformJournal, type FAJournal } from './transform/journal'
import { transformOrganization, type FACompany } from './transform/organization'
import { transformTransaction, type FATransaction } from './transform/transaction'
import { transformTaxRate, type FATaxType } from './transform/taxrate'
import { transformExpense, type FAExpense } from './transform/expense'
import { transformCreditMemo, type FACredit } from './transform/creditmemo'
import { transformOrder, type FAOrder } from './transform/order'
import { transformSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type FAPurchaseOrder } from './transform/purchaseorder'

interface FrontAccountingAdapterConfig {
  apiToken: string
  baseUrl?: string
}

interface FAListResponse<T> {
  results?: T[]
  data?: T[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class FrontAccountingAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'frontaccounting'
  readonly version = '0.1.0'

  private readonly config: FrontAccountingAdapterConfig

  constructor(config: FrontAccountingAdapterConfig) {
    this.config = config
  }

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  private client(credentials: Credentials): FrontAccountingClient {
    return new FrontAccountingClient(credentials, this.config.baseUrl)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      page: params.page ?? 1,
    }
  }

  private unwrap<T>(res: FAListResponse<T> | T[]): T[] {
    if (Array.isArray(res)) return res
    return res.results ?? res.data ?? []
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const c = this.client(credentials)
    const res = await c.get<FACompany>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const c = this.client(credentials)
    const res = await c.get<FAListResponse<FAInvoice> | FAInvoice[]>('sales_invoices', this.paginationParams(params))
    return this.unwrap(res).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const c = this.client(credentials)
    const res = await c.get<FAInvoice>('sales_invoice', { id })
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const c = this.client(credentials)
    const res = await c.get<FAListResponse<FABill> | FABill[]>('supplier_invoices', this.paginationParams(params))
    return this.unwrap(res).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const c = this.client(credentials)
    const res = await c.get<FABill>('supplier_invoice', { id })
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const c = this.client(credentials)
    const [debtors, suppliers] = await Promise.all([
      c.get<FAListResponse<FADebtor> | FADebtor[]>('customers', this.paginationParams(params)),
      c.get<FAListResponse<FASupplier> | FASupplier[]>('suppliers', this.paginationParams(params)),
    ])
    return [
      ...this.unwrap(debtors).map(transformDebtor),
      ...this.unwrap(suppliers).map(transformSupplier),
    ]
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const c = this.client(credentials)
    const res = await c.get<FAListResponse<FAAccount> | FAAccount[]>('chart_of_accounts', this.paginationParams(params))
    return this.unwrap(res).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const c = this.client(credentials)
    const res = await c.get<FAAccount>('chart_of_account', { id })
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const c = this.client(credentials)
    const res = await c.get<FAListResponse<FAJournal> | FAJournal[]>('journal_entries', this.paginationParams(params))
    return this.unwrap(res).map(transformJournal)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const c = this.client(credentials)
    const res = await c.get<FAListResponse<FATransaction> | FATransaction[]>('bank_transactions', this.paginationParams(params))
    return this.unwrap(res).map(transformTransaction)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const c = this.client(credentials)
    const res = await c.get<FAListResponse<FATaxType> | FATaxType[]>('tax_types', this.paginationParams(params))
    return this.unwrap(res).map(transformTaxRate)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const c = this.client(credentials)
    const res = await c.get<FAListResponse<FAExpense> | FAExpense[]>('payment_vouchers', this.paginationParams(params))
    return this.unwrap(res).map(transformExpense)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const c = this.client(credentials)
    const res = await c.get<FAListResponse<FACredit> | FACredit[]>('credit_notes', this.paginationParams(params))
    return this.unwrap(res).map(transformCreditMemo)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const c = this.client(credentials)
    const res = await c.get<FAListResponse<FAOrder> | FAOrder[]>('sales_orders', this.paginationParams(params))
    return this.unwrap(res).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const c = this.client(credentials)
    const res = await c.get<FAOrder>('sales_order', { id })
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const c = this.client(credentials)
    const res = await c.get<FAListResponse<FAOrder> | FAOrder[]>('sales_orders', this.paginationParams(params))
    return this.unwrap(res).map(transformSalesOrder)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const c = this.client(credentials)
    const res = await c.get<FAListResponse<FAPurchaseOrder> | FAPurchaseOrder[]>('purchase_orders', this.paginationParams(params))
    return this.unwrap(res).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const c = this.client(credentials)
    const res = await c.get<FAPurchaseOrder>('purchase_order', { id })
    return transformPurchaseOrder(res)
  }
}
