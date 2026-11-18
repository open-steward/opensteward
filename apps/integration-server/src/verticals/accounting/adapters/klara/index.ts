/**
 * KLARA accounting adapter.
 *
 * KLARA is a Swiss cloud business suite (Swiss Post company) that combines
 * accounting, payroll, invoicing, order management, and POS for SMEs.
 * REST API: https://api.klara.ch/v1
 * Auth: OAuth2 Authorization Code flow
 *
 * Supported resources: Organization, Invoices, Bills, Contacts, Accounts,
 * TaxRates, Journals, Transactions, Expenses, CreditMemos, Orders,
 * SalesOrders, PurchaseOrders.
 */

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

import { buildAuthUrl, exchangeCode as doExchangeCode, refreshAccessToken } from './auth'
import { KlaraClient, type KlaraPaginatedResponse } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type KlaraInvoice } from './transform/invoice'
import { transformBill, type KlaraBill } from './transform/bill'
import { transformContact, type KlaraContact } from './transform/contact'
import { transformAccount, type KlaraAccount } from './transform/account'
import { transformOrganization, type KlaraCompany } from './transform/organization'
import { transformTaxRate, type KlaraTaxRate } from './transform/taxrate'
import { transformJournal, type KlaraJournalEntry } from './transform/journal'
import { transformTransaction, type KlaraPayment } from './transform/transaction'
import { transformExpense, type KlaraExpense } from './transform/expense'
import { transformCreditMemo, type KlaraCreditNote } from './transform/creditmemo'
import { transformOrder, type KlaraOffer } from './transform/order'
import { transformSalesOrder, type KlaraSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type KlaraPurchaseOrder } from './transform/purchaseorder'

interface KlaraAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class KlaraAdapter implements AccountingAdapter {
  readonly platform = 'klara'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: KlaraAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    const creds = await refreshAccessToken(
      credentials.refreshToken,
      this.clientId,
      this.clientSecret,
    )
    if (!creds.refreshToken) creds.refreshToken = credentials.refreshToken
    return creds
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const offset = ((params.page ?? 1) - 1) * limit
    return {
      limit,
      offset,
      ...(params.updatedAfter && {
        updated_after: params.updatedAfter.toISOString(),
      }),
    }
  }

  private items<T>(res: KlaraPaginatedResponse<T> | T[]): T[] {
    if (Array.isArray(res)) return res
    return (res as KlaraPaginatedResponse<T>).items ?? []
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraCompany>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraPaginatedResponse<KlaraInvoice> | KlaraInvoice[]>(
      'invoices',
      this.paginationParams(params),
    )
    return this.items(res).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new KlaraClient(credentials)
    const res = await client.post<KlaraInvoice>('invoices', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new KlaraClient(credentials)
    const res = await client.put<KlaraInvoice>(`invoices/${id}`, untransformInvoice(data))
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraPaginatedResponse<KlaraBill> | KlaraBill[]>(
      'supplier-invoices',
      this.paginationParams(params),
    )
    return this.items(res).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraBill>(`supplier-invoices/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraPaginatedResponse<KlaraContact> | KlaraContact[]>(
      'contacts',
      this.paginationParams(params),
    )
    return this.items(res).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new KlaraClient(credentials)
    const isCompany = data.companyName ? true : !data.firstName
    const body: Record<string, unknown> = {
      contact_type: isCompany ? 'company' : 'person',
      company_name: data.companyName,
      first_name: data.firstName,
      last_name: data.lastName,
      is_customer: data.isCustomer ?? true,
      is_supplier: data.isSupplier ?? false,
      currency: data.currency,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.find((t) => t.type === 'WORK' || !t.type)?.telephone,
      mobile: data.telephones?.find((t) => t.type === 'MOBILE')?.telephone,
      address: data.billingAddress?.address1,
      address2: data.billingAddress?.address2,
      zip: data.billingAddress?.postalCode,
      city: data.billingAddress?.city,
      country: data.billingAddress?.country,
    }
    const res = await client.post<KlaraContact>('contacts', body)
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new KlaraClient(credentials)
    const body: Record<string, unknown> = {
      company_name: data.companyName,
      first_name: data.firstName,
      last_name: data.lastName,
      is_customer: data.isCustomer,
      is_supplier: data.isSupplier,
      currency: data.currency,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.find((t) => t.type === 'WORK' || !t.type)?.telephone,
      mobile: data.telephones?.find((t) => t.type === 'MOBILE')?.telephone,
      address: data.billingAddress?.address1,
      address2: data.billingAddress?.address2,
      zip: data.billingAddress?.postalCode,
      city: data.billingAddress?.city,
      country: data.billingAddress?.country,
    }
    const res = await client.put<KlaraContact>(`contacts/${id}`, body)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraPaginatedResponse<KlaraAccount> | KlaraAccount[]>(
      'accounts',
      this.paginationParams(params),
    )
    return this.items(res).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraPaginatedResponse<KlaraTaxRate> | KlaraTaxRate[]>(
      'tax-rates',
      this.paginationParams(params),
    )
    return this.items(res).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraTaxRate>(`tax-rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraPaginatedResponse<KlaraJournalEntry> | KlaraJournalEntry[]>(
      'journal-entries',
      this.paginationParams(params),
    )
    return this.items(res).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraJournalEntry>(`journal-entries/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraPaginatedResponse<KlaraPayment> | KlaraPayment[]>(
      'payments',
      this.paginationParams(params),
    )
    return this.items(res).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraPayment>(`payments/${id}`)
    return transformTransaction(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraPaginatedResponse<KlaraExpense> | KlaraExpense[]>(
      'expenses',
      this.paginationParams(params),
    )
    return this.items(res).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraPaginatedResponse<KlaraCreditNote> | KlaraCreditNote[]>(
      'credit-notes',
      this.paginationParams(params),
    )
    return this.items(res).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraCreditNote>(`credit-notes/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders (Offers / Quotes) ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraPaginatedResponse<KlaraOffer> | KlaraOffer[]>(
      'offers',
      this.paginationParams(params),
    )
    return this.items(res).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraOffer>(`offers/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraPaginatedResponse<KlaraSalesOrder> | KlaraSalesOrder[]>(
      'orders',
      this.paginationParams(params),
    )
    return this.items(res).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraSalesOrder>(`orders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraPaginatedResponse<KlaraPurchaseOrder> | KlaraPurchaseOrder[]>(
      'purchase-orders',
      this.paginationParams(params),
    )
    return this.items(res).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new KlaraClient(credentials)
    const res = await client.get<KlaraPurchaseOrder>(`purchase-orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
