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

import { DOLIBARR_CREDENTIAL_FORM, buildAuthUrl, exchangeCode, refreshCredentials } from './auth'
import { DolibarrClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type DolibarrInvoice } from './transform/invoice'
import { transformBill, type DolibarrSupplierInvoice } from './transform/bill'
import { transformContact, type DolibarrThirdParty } from './transform/contact'
import { transformAccount, type DolibarrAccount } from './transform/account'
import { transformJournal, type DolibarrJournal } from './transform/journal'
import { transformOrganization, type DolibarrCompany } from './transform/organization'
import { transformTransaction, type DolibarrBankTransaction } from './transform/transaction'
import { transformTaxRate, type DolibarrTaxRate } from './transform/taxrate'
import { transformExpense, type DolibarrExpense } from './transform/expense'
import { transformCreditMemo, type DolibarrCredit } from './transform/creditmemo'
import { transformOrder, type DolibarrOrder } from './transform/order'
import { transformSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type DolibarrPurchaseOrder } from './transform/purchaseorder'

interface DolibarrAdapterConfig {
  apiKey: string
  /** Deployment-level fallback only; connections carry their own instance URL. */
  baseUrl?: string
}

export class DolibarrAdapter implements AccountingAdapter {

  // Connect Link support — instance URL + API key (see auth.ts).

  credentialFields = DOLIBARR_CREDENTIAL_FORM.credentialFields

  exchangeCredentials = DOLIBARR_CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'dolibarr'
  readonly version = '0.1.0'

  private readonly config: DolibarrAdapterConfig

  constructor(config: DolibarrAdapterConfig) {
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

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      page: (params.page ?? 1) - 1,
      ...(params.updatedAfter && { sortfield: 'tms', sortorder: 'ASC' }),
    }
  }

  private client(credentials: Credentials): DolibarrClient {
    return new DolibarrClient(credentials, this.config.baseUrl)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const c = this.client(credentials)
    const res = await c.get<DolibarrCompany>('setup/company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const c = this.client(credentials)
    const res = await c.get<DolibarrInvoice[]>('invoices', this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const c = this.client(credentials)
    const res = await c.get<DolibarrInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const c = this.client(credentials)
    const res = await c.get<DolibarrSupplierInvoice[]>('supplierinvoices', this.paginationParams(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const c = this.client(credentials)
    const res = await c.get<DolibarrSupplierInvoice>(`supplierinvoices/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const c = this.client(credentials)
    const res = await c.get<DolibarrThirdParty[]>('thirdparties', this.paginationParams(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const c = this.client(credentials)
    const res = await c.get<DolibarrThirdParty>(`thirdparties/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const c = this.client(credentials)
    const res = await c.get<DolibarrAccount[]>('bankaccounts', this.paginationParams(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const c = this.client(credentials)
    const res = await c.get<DolibarrAccount>(`bankaccounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const c = this.client(credentials)
    const res = await c.get<DolibarrJournal[]>('accountancy/export/journals', this.paginationParams(params))
    return (res ?? []).map(transformJournal)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const c = this.client(credentials)
    const res = await c.get<DolibarrBankTransaction[]>('bankaccounts/lines', this.paginationParams(params))
    return (res ?? []).map(transformTransaction)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const c = this.client(credentials)
    const res = await c.get<DolibarrTaxRate[]>('setup/dictionary/vat', this.paginationParams(params))
    return (res ?? []).map(transformTaxRate)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const c = this.client(credentials)
    const res = await c.get<DolibarrExpense[]>('expensereports', this.paginationParams(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const c = this.client(credentials)
    const res = await c.get<DolibarrExpense>(`expensereports/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const c = this.client(credentials)
    const res = await c.get<DolibarrCredit[]>('invoices?type=2', this.paginationParams(params))
    return (res ?? []).map(transformCreditMemo)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const c = this.client(credentials)
    const res = await c.get<DolibarrOrder[]>('orders', this.paginationParams(params))
    return (res ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const c = this.client(credentials)
    const res = await c.get<DolibarrOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const c = this.client(credentials)
    const res = await c.get<DolibarrOrder[]>('orders', this.paginationParams(params))
    return (res ?? []).map(transformSalesOrder)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const c = this.client(credentials)
    const res = await c.get<DolibarrPurchaseOrder[]>('supplierorders', this.paginationParams(params))
    return (res ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const c = this.client(credentials)
    const res = await c.get<DolibarrPurchaseOrder>(`supplierorders/${id}`)
    return transformPurchaseOrder(res)
  }
}
