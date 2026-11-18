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
import { VismaNetClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type VismaNetInvoice } from './transform/invoice'
import { transformContact, type VismaNetContact } from './transform/contact'
import { transformAccount, type VismaNetAccount } from './transform/account'
import { transformJournal, untransformJournal, type VismaNetJournal } from './transform/journal'
import { transformOrganization, type VismaNetOrganization } from './transform/organization'
import { transformBill, type VismaNetBill } from './transform/bill'
import { transformTaxRate, type VismaNetTaxRate } from './transform/taxrate'
import { transformTransaction, type VismaNetTransaction } from './transform/transaction'
import { transformExpense, type VismaNetExpense } from './transform/expense'
import { transformCreditMemo, type VismaNetCreditMemo } from './transform/creditmemo'
import { transformOrder, type VismaNetOrder } from './transform/order'
import { transformSalesOrder, type VismaNetSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type VismaNetPurchaseOrder } from './transform/purchaseorder'

interface VismaNetAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class VismaNetAdapter implements AccountingAdapter {
  readonly platform = 'vismanet'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: VismaNetAdapterConfig) {
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
      pageNumber: params.page ?? 1,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetOrganization>('controller/api/v1/company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetInvoice[]>('controller/api/v1/customerinvoice', this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetInvoice>(`controller/api/v1/customerinvoice/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new VismaNetClient(credentials)
    const res = await client.post<VismaNetInvoice>('controller/api/v2/customerinvoice', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new VismaNetClient(credentials)
    const res = await client.put<VismaNetInvoice>(`controller/api/v1/customerinvoice/${id}`, untransformInvoice(data))
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetBill[]>('controller/api/v1/supplierinvoice', this.paginationParams(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetBill>(`controller/api/v1/supplierinvoice/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetContact[]>('controller/api/v1/customer', this.paginationParams(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetContact>(`controller/api/v1/customer/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new VismaNetClient(credentials)
    const res = await client.post<VismaNetContact>('controller/api/v1/customer', {
      name: data.name,
      organizationNumber: data.identification,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      address: data.billingAddress
        ? {
            street: data.billingAddress.address1,
            city: data.billingAddress.city,
            postalCode: data.billingAddress.postalCode,
            country: data.billingAddress.country,
          }
        : undefined,
    })
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new VismaNetClient(credentials)
    const res = await client.put<VismaNetContact>(`controller/api/v1/customer/${id}`, {
      name: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      address: data.billingAddress
        ? {
            street: data.billingAddress.address1,
            city: data.billingAddress.city,
            postalCode: data.billingAddress.postalCode,
            country: data.billingAddress.country,
          }
        : undefined,
    })
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    const client = new VismaNetClient(credentials)
    await client.delete(`controller/api/v1/customer/${id}`)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetAccount[]>(
      'controller/api/v1/generalledgeraccount',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetAccount>(`controller/api/v1/generalledgeraccount/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetJournal[]>(
      'controller/api/v1/journaltransaction',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetJournal>(`controller/api/v1/journaltransaction/${id}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new VismaNetClient(credentials)
    const res = await client.post<VismaNetJournal>('controller/api/v1/journaltransaction', untransformJournal(data))
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetTransaction[]>(
      'controller/api/v1/transaction',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetTransaction>(`controller/api/v1/transaction/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetTaxRate[]>('controller/api/v1/taxrate', this.paginationParams(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetTaxRate>(`controller/api/v1/taxrate/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetExpense[]>('controller/api/v1/expenseclaim', this.paginationParams(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetExpense>(`controller/api/v1/expenseclaim/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetCreditMemo[]>(
      'controller/api/v1/customercreditnote',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetCreditMemo>(`controller/api/v1/customercreditnote/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetOrder[]>('controller/api/v1/salesorder', this.paginationParams(params))
    return (res ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetOrder>(`controller/api/v1/salesorder/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetSalesOrder[]>(
      'controller/api/v1/salesorder',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetSalesOrder>(`controller/api/v1/salesorder/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetPurchaseOrder[]>(
      'controller/api/v1/purchaseorder',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new VismaNetClient(credentials)
    const res = await client.get<VismaNetPurchaseOrder>(`controller/api/v1/purchaseorder/${id}`)
    return transformPurchaseOrder(res)
  }
}
