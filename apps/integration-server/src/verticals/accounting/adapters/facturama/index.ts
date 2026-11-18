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
import { FacturamaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type FacturamaInvoice } from './transform/invoice'
import { transformBill, type FacturamaBill } from './transform/bill'
import { transformContact, type FacturamaContact } from './transform/contact'
import { transformAccount, type FacturamaAccount } from './transform/account'
import { transformJournal, untransformJournal, type FacturamaJournal } from './transform/journal'
import { transformOrganization, type FacturamaCompanyInfo } from './transform/organization'
import { transformTransaction, type FacturamaTransaction } from './transform/transaction'
import { transformTaxRate, type FacturamaTaxRate } from './transform/taxrate'
import { transformExpense, untransformExpense, type FacturamaExpense } from './transform/expense'
import { transformCreditMemo, untransformCreditMemo, type FacturamaCreditMemo } from './transform/creditmemo'
import { transformOrder, untransformOrder, type FacturamaOrder } from './transform/order'
import { transformSalesOrder, untransformSalesOrder, type FacturamaSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, untransformPurchaseOrder, type FacturamaPurchaseOrder } from './transform/purchaseorder'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class FacturamaAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'facturama'
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
      ...(params.updatedAfter && {
        modifiedAfter: params.updatedAfter.toISOString(),
      }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new FacturamaClient(credentials)
    const res = await client.get<FacturamaCompanyInfo>('Company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new FacturamaClient(credentials)
    // GET /cfdi/{type}/{keyword}/{status}/{invoiceType}/{page}
    // Using 'issued' type, no keyword filter, 'active' status, 'I' (income) type
    const page = params.page ?? 1
    const res = await client.get<FacturamaInvoice[]>(
      `cfdi/issued/keyword/active/I/${page}`,
    )
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new FacturamaClient(credentials)
    // GET /Cfdi/{id}/{type} — type 'issued' for issued invoices
    const res = await client.get<FacturamaInvoice>(`Cfdi/${id}/issued`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new FacturamaClient(credentials)
    const res = await client.post<FacturamaInvoice>('cfdis', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    // Facturama does not support PUT on CFDIs; invoices must be cancelled and re-issued.
    const client = new FacturamaClient(credentials)
    const res = await client.put<FacturamaInvoice>(`cfdi/${id}`, untransformInvoice(data))
    return transformInvoice(res)
  }

  async deleteInvoice(credentials: Credentials, id: string): Promise<void> {
    const client = new FacturamaClient(credentials)
    // DELETE /cfdi/{id}/{type}/{motive}/{uuidReplacement}
    await client.delete(`cfdi/${id}/issued/02/NA`)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new FacturamaClient(credentials)
    const res = await client.get<FacturamaBill[]>(
      'bills',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new FacturamaClient(credentials)
    const res = await client.get<FacturamaBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts (Clients) ---
  // Facturama uses /Clients/{start}/{length}/{search}/{orderBy}/{orderAsc}/{draw} for listing.

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new FacturamaClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const start = (page - 1) * pageSize
    const res = await client.get<FacturamaContact[]>(
      `Clients/${start}/${pageSize}/keyword/Name/true/1`,
    )
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new FacturamaClient(credentials)
    const res = await client.get<FacturamaContact>(`Client/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new FacturamaClient(credentials)
    const res = await client.post<FacturamaContact>('Client', {
      Name: data.name,
      Rfc: data.identification,
      Email: data.emails?.[0]?.email,
      CurrencyCode: data.currency,
    })
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new FacturamaClient(credentials)
    const res = await client.put<FacturamaContact>(`Client/${id}`, {
      Name: data.name,
      Email: data.emails?.[0]?.email,
    })
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new FacturamaClient(credentials)
    const res = await client.get<FacturamaAccount[]>(
      'accounts',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new FacturamaClient(credentials)
    const res = await client.get<FacturamaAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new FacturamaClient(credentials)
    const res = await client.get<FacturamaJournal[]>(
      'journals',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new FacturamaClient(credentials)
    const res = await client.get<FacturamaJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new FacturamaClient(credentials)
    const res = await client.post<FacturamaJournal>('journals', untransformJournal(data))
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new FacturamaClient(credentials)
    const res = await client.get<FacturamaTransaction[]>(
      'transactions',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new FacturamaClient(credentials)
    const res = await client.get<FacturamaTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new FacturamaClient(credentials)
    const res = await client.get<FacturamaTaxRate[]>(
      'catalogs/taxes',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new FacturamaClient(credentials)
    const res = await client.get<FacturamaTaxRate>(`catalogs/taxes/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new FacturamaClient(credentials)
    const res = await client.get<FacturamaExpense[]>(
      'expenses',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new FacturamaClient(credentials)
    const res = await client.get<FacturamaExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new FacturamaClient(credentials)
    const res = await client.post<FacturamaExpense>('expenses', untransformExpense(data))
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new FacturamaClient(credentials)
    const res = await client.get<FacturamaCreditMemo[]>(
      'credit-memos',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new FacturamaClient(credentials)
    const res = await client.get<FacturamaCreditMemo>(`credit-memos/${id}`)
    return transformCreditMemo(res)
  }

  async createCreditMemo(
    credentials: Credentials,
    data: Partial<CreditMemo>,
  ): Promise<CreditMemo> {
    const client = new FacturamaClient(credentials)
    const res = await client.post<FacturamaCreditMemo>('credit-memos', untransformCreditMemo(data))
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new FacturamaClient(credentials)
    const res = await client.get<FacturamaOrder[]>(
      'orders',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new FacturamaClient(credentials)
    const res = await client.get<FacturamaOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new FacturamaClient(credentials)
    const res = await client.post<FacturamaOrder>('orders', untransformOrder(data))
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new FacturamaClient(credentials)
    const res = await client.get<FacturamaSalesOrder[]>(
      'sales-orders',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new FacturamaClient(credentials)
    const res = await client.get<FacturamaSalesOrder>(`sales-orders/${id}`)
    return transformSalesOrder(res)
  }

  async createSalesOrder(
    credentials: Credentials,
    data: Partial<SalesOrder>,
  ): Promise<SalesOrder> {
    const client = new FacturamaClient(credentials)
    const res = await client.post<FacturamaSalesOrder>('sales-orders', untransformSalesOrder(data))
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new FacturamaClient(credentials)
    const res = await client.get<FacturamaPurchaseOrder[]>(
      'purchase-orders',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new FacturamaClient(credentials)
    const res = await client.get<FacturamaPurchaseOrder>(`purchase-orders/${id}`)
    return transformPurchaseOrder(res)
  }

  async createPurchaseOrder(
    credentials: Credentials,
    data: Partial<PurchaseOrder>,
  ): Promise<PurchaseOrder> {
    const client = new FacturamaClient(credentials)
    const res = await client.post<FacturamaPurchaseOrder>(
      'purchase-orders',
      untransformPurchaseOrder(data),
    )
    return transformPurchaseOrder(res)
  }
}
