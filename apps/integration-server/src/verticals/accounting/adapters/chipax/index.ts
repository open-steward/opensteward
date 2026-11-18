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

import { buildAuthUrl, exchangeCode, refreshCredentials } from './auth'
import { ChipaxClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type ChipaxInvoice } from './transform/invoice'
import { transformBill, type ChipaxBill } from './transform/bill'
import { transformContact, type ChipaxContact } from './transform/contact'
import { transformAccount, type ChipaxAccount } from './transform/account'
import { transformJournal, untransformJournal, type ChipaxJournal } from './transform/journal'
import { transformOrganization, type ChipaxCompanyInfo } from './transform/organization'
import { transformTransaction, type ChipaxTransaction } from './transform/transaction'
import { transformTaxRate, type ChipaxTaxRate } from './transform/taxrate'
import { transformExpense, untransformExpense, type ChipaxExpense } from './transform/expense'
import { transformCreditMemo, untransformCreditMemo, type ChipaxCreditMemo } from './transform/creditmemo'
import { transformOrder, untransformOrder, type ChipaxOrder } from './transform/order'
import { transformSalesOrder, untransformSalesOrder, type ChipaxSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, untransformPurchaseOrder, type ChipaxPurchaseOrder } from './transform/purchaseorder'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ChipaxAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'chipax'
  readonly version = '0.1.0'

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
      perPage: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
      ...(params.updatedAfter && {
        updatedAfter: params.updatedAfter.toISOString(),
      }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<ChipaxCompanyInfo>('empresa')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<{ data: ChipaxInvoice[] }>(
      'facturas',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<ChipaxInvoice>(`facturas/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new ChipaxClient(credentials)
    const res = await client.post<ChipaxInvoice>('facturas', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new ChipaxClient(credentials)
    const res = await client.put<ChipaxInvoice>(`facturas/${id}`, untransformInvoice(data))
    return transformInvoice(res)
  }

  async deleteInvoice(credentials: Credentials, id: string): Promise<void> {
    const client = new ChipaxClient(credentials)
    await client.delete(`facturas/${id}`)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<{ data: ChipaxBill[] }>(
      'gastos',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<ChipaxBill>(`gastos/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<{ data: ChipaxContact[] }>(
      'contactos',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<ChipaxContact>(`contactos/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new ChipaxClient(credentials)
    const res = await client.post<ChipaxContact>('contactos', {
      nombre: data.name,
      rut: data.identification,
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
    const client = new ChipaxClient(credentials)
    const res = await client.put<ChipaxContact>(`contactos/${id}`, {
      nombre: data.name,
      email: data.emails?.[0]?.email,
    })
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<{ data: ChipaxAccount[] }>(
      'cuentas',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<ChipaxAccount>(`cuentas/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<{ data: ChipaxJournal[] }>(
      'asientos',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<ChipaxJournal>(`asientos/${id}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new ChipaxClient(credentials)
    const res = await client.post<ChipaxJournal>('asientos', untransformJournal(data))
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<{ data: ChipaxTransaction[] }>(
      'transacciones',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<ChipaxTransaction>(`transacciones/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<{ data: ChipaxTaxRate[] }>(
      'impuestos',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<ChipaxTaxRate>(`impuestos/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<{ data: ChipaxExpense[] }>(
      'egresos',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<ChipaxExpense>(`egresos/${id}`)
    return transformExpense(res)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new ChipaxClient(credentials)
    const res = await client.post<ChipaxExpense>('egresos', untransformExpense(data))
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<{ data: ChipaxCreditMemo[] }>(
      'notas-credito',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<ChipaxCreditMemo>(`notas-credito/${id}`)
    return transformCreditMemo(res)
  }

  async createCreditMemo(
    credentials: Credentials,
    data: Partial<CreditMemo>,
  ): Promise<CreditMemo> {
    const client = new ChipaxClient(credentials)
    const res = await client.post<ChipaxCreditMemo>('notas-credito', untransformCreditMemo(data))
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<{ data: ChipaxOrder[] }>(
      'pedidos',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<ChipaxOrder>(`pedidos/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ChipaxClient(credentials)
    const res = await client.post<ChipaxOrder>('pedidos', untransformOrder(data))
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<{ data: ChipaxSalesOrder[] }>(
      'ordenes-venta',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<ChipaxSalesOrder>(`ordenes-venta/${id}`)
    return transformSalesOrder(res)
  }

  async createSalesOrder(
    credentials: Credentials,
    data: Partial<SalesOrder>,
  ): Promise<SalesOrder> {
    const client = new ChipaxClient(credentials)
    const res = await client.post<ChipaxSalesOrder>('ordenes-venta', untransformSalesOrder(data))
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<{ data: ChipaxPurchaseOrder[] }>(
      'ordenes-compra',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new ChipaxClient(credentials)
    const res = await client.get<ChipaxPurchaseOrder>(`ordenes-compra/${id}`)
    return transformPurchaseOrder(res)
  }

  async createPurchaseOrder(
    credentials: Credentials,
    data: Partial<PurchaseOrder>,
  ): Promise<PurchaseOrder> {
    const client = new ChipaxClient(credentials)
    const res = await client.post<ChipaxPurchaseOrder>(
      'ordenes-compra',
      untransformPurchaseOrder(data),
    )
    return transformPurchaseOrder(res)
  }
}
