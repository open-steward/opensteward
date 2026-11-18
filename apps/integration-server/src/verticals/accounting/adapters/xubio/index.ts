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

import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefreshCredentials,
} from './auth'
import { XubioClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type XubioInvoice } from './transform/invoice'
import { transformBill, type XubioBill } from './transform/bill'
import { transformContact, type XubioContact } from './transform/contact'
import { transformAccount, type XubioAccount } from './transform/account'
import { transformJournal, untransformJournal, type XubioJournal } from './transform/journal'
import { transformOrganization, type XubioOrganization } from './transform/organization'
import { transformTransaction, type XubioTransaction } from './transform/transaction'
import { transformTaxRate, type XubioTaxRate } from './transform/taxrate'
import { transformExpense, untransformExpense, type XubioExpense } from './transform/expense'
import { transformCreditMemo, untransformCreditMemo, type XubioCreditMemo } from './transform/creditmemo'
import { transformOrder, untransformOrder, type XubioOrder } from './transform/order'
import { transformSalesOrder, untransformSalesOrder, type XubioSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, untransformPurchaseOrder, type XubioPurchaseOrder } from './transform/purchaseorder'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class XubioAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'xubio'
  readonly version = '0.1.0'

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
      ...(params.updatedAfter && {
        updatedAfter: params.updatedAfter.toISOString(),
      }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new XubioClient(credentials)
    const res = await client.get<XubioOrganization>('empresa')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new XubioClient(credentials)
    const res = await client.get<{ items: XubioInvoice[] }>(
      'facturas',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new XubioClient(credentials)
    const res = await client.get<XubioInvoice>(`facturas/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new XubioClient(credentials)
    const res = await client.post<XubioInvoice>('facturas', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new XubioClient(credentials)
    const res = await client.put<XubioInvoice>(`facturas/${id}`, untransformInvoice(data))
    return transformInvoice(res)
  }

  async deleteInvoice(credentials: Credentials, id: string): Promise<void> {
    const client = new XubioClient(credentials)
    await client.delete(`facturas/${id}`)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new XubioClient(credentials)
    const res = await client.get<{ items: XubioBill[] }>(
      'comprobantes-compra',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new XubioClient(credentials)
    const res = await client.get<XubioBill>(`comprobantes-compra/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new XubioClient(credentials)
    const res = await client.get<{ items: XubioContact[] }>(
      'contactos',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new XubioClient(credentials)
    const res = await client.get<XubioContact>(`contactos/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new XubioClient(credentials)
    const res = await client.post<XubioContact>('contactos', {
      razonSocial: data.name,
      cuit: data.identification,
      email: data.emails?.[0]?.email,
      moneda: data.currency,
      esCliente: data.isCustomer ?? true,
      esProveedor: data.isSupplier ?? false,
      direccion: data.billingAddress?.address1,
      ciudad: data.billingAddress?.city,
      codigoPostal: data.billingAddress?.postalCode,
      pais: data.billingAddress?.country,
    })
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new XubioClient(credentials)
    const res = await client.put<XubioContact>(`contactos/${id}`, {
      razonSocial: data.name,
      email: data.emails?.[0]?.email,
      moneda: data.currency,
    })
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    const client = new XubioClient(credentials)
    await client.delete(`contactos/${id}`)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new XubioClient(credentials)
    const res = await client.get<{ items: XubioAccount[] }>(
      'cuentas',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new XubioClient(credentials)
    const res = await client.get<XubioAccount>(`cuentas/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new XubioClient(credentials)
    const res = await client.get<{ items: XubioJournal[] }>(
      'asientos',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new XubioClient(credentials)
    const res = await client.get<XubioJournal>(`asientos/${id}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new XubioClient(credentials)
    const res = await client.post<XubioJournal>('asientos', untransformJournal(data))
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new XubioClient(credentials)
    const res = await client.get<{ items: XubioTransaction[] }>(
      'transacciones',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new XubioClient(credentials)
    const res = await client.get<XubioTransaction>(`transacciones/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new XubioClient(credentials)
    const res = await client.get<{ items: XubioTaxRate[] }>(
      'impuestos',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new XubioClient(credentials)
    const res = await client.get<XubioTaxRate>(`impuestos/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new XubioClient(credentials)
    const res = await client.get<{ items: XubioExpense[] }>(
      'gastos',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new XubioClient(credentials)
    const res = await client.get<XubioExpense>(`gastos/${id}`)
    return transformExpense(res)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new XubioClient(credentials)
    const res = await client.post<XubioExpense>('gastos', untransformExpense(data))
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new XubioClient(credentials)
    const res = await client.get<{ items: XubioCreditMemo[] }>(
      'notas-credito',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new XubioClient(credentials)
    const res = await client.get<XubioCreditMemo>(`notas-credito/${id}`)
    return transformCreditMemo(res)
  }

  async createCreditMemo(
    credentials: Credentials,
    data: Partial<CreditMemo>,
  ): Promise<CreditMemo> {
    const client = new XubioClient(credentials)
    const res = await client.post<XubioCreditMemo>('notas-credito', untransformCreditMemo(data))
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new XubioClient(credentials)
    const res = await client.get<{ items: XubioOrder[] }>(
      'pedidos',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new XubioClient(credentials)
    const res = await client.get<XubioOrder>(`pedidos/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new XubioClient(credentials)
    const res = await client.post<XubioOrder>('pedidos', untransformOrder(data))
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new XubioClient(credentials)
    const res = await client.get<{ items: XubioSalesOrder[] }>(
      'pedidos-venta',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new XubioClient(credentials)
    const res = await client.get<XubioSalesOrder>(`pedidos-venta/${id}`)
    return transformSalesOrder(res)
  }

  async createSalesOrder(
    credentials: Credentials,
    data: Partial<SalesOrder>,
  ): Promise<SalesOrder> {
    const client = new XubioClient(credentials)
    const res = await client.post<XubioSalesOrder>('pedidos-venta', untransformSalesOrder(data))
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new XubioClient(credentials)
    const res = await client.get<{ items: XubioPurchaseOrder[] }>(
      'pedidos-compra',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new XubioClient(credentials)
    const res = await client.get<XubioPurchaseOrder>(`pedidos-compra/${id}`)
    return transformPurchaseOrder(res)
  }

  async createPurchaseOrder(
    credentials: Credentials,
    data: Partial<PurchaseOrder>,
  ): Promise<PurchaseOrder> {
    const client = new XubioClient(credentials)
    const res = await client.post<XubioPurchaseOrder>(
      'pedidos-compra',
      untransformPurchaseOrder(data),
    )
    return transformPurchaseOrder(res)
  }
}
