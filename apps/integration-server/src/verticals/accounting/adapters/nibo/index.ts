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
import { NiboClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type NiboInvoice } from './transform/invoice'
import { transformBill, type NiboBill } from './transform/bill'
import { transformContact, type NiboContact } from './transform/contact'
import { transformAccount, type NiboAccount } from './transform/account'
import { transformJournal, untransformJournal, type NiboJournal } from './transform/journal'
import { transformOrganization, type NiboOrganization } from './transform/organization'
import { transformTransaction, type NiboTransaction } from './transform/transaction'
import { transformTaxRate, type NiboTaxRate } from './transform/taxrate'
import { transformExpense, untransformExpense, type NiboExpense } from './transform/expense'
import { transformCreditMemo, untransformCreditMemo, type NiboCreditMemo } from './transform/creditmemo'
import { transformOrder, untransformOrder, type NiboOrder } from './transform/order'
import { transformSalesOrder, untransformSalesOrder, type NiboSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, untransformPurchaseOrder, type NiboPurchaseOrder } from './transform/purchaseorder'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class NiboAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'nibo'
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
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    return {
      $top: top,
      $skip: (page - 1) * top,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new NiboClient(credentials)
    const res = await client.get<NiboOrganization>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new NiboClient(credentials)
    const res = await client.get<{ items: NiboInvoice[] }>(
      'invoices',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new NiboClient(credentials)
    const res = await client.get<NiboInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new NiboClient(credentials)
    const res = await client.post<NiboInvoice>('invoices', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new NiboClient(credentials)
    const res = await client.put<NiboInvoice>(`invoices/${id}`, untransformInvoice(data))
    return transformInvoice(res)
  }

  async deleteInvoice(credentials: Credentials, id: string): Promise<void> {
    const client = new NiboClient(credentials)
    await client.delete(`invoices/${id}`)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new NiboClient(credentials)
    const res = await client.get<{ items: NiboBill[] }>(
      'bills',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new NiboClient(credentials)
    const res = await client.get<NiboBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---
  // Nibo API uses separate /customers and /suppliers endpoints.
  // IDs are prefixed: cust_<id> for customers, supp_<id> for suppliers.

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new NiboClient(credentials)
    const [custRes, suppRes] = await Promise.all([
      client.get<{ items: NiboContact[] }>('customers', this.paginationParams(params)),
      client.get<{ items: NiboContact[] }>('suppliers', this.paginationParams(params)),
    ])
    const customers = (custRes.items ?? []).map((c) =>
      transformContact({ ...c, isCustomer: true, isSupplier: false }),
    )
    const suppliers = (suppRes.items ?? []).map((s) =>
      transformContact({ ...s, isCustomer: false, isSupplier: true }),
    )
    return [...customers, ...suppliers]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new NiboClient(credentials)
    if (id.startsWith('supp_')) {
      const num = id.slice(5)
      const res = await client.get<NiboContact>(`suppliers/${num}`)
      return transformContact({ ...res, isCustomer: false, isSupplier: true })
    }
    const num = id.startsWith('cust_') ? id.slice(5) : id
    const res = await client.get<NiboContact>(`customers/${num}`)
    return transformContact({ ...res, isCustomer: true, isSupplier: false })
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new NiboClient(credentials)
    const body = {
      name: data.name,
      cpfCnpj: data.identification,
      email: data.emails?.[0]?.email,
      street: data.billingAddress?.address1,
      city: data.billingAddress?.city,
      zipCode: data.billingAddress?.postalCode,
      state: data.billingAddress?.region,
      country: data.billingAddress?.country,
    }
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<NiboContact>('suppliers', body)
      return transformContact({ ...res, isCustomer: false, isSupplier: true })
    }
    const res = await client.post<NiboContact>('customers', body)
    return transformContact({ ...res, isCustomer: true, isSupplier: false })
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new NiboClient(credentials)
    const body = { name: data.name, email: data.emails?.[0]?.email }
    if (id.startsWith('supp_')) {
      const num = id.slice(5)
      const res = await client.put<NiboContact>(`suppliers/${num}`, body)
      return transformContact({ ...res, isCustomer: false, isSupplier: true })
    }
    const num = id.startsWith('cust_') ? id.slice(5) : id
    const res = await client.put<NiboContact>(`customers/${num}`, body)
    return transformContact({ ...res, isCustomer: true, isSupplier: false })
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    const client = new NiboClient(credentials)
    if (id.startsWith('supp_')) {
      await client.delete(`suppliers/${id.slice(5)}`)
      return
    }
    await client.delete(`customers/${id.startsWith('cust_') ? id.slice(5) : id}`)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new NiboClient(credentials)
    const res = await client.get<{ items: NiboAccount[] }>(
      'accounts',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new NiboClient(credentials)
    const res = await client.get<NiboAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new NiboClient(credentials)
    const res = await client.get<{ items: NiboJournal[] }>(
      'journals',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new NiboClient(credentials)
    const res = await client.get<NiboJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new NiboClient(credentials)
    const res = await client.post<NiboJournal>('journals', untransformJournal(data))
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new NiboClient(credentials)
    const res = await client.get<{ items: NiboTransaction[] }>(
      'transactions',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new NiboClient(credentials)
    const res = await client.get<NiboTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new NiboClient(credentials)
    const res = await client.get<{ items: NiboTaxRate[] }>(
      'taxrates',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new NiboClient(credentials)
    const res = await client.get<NiboTaxRate>(`taxrates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new NiboClient(credentials)
    const res = await client.get<{ items: NiboExpense[] }>(
      'expenses',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new NiboClient(credentials)
    const res = await client.get<NiboExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new NiboClient(credentials)
    const res = await client.post<NiboExpense>('expenses', untransformExpense(data))
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new NiboClient(credentials)
    const res = await client.get<{ items: NiboCreditMemo[] }>(
      'creditmemos',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new NiboClient(credentials)
    const res = await client.get<NiboCreditMemo>(`creditmemos/${id}`)
    return transformCreditMemo(res)
  }

  async createCreditMemo(
    credentials: Credentials,
    data: Partial<CreditMemo>,
  ): Promise<CreditMemo> {
    const client = new NiboClient(credentials)
    const res = await client.post<NiboCreditMemo>('creditmemos', untransformCreditMemo(data))
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new NiboClient(credentials)
    const res = await client.get<{ items: NiboOrder[] }>(
      'orders',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new NiboClient(credentials)
    const res = await client.get<NiboOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new NiboClient(credentials)
    const res = await client.post<NiboOrder>('orders', untransformOrder(data))
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new NiboClient(credentials)
    const res = await client.get<{ items: NiboSalesOrder[] }>(
      'salesorders',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new NiboClient(credentials)
    const res = await client.get<NiboSalesOrder>(`salesorders/${id}`)
    return transformSalesOrder(res)
  }

  async createSalesOrder(
    credentials: Credentials,
    data: Partial<SalesOrder>,
  ): Promise<SalesOrder> {
    const client = new NiboClient(credentials)
    const res = await client.post<NiboSalesOrder>('salesorders', untransformSalesOrder(data))
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new NiboClient(credentials)
    const res = await client.get<{ items: NiboPurchaseOrder[] }>(
      'purchaseorders',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new NiboClient(credentials)
    const res = await client.get<NiboPurchaseOrder>(`purchaseorders/${id}`)
    return transformPurchaseOrder(res)
  }

  async createPurchaseOrder(
    credentials: Credentials,
    data: Partial<PurchaseOrder>,
  ): Promise<PurchaseOrder> {
    const client = new NiboClient(credentials)
    const res = await client.post<NiboPurchaseOrder>(
      'purchaseorders',
      untransformPurchaseOrder(data),
    )
    return transformPurchaseOrder(res)
  }
}
