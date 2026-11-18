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
import { ColppyClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type ColppyInvoice } from './transform/invoice'
import { transformBill, type ColppyBill } from './transform/bill'
import { transformCustomer, transformSupplier, type ColppyCustomer, type ColppySupplier } from './transform/contact'
import { transformAccount, type ColppyAccount } from './transform/account'
import { transformJournal, untransformJournal, type ColppyAsiento } from './transform/journal'
import { transformOrganization, type ColppyCompanyInfo } from './transform/organization'
import { transformTransaction, type ColppyMovimiento } from './transform/transaction'
import { transformTaxRate, type ColppyTaxRate } from './transform/taxrate'
import { transformExpense, untransformExpense, type ColppyExpense } from './transform/expense'
import { transformCreditMemo, untransformCreditMemo, type ColppyCreditMemo } from './transform/creditmemo'
import { transformOrder, untransformOrder, type ColppyOrder } from './transform/order'
import { transformSalesOrder, untransformSalesOrder, type ColppySalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, untransformPurchaseOrder, type ColppyPurchaseOrder } from './transform/purchaseorder'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ColppyAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'colppy'
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
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppyCompanyInfo>('empresas', 'obtenerEmpresa')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppyInvoice[]>('facturas', 'listarFacturas', this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppyInvoice>('facturas', 'obtenerFactura', { idFactura: Number(id) })
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new ColppyClient(credentials)
    const res = await client.post<ColppyInvoice>('facturas', 'crearFactura', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(credentials: Credentials, id: string, data: Partial<Invoice>): Promise<Invoice> {
    const client = new ColppyClient(credentials)
    const res = await client.post<ColppyInvoice>('facturas', 'actualizarFactura', {
      idFactura: Number(id),
      ...untransformInvoice(data),
    })
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppyBill[]>('facturasProveedor', 'listarFacturasProveedor', this.paginationParams(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppyBill>('facturasProveedor', 'obtenerFacturaProveedor', { idFacturaProveedor: Number(id) })
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new ColppyClient(credentials)
    const [customers, suppliers] = await Promise.all([
      client.get<ColppyCustomer[]>('clientes', 'listarClientes', this.paginationParams(params)),
      client.get<ColppySupplier[]>('proveedores', 'listarProveedores', this.paginationParams(params)),
    ])
    const custList = (customers ?? []).map(transformCustomer)
    const suppList = (suppliers ?? []).map(transformSupplier)
    return [...custList, ...suppList]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new ColppyClient(credentials)
    if (id.startsWith('cust_')) {
      const num = id.slice(5)
      const res = await client.get<ColppyCustomer>('clientes', 'obtenerCliente', { idCliente: Number(num) })
      return transformCustomer(res)
    }
    if (id.startsWith('supp_')) {
      const num = id.slice(5)
      const res = await client.get<ColppySupplier>('proveedores', 'obtenerProveedor', { idProveedor: Number(num) })
      return transformSupplier(res)
    }
    throw new Error(`Invalid contact id format: ${id}. Expected cust_<n> or supp_<n>`)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new ColppyClient(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<ColppySupplier>('proveedores', 'crearProveedor', {
        razonSocial: data.name,
        cuit: data.identification,
        email: data.emails?.[0]?.email,
        moneda: data.currency,
      })
      return transformSupplier(res)
    }
    const res = await client.post<ColppyCustomer>('clientes', 'crearCliente', {
      razonSocial: data.name,
      cuit: data.identification,
      email: data.emails?.[0]?.email,
      moneda: data.currency,
      direccion: data.billingAddress?.address1,
      ciudad: data.billingAddress?.city,
      codigoPostal: data.billingAddress?.postalCode,
      pais: data.billingAddress?.country,
    })
    return transformCustomer(res)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const client = new ColppyClient(credentials)
    if (id.startsWith('supp_')) {
      const num = id.slice(5)
      const res = await client.post<ColppySupplier>('proveedores', 'actualizarProveedor', {
        idProveedor: Number(num),
        razonSocial: data.name,
        email: data.emails?.[0]?.email,
      })
      return transformSupplier(res)
    }
    const num = id.slice(5)
    const res = await client.post<ColppyCustomer>('clientes', 'actualizarCliente', {
      idCliente: Number(num),
      razonSocial: data.name,
      email: data.emails?.[0]?.email,
      direccion: data.billingAddress?.address1,
      ciudad: data.billingAddress?.city,
      codigoPostal: data.billingAddress?.postalCode,
      pais: data.billingAddress?.country,
    })
    return transformCustomer(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppyAccount[]>('planDeCuentas', 'listarCuentas', this.paginationParams(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppyAccount>('planDeCuentas', 'obtenerCuenta', { idPlanDeCuenta: Number(id) })
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppyAsiento[]>('asientos', 'listarAsientos', this.paginationParams(params))
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppyAsiento>('asientos', 'obtenerAsiento', { idAsiento: Number(id) })
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new ColppyClient(credentials)
    const res = await client.post<ColppyAsiento>('asientos', 'crearAsiento', untransformJournal(data))
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppyMovimiento[]>('movimientos', 'listarMovimientos', this.paginationParams(params))
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppyMovimiento>('movimientos', 'obtenerMovimiento', { idMovimiento: Number(id) })
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppyTaxRate[]>('alicuotas', 'listarAlicuotas', this.paginationParams(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppyTaxRate>('alicuotas', 'obtenerAlicuota', { idAlicuota: Number(id) })
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppyExpense[]>('gastos', 'listarGastos', this.paginationParams(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppyExpense>('gastos', 'obtenerGasto', { idGasto: Number(id) })
    return transformExpense(res)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new ColppyClient(credentials)
    const res = await client.post<ColppyExpense>('gastos', 'crearGasto', untransformExpense(data))
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppyCreditMemo[]>('notasCredito', 'listarNotasCredito', this.paginationParams(params))
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppyCreditMemo>('notasCredito', 'obtenerNotaCredito', { idNotaCredito: Number(id) })
    return transformCreditMemo(res)
  }

  async createCreditMemo(credentials: Credentials, data: Partial<CreditMemo>): Promise<CreditMemo> {
    const client = new ColppyClient(credentials)
    const res = await client.post<ColppyCreditMemo>('notasCredito', 'crearNotaCredito', untransformCreditMemo(data))
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppyOrder[]>('pedidos', 'listarPedidos', this.paginationParams(params))
    return (res ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppyOrder>('pedidos', 'obtenerPedido', { idPedido: Number(id) })
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ColppyClient(credentials)
    const res = await client.post<ColppyOrder>('pedidos', 'crearPedido', untransformOrder(data))
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppySalesOrder[]>('ordenesVenta', 'listarOrdenesVenta', this.paginationParams(params))
    return (res ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppySalesOrder>('ordenesVenta', 'obtenerOrdenVenta', { idOrdenVenta: Number(id) })
    return transformSalesOrder(res)
  }

  async createSalesOrder(credentials: Credentials, data: Partial<SalesOrder>): Promise<SalesOrder> {
    const client = new ColppyClient(credentials)
    const res = await client.post<ColppySalesOrder>('ordenesVenta', 'crearOrdenVenta', untransformSalesOrder(data))
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppyPurchaseOrder[]>('ordenesCompra', 'listarOrdenesCompra', this.paginationParams(params))
    return (res ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new ColppyClient(credentials)
    const res = await client.get<ColppyPurchaseOrder>('ordenesCompra', 'obtenerOrdenCompra', { idOrdenCompra: Number(id) })
    return transformPurchaseOrder(res)
  }

  async createPurchaseOrder(credentials: Credentials, data: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
    const client = new ColppyClient(credentials)
    const res = await client.post<ColppyPurchaseOrder>('ordenesCompra', 'crearOrdenCompra', untransformPurchaseOrder(data))
    return transformPurchaseOrder(res)
  }
}
