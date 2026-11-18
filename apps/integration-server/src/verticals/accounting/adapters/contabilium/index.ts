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
import { ContabiliumClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type ContabiliumInvoice } from './transform/invoice'
import { transformBill, type ContabiliumBill } from './transform/bill'
import { transformContact, type ContabiliumContact } from './transform/contact'
import { transformAccount, type ContabiliumAccount } from './transform/account'
import { transformJournal, untransformJournal, type ContabiliumJournal } from './transform/journal'
import { transformOrganization, type ContabiliumCompanyInfo } from './transform/organization'
import { transformTransaction, type ContabiliumTransaction } from './transform/transaction'
import { transformTaxRate, type ContabiliumTaxRate } from './transform/taxrate'
import { transformExpense, untransformExpense, type ContabiliumExpense } from './transform/expense'
import { transformCreditMemo, untransformCreditMemo, type ContabiliumCreditMemo } from './transform/creditmemo'
import { transformOrder, untransformOrder, type ContabiliumOrder } from './transform/order'
import { transformSalesOrder, untransformSalesOrder, type ContabiliumSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, untransformPurchaseOrder, type ContabiliumPurchaseOrder } from './transform/purchaseorder'

interface ContabiliumAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class ContabiliumAdapter implements AccountingAdapter {
  readonly platform = 'contabilium'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ContabiliumAdapterConfig) {
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
      ...(params.updatedAfter && {
        fechaDesde: params.updatedAfter.toISOString().split('T')[0],
      }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<ContabiliumCompanyInfo>('empresa')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<{ items: ContabiliumInvoice[] }>(
      'facturas',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<ContabiliumInvoice>(`facturas/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new ContabiliumClient(credentials)
    const res = await client.post<ContabiliumInvoice>('facturas', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new ContabiliumClient(credentials)
    const res = await client.put<ContabiliumInvoice>(`facturas/${id}`, untransformInvoice(data))
    return transformInvoice(res)
  }

  async deleteInvoice(credentials: Credentials, id: string): Promise<void> {
    const client = new ContabiliumClient(credentials)
    await client.delete(`facturas/${id}`)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<{ items: ContabiliumBill[] }>(
      'comprobantes-compra',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<ContabiliumBill>(`comprobantes-compra/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<{ items: ContabiliumContact[] }>(
      'contactos',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<ContabiliumContact>(`contactos/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new ContabiliumClient(credentials)
    const res = await client.post<ContabiliumContact>('contactos', {
      razonSocial: data.name,
      cuit: data.identification,
      email: data.emails?.[0]?.email,
      moneda: data.currency,
      esCliente: data.isCustomer ?? true,
      esProveedor: data.isSupplier ?? false,
    })
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new ContabiliumClient(credentials)
    const res = await client.put<ContabiliumContact>(`contactos/${id}`, {
      razonSocial: data.name,
      email: data.emails?.[0]?.email,
    })
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<{ items: ContabiliumAccount[] }>(
      'cuentas',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<ContabiliumAccount>(`cuentas/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<{ items: ContabiliumJournal[] }>(
      'asientos',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<ContabiliumJournal>(`asientos/${id}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new ContabiliumClient(credentials)
    const res = await client.post<ContabiliumJournal>('asientos', untransformJournal(data))
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<{ items: ContabiliumTransaction[] }>(
      'movimientos',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<ContabiliumTransaction>(`movimientos/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<{ items: ContabiliumTaxRate[] }>(
      'alicuotas',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<ContabiliumTaxRate>(`alicuotas/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<{ items: ContabiliumExpense[] }>(
      'gastos',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<ContabiliumExpense>(`gastos/${id}`)
    return transformExpense(res)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new ContabiliumClient(credentials)
    const res = await client.post<ContabiliumExpense>('gastos', untransformExpense(data))
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<{ items: ContabiliumCreditMemo[] }>(
      'notas-credito',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<ContabiliumCreditMemo>(`notas-credito/${id}`)
    return transformCreditMemo(res)
  }

  async createCreditMemo(
    credentials: Credentials,
    data: Partial<CreditMemo>,
  ): Promise<CreditMemo> {
    const client = new ContabiliumClient(credentials)
    const res = await client.post<ContabiliumCreditMemo>(
      'notas-credito',
      untransformCreditMemo(data),
    )
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<{ items: ContabiliumOrder[] }>(
      'pedidos',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<ContabiliumOrder>(`pedidos/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ContabiliumClient(credentials)
    const res = await client.post<ContabiliumOrder>('pedidos', untransformOrder(data))
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<{ items: ContabiliumSalesOrder[] }>(
      'ordenes-venta',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<ContabiliumSalesOrder>(`ordenes-venta/${id}`)
    return transformSalesOrder(res)
  }

  async createSalesOrder(
    credentials: Credentials,
    data: Partial<SalesOrder>,
  ): Promise<SalesOrder> {
    const client = new ContabiliumClient(credentials)
    const res = await client.post<ContabiliumSalesOrder>(
      'ordenes-venta',
      untransformSalesOrder(data),
    )
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<{ items: ContabiliumPurchaseOrder[] }>(
      'ordenes-compra',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new ContabiliumClient(credentials)
    const res = await client.get<ContabiliumPurchaseOrder>(`ordenes-compra/${id}`)
    return transformPurchaseOrder(res)
  }

  async createPurchaseOrder(
    credentials: Credentials,
    data: Partial<PurchaseOrder>,
  ): Promise<PurchaseOrder> {
    const client = new ContabiliumClient(credentials)
    const res = await client.post<ContabiliumPurchaseOrder>(
      'ordenes-compra',
      untransformPurchaseOrder(data),
    )
    return transformPurchaseOrder(res)
  }
}
