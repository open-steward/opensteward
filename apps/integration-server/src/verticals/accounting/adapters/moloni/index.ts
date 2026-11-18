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

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { MoloniClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type MoloniInvoice } from './transform/invoice'
import { transformBill, type MoloniBill } from './transform/bill'
import { transformContact, type MoloniContact } from './transform/contact'
import { transformAccount, type MoloniAccount } from './transform/account'
import { transformJournal, type MoloniJournal } from './transform/journal'
import { transformOrganization, type MoloniOrganization } from './transform/organization'
import { transformExpense, type MoloniExpense } from './transform/expense'
import { transformTaxRate, type MoloniTaxRate } from './transform/taxrate'
import { transformTransaction, type MoloniTransaction } from './transform/transaction'
import { transformCreditMemo, type MoloniCreditMemo } from './transform/creditmemo'
import { transformOrder, type MoloniOrder } from './transform/order'
import { transformSalesOrder, type MoloniSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type MoloniPurchaseOrder } from './transform/purchaseorder'

interface MoloniAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class MoloniAdapter implements AccountingAdapter {
  readonly platform = 'moloni'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: MoloniAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, (overrideScopes ?? this.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      qty: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      offset: ((params.page ?? 1) - 1) * Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniOrganization>('companies/getOne')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniInvoice[]>('invoices/getAll', this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniInvoice>(`invoices/getOne/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniBill[]>('purchaseInvoices/getAll', this.paginationParams(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniBill>(`purchaseInvoices/getOne/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniContact[]>('customers/getAll', this.paginationParams(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniContact>(`customers/getOne/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniAccount[]>('accountCategories/getAll', this.paginationParams(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniAccount>(`accountCategories/getOne/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniJournal[]>('journalEntries/getAll', this.paginationParams(params))
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniJournal>(`journalEntries/getOne/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniTransaction[]>('paymentMethods/getAll', this.paginationParams(params))
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniTransaction>(`paymentMethods/getOne/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniTaxRate[]>('taxes/getAll', this.paginationParams(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniTaxRate>(`taxes/getOne/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniExpense[]>('expenses/getAll', this.paginationParams(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniExpense>(`expenses/getOne/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniCreditMemo[]>('creditNotes/getAll', this.paginationParams(params))
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniCreditMemo>(`creditNotes/getOne/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniOrder[]>('deliveryNotes/getAll', this.paginationParams(params))
    return (res ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniOrder>(`deliveryNotes/getOne/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniSalesOrder[]>('purchaseOrders/getAll', this.paginationParams(params))
    return (res ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniSalesOrder>(`purchaseOrders/getOne/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniPurchaseOrder[]>('supplierOrders/getAll', this.paginationParams(params))
    return (res ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new MoloniClient(credentials)
    const res = await client.get<MoloniPurchaseOrder>(`supplierOrders/getOne/${id}`)
    return transformPurchaseOrder(res)
  }
}
