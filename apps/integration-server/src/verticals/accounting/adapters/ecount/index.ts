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
import { EcountClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type EcountInvoice } from './transform/invoice'
import { transformBill, type EcountBill } from './transform/bill'
import { transformContact, type EcountContact } from './transform/contact'
import { transformAccount, type EcountAccount } from './transform/account'
import { transformJournal, type EcountJournal } from './transform/journal'
import { transformOrganization, type EcountOrganization } from './transform/organization'
import { transformTransaction, type EcountTransaction } from './transform/transaction'
import { transformTaxRate, type EcountVatCode } from './transform/taxrate'
import { transformExpense, type EcountExpense } from './transform/expense'
import { transformCreditMemo, type EcountCreditNote } from './transform/creditmemo'
import { transformOrder, type EcountOrder } from './transform/order'
import { transformSalesOrder, type EcountSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type EcountPurchaseOrder } from './transform/purchaseorder'

interface EcountAdapterConfig {
  apiKey: string
  companyCode: string
  userId: string
}

interface EcountListResponse<T> {
  data?: T[]
  list?: T[]
  result?: T[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class EcountAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'ecount'
  readonly version = '0.1.0'

  private readonly _apiKey: string
  private companyCode: string
  private readonly _userId: string

  constructor(config: EcountAdapterConfig) {
    this._apiKey = config.apiKey
    this.companyCode = config.companyCode
    this._userId = config.userId
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

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      page_size: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page_number: params.page ?? 1,
    }
  }

  private makeClient(credentials: Credentials): EcountClient {
    return new EcountClient(credentials, this.companyCode)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountOrganization>('Common/GetCompanyInfo')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountListResponse<EcountInvoice>>(
      'Sale/GetSlipList',
      this.paginationParams(params),
    )
    return (res.data ?? res.list ?? res.result ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountInvoice>(`Sale/GetSlip/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountListResponse<EcountBill>>(
      'Purchase/GetSlipList',
      this.paginationParams(params),
    )
    return (res.data ?? res.list ?? res.result ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountBill>(`Purchase/GetSlip/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountListResponse<EcountContact>>(
      'BaseInfo/GetCustList',
      this.paginationParams(params),
    )
    return (res.data ?? res.list ?? res.result ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountContact>(`BaseInfo/GetCust/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountListResponse<EcountAccount>>(
      'Accounting/GetAccountList',
      this.paginationParams(params),
    )
    return (res.data ?? res.list ?? res.result ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountAccount>(`Accounting/GetAccount/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountListResponse<EcountJournal>>(
      'Accounting/GetVoucherList',
      this.paginationParams(params),
    )
    return (res.data ?? res.list ?? res.result ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountJournal>(`Accounting/GetVoucher/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountListResponse<EcountTransaction>>(
      'Accounting/GetLedgerList',
      this.paginationParams(params),
    )
    return (res.data ?? res.list ?? res.result ?? []).map(transformTransaction)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountListResponse<EcountVatCode>>(
      'BaseInfo/GetVatCodeList',
      this.paginationParams(params),
    )
    return (res.data ?? res.list ?? res.result ?? []).map(transformTaxRate)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountListResponse<EcountExpense>>(
      'Expense/GetSlipList',
      this.paginationParams(params),
    )
    return (res.data ?? res.list ?? res.result ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountExpense>(`Expense/GetSlip/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountListResponse<EcountCreditNote>>(
      'Sale/GetCreditNoteList',
      this.paginationParams(params),
    )
    return (res.data ?? res.list ?? res.result ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountCreditNote>(`Sale/GetCreditNote/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountListResponse<EcountOrder>>(
      'Sale/GetOrderList',
      this.paginationParams(params),
    )
    return (res.data ?? res.list ?? res.result ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountOrder>(`Sale/GetOrder/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountListResponse<EcountSalesOrder>>(
      'Sale/GetOrderList',
      this.paginationParams(params),
    )
    return (res.data ?? res.list ?? res.result ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountSalesOrder>(`Sale/GetOrder/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountListResponse<EcountPurchaseOrder>>(
      'Purchase/GetOrderList',
      this.paginationParams(params),
    )
    return (res.data ?? res.list ?? res.result ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = this.makeClient(credentials)
    const res = await client.get<EcountPurchaseOrder>(`Purchase/GetOrder/${id}`)
    return transformPurchaseOrder(res)
  }
}

