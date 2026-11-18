import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { AutocountClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type AutocountInvoice } from './transform/invoice'
import { transformBill, type AutocountBill } from './transform/bill'
import { transformDebtor, transformCreditor, type AutocountDebtor, type AutocountCreditor } from './transform/contact'
import { transformAccount, type AutocountAccount } from './transform/account'
import { transformJournal, type AutocountJournal } from './transform/journal'
import { transformOrganization, type AutocountCompanyInfo } from './transform/organization'
import { transformTransaction, type AutocountTransaction } from './transform/transaction'
import { transformTaxRate, type AutocountTaxCode } from './transform/taxrate'
import { transformCreditMemo, type AutocountCreditNote } from './transform/creditmemo'
import { transformOrder, type AutocountOrder } from './transform/order'
import { transformSalesOrder, type AutocountSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type AutocountPurchaseOrder } from './transform/purchaseorder'

interface AutocountAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class AutocountAdapter implements AccountingAdapter {
  readonly platform = 'autocount'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: AutocountAdapterConfig) {
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
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      pageIndex: params.page ?? 1,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new AutocountClient(credentials)
    const res = await client.get<AutocountCompanyInfo>('company/info')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new AutocountClient(credentials)
    const res = await client.get<AutocountInvoice[]>('sales/invoice', this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new AutocountClient(credentials)
    const res = await client.get<AutocountInvoice>(`sales/invoice/${id}`)
    return transformInvoice(res)
  }

  // --- Bills (Purchase Invoices) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new AutocountClient(credentials)
    const res = await client.get<AutocountBill[]>(
      'purchase/invoice',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new AutocountClient(credentials)
    const res = await client.get<AutocountBill>(`purchase/invoice/${id}`)
    return transformBill(res)
  }

  // --- Contacts (Debtors + Creditors) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new AutocountClient(credentials)
    const [debtorRes, creditorRes] = await Promise.all([
      client.get<AutocountDebtor[]>('debtor', this.paginationParams(params)),
      client.get<AutocountCreditor[]>('creditor', this.paginationParams(params)),
    ])
    const debtors = (debtorRes ?? []).map(transformDebtor)
    const creditors = (creditorRes ?? []).map(transformCreditor)
    return [...debtors, ...creditors]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new AutocountClient(credentials)
    if (id.startsWith('debtor_')) {
      const code = id.slice('debtor_'.length)
      const res = await client.get<AutocountDebtor>(`debtor/${code}`)
      return transformDebtor(res)
    }
    if (id.startsWith('creditor_')) {
      const code = id.slice('creditor_'.length)
      const res = await client.get<AutocountCreditor>(`creditor/${code}`)
      return transformCreditor(res)
    }
    throw new Error(`Invalid contact id format: ${id}. Expected debtor_<code> or creditor_<code>`)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new AutocountClient(credentials)
    const res = await client.get<AutocountAccount[]>(
      'gl/account',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new AutocountClient(credentials)
    const res = await client.get<AutocountAccount>(`gl/account/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new AutocountClient(credentials)
    const res = await client.get<AutocountJournal[]>(
      'gl/journal',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new AutocountClient(credentials)
    const res = await client.get<AutocountJournal>(`gl/journal/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new AutocountClient(credentials)
    const res = await client.get<AutocountTransaction[]>(
      'gl/transaction',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new AutocountClient(credentials)
    const res = await client.get<AutocountTransaction>(`gl/transaction/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new AutocountClient(credentials)
    const res = await client.get<AutocountTaxCode[]>(
      'gl/taxcode',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new AutocountClient(credentials)
    const res = await client.get<AutocountTaxCode>(`gl/taxcode/${id}`)
    return transformTaxRate(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new AutocountClient(credentials)
    const res = await client.get<AutocountCreditNote[]>(
      'sales/creditnote',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new AutocountClient(credentials)
    const res = await client.get<AutocountCreditNote>(`sales/creditnote/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new AutocountClient(credentials)
    const res = await client.get<AutocountOrder[]>(
      'sales/order',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new AutocountClient(credentials)
    const res = await client.get<AutocountOrder>(`sales/order/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new AutocountClient(credentials)
    const res = await client.get<AutocountSalesOrder[]>(
      'sales/order',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new AutocountClient(credentials)
    const res = await client.get<AutocountSalesOrder>(`sales/order/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new AutocountClient(credentials)
    const res = await client.get<AutocountPurchaseOrder[]>(
      'purchase/order',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new AutocountClient(credentials)
    const res = await client.get<AutocountPurchaseOrder>(`purchase/order/${id}`)
    return transformPurchaseOrder(res)
  }
}
