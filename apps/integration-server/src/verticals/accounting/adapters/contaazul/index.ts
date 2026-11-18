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
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Order } from '../../schema/order'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { ContaAzulClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformInvoice,
  untransformInvoice,
  type ContaAzulInvoice,
} from './transform/invoice'
import { transformBill, untransformBill, type ContaAzulBill } from './transform/bill'
import { transformContact, type ContaAzulContact } from './transform/contact'
import { transformAccount, type ContaAzulAccount } from './transform/account'
import {
  transformJournal,
  untransformJournal,
  type ContaAzulJournal,
} from './transform/journal'
import { transformOrganization, type ContaAzulCompanyInfo } from './transform/organization'
import { transformTaxRate, type ContaAzulTaxRate } from './transform/taxrate'
import { transformTransaction, type ContaAzulTransaction } from './transform/transaction'
import {
  transformExpense,
  untransformExpense,
  type ContaAzulExpense,
} from './transform/expense'
import {
  transformCreditMemo,
  untransformCreditMemo,
  type ContaAzulCreditMemo,
} from './transform/creditmemo'
import { transformOrder, untransformOrder, type ContaAzulOrder } from './transform/order'
import {
  transformSalesOrder,
  untransformSalesOrder,
  type ContaAzulSalesOrder,
} from './transform/salesorder'
import {
  transformPurchaseOrder,
  untransformPurchaseOrder,
  type ContaAzulPurchaseOrder,
} from './transform/purchaseorder'

interface ContaAzulAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class ContaAzulAdapter implements AccountingAdapter {
  readonly platform = 'contaazul'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ContaAzulAdapterConfig) {
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
      size: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
      ...(params.updatedAfter && {
        updated_since: params.updatedAfter.toISOString(),
      }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulCompanyInfo>('companies')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulInvoice[]>('invoices', this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new ContaAzulClient(credentials)
    const res = await client.post<ContaAzulInvoice>('invoices', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new ContaAzulClient(credentials)
    const res = await client.put<ContaAzulInvoice>(`invoices/${id}`, untransformInvoice(data))
    return transformInvoice(res)
  }

  async deleteInvoice(credentials: Credentials, id: string): Promise<void> {
    const client = new ContaAzulClient(credentials)
    await client.delete(`invoices/${id}`)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulBill[]>('bills', this.paginationParams(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulBill>(`bills/${id}`)
    return transformBill(res)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new ContaAzulClient(credentials)
    const res = await client.post<ContaAzulBill>('bills', untransformBill(data))
    return transformBill(res)
  }

  async updateBill(credentials: Credentials, id: string, data: Partial<Bill>): Promise<Bill> {
    const client = new ContaAzulClient(credentials)
    const res = await client.put<ContaAzulBill>(`bills/${id}`, untransformBill(data))
    return transformBill(res)
  }

  async deleteBill(credentials: Credentials, id: string): Promise<void> {
    const client = new ContaAzulClient(credentials)
    await client.delete(`bills/${id}`)
  }

  // --- Contacts ---

  // ContaAzul exposes /customers for customer contacts.
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulContact[]>('customers', this.paginationParams(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulContact>(`customers/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new ContaAzulClient(credentials)
    const res = await client.post<ContaAzulContact>('customers', {
      name: data.name,
      company_name: data.companyName,
      cnpj: data.identification,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      address: data.billingAddress?.address1,
      complement: data.billingAddress?.address2,
      city: data.billingAddress?.city,
      state: data.billingAddress?.region,
      postal_code: data.billingAddress?.postalCode,
      country: data.billingAddress?.country,
    })
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new ContaAzulClient(credentials)
    const res = await client.put<ContaAzulContact>(`customers/${id}`, {
      name: data.name,
      company_name: data.companyName,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      address: data.billingAddress?.address1,
      complement: data.billingAddress?.address2,
      city: data.billingAddress?.city,
      state: data.billingAddress?.region,
      postal_code: data.billingAddress?.postalCode,
      country: data.billingAddress?.country,
    })
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    const client = new ContaAzulClient(credentials)
    await client.delete(`customers/${id}`)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulAccount[]>('accounts', this.paginationParams(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulJournal[]>('journals', this.paginationParams(params))
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new ContaAzulClient(credentials)
    const res = await client.post<ContaAzulJournal>('journals', untransformJournal(data))
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulTransaction[]>(
      'transactions',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulTaxRate[]>('taxes', this.paginationParams(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulTaxRate>(`taxes/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulExpense[]>('expenses', this.paginationParams(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new ContaAzulClient(credentials)
    const res = await client.post<ContaAzulExpense>('expenses', untransformExpense(data))
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<CreditMemo[]> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulCreditMemo[]>(
      'credit-memos',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulCreditMemo>(`credit-memos/${id}`)
    return transformCreditMemo(res)
  }

  async createCreditMemo(
    credentials: Credentials,
    data: Partial<CreditMemo>,
  ): Promise<CreditMemo> {
    const client = new ContaAzulClient(credentials)
    const res = await client.post<ContaAzulCreditMemo>(
      'credit-memos',
      untransformCreditMemo(data),
    )
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulOrder[]>('orders', this.paginationParams(params))
    return (res ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ContaAzulClient(credentials)
    const res = await client.post<ContaAzulOrder>('orders', untransformOrder(data))
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<SalesOrder[]> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulSalesOrder[]>(
      'sales-orders',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulSalesOrder>(`sales-orders/${id}`)
    return transformSalesOrder(res)
  }

  async createSalesOrder(
    credentials: Credentials,
    data: Partial<SalesOrder>,
  ): Promise<SalesOrder> {
    const client = new ContaAzulClient(credentials)
    const res = await client.post<ContaAzulSalesOrder>(
      'sales-orders',
      untransformSalesOrder(data),
    )
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulPurchaseOrder[]>(
      'purchase-orders',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new ContaAzulClient(credentials)
    const res = await client.get<ContaAzulPurchaseOrder>(`purchase-orders/${id}`)
    return transformPurchaseOrder(res)
  }

  async createPurchaseOrder(
    credentials: Credentials,
    data: Partial<PurchaseOrder>,
  ): Promise<PurchaseOrder> {
    const client = new ContaAzulClient(credentials)
    const res = await client.post<ContaAzulPurchaseOrder>(
      'purchase-orders',
      untransformPurchaseOrder(data),
    )
    return transformPurchaseOrder(res)
  }
}
