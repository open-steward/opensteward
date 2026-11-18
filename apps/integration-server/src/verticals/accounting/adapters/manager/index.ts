/**
 * Manager (manager.io) accounting adapter.
 *
 * Auth:  API key (X-API-KEY header).  No OAuth2 flow.
 * API:   REST /api2 — cloud edition at https://{slug}.manager.io/api2
 *                   — server edition at http://localhost:55667/api2
 * Docs:  https://manager.readme.io/reference
 *
 * Supported resources:
 *   Organization    — derived from credentials metadata (no dedicated endpoint)
 *   Invoices        — GET/POST/PUT /api2/sales-invoices, /api2/sales-invoice-form
 *   Bills           — GET /api2/purchase-invoices
 *   Contacts        — GET/POST/PUT /api2/customers, /api2/suppliers
 *   Accounts        — GET /api2/chart-of-accounts
 *   Journal         — GET/POST /api2/journal-entries, /api2/journal-entry-form
 *   Transactions    — GET /api2/payments
 *   Tax rates       — GET /api2/tax-codes
 *   Credit memos    — GET /api2/credit-notes
 *   Expenses        — GET /api2/expense-claims, /api2/expense-claim-form
 *   Purchase orders — GET /api2/pending-purchase-orders, /api2/purchase-order-form
 *   Sales orders    — GET /api2/pending-sales-orders, /api2/sales-order-form
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: order — Manager has no generic "order" concept; purchase and
 *              sales orders are separate resources (purchaseorder / salesorder).
 */
import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Organization } from '../../schema/organization'
import type { Expense } from '../../schema/expense'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { SalesOrder } from '../../schema/salesorder'

import { getAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefreshCredentials } from './auth'
import { ManagerClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type ManagerSalesInvoice } from './transform/invoice'
import { transformBill, type ManagerPurchaseInvoice } from './transform/bill'
import {
  transformCustomer,
  transformSupplier,
  type ManagerCustomer,
  type ManagerSupplier,
} from './transform/contact'
import { transformAccount, type ManagerAccount } from './transform/account'
import { transformJournal, untransformJournal, type ManagerJournalEntry } from './transform/journal'
import { transformOrganization, type ManagerBusinessDetails } from './transform/organization'
import { transformTransaction, type ManagerPayment } from './transform/transaction'
import { transformTaxRate, type ManagerTaxCode } from './transform/taxrate'
import { transformCreditMemo, type ManagerCreditNote } from './transform/creditmemo'
import { transformExpense, type ManagerExpenseClaim } from './transform/expense'
import { transformPurchaseOrder, type ManagerPurchaseOrder } from './transform/purchaseorder'
import { transformSalesOrder, type ManagerSalesOrder } from './transform/salesorder'

/** Manager API2 list envelope */
interface ManagerListResponse<T> {
  data?: T[]
  /** Some endpoints use `<resourceName>` key instead of `data` */
  [key: string]: unknown
  skip?: number
  pageSize?: number
  totalRecords?: number
}

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'Manager API key',
  helpText:
    'Generate an access token in Manager under Settings > Access Tokens. For cloud edition, also provide your business slug (e.g. "northwind" from northwind.manager.io) separated by a colon: apiKey:businessSlug',
})

export class ManagerAdapter implements AccountingAdapter {
  // Connect Link — API-key form with optional business slug
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  readonly platform = 'manager'
  readonly version = '0.1.0'

  // No OAuth2 config needed for API-key auth
  constructor() {}

  /**
   * Parse the user-supplied value from the Connect Link form.
   * The helpText instructs users to enter `apiKey:businessSlug` for cloud
   * edition. We must split on the first colon here — simpleApiKey's built-in
   * exchangeCredentials only sets { accessToken: value } and never populates
   * tenantId, which causes buildApiBase() to fall back to localhost.
   */
  async exchangeCredentials(fields: Record<string, string>): Promise<import('../../adapter/interface').Credentials> {
    const raw = (fields?.['apiKey'] ?? '').trim()
    if (!raw) throw new Error('Manager API key is required.')
    const colonIdx = raw.indexOf(':')
    if (colonIdx === -1) {
      return { accessToken: raw }
    }
    const apiKey = raw.slice(0, colonIdx).trim()
    const businessSlug = raw.slice(colonIdx + 1).trim()
    return { accessToken: apiKey, tenantId: businessSlug || undefined }
  }

  getAuthUrl(_state: string): string {
    return getAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      skip: ((params.page ?? 1) - 1) * Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  /** Extract an array from a Manager list response.
   *  Manager wraps results in `{ data: [...] }` but some endpoints use a
   *  named key.  We try `data` first then fall back to the first array value.
   */
  private extractList<T>(res: ManagerListResponse<T>): T[] {
    if (Array.isArray(res.data)) return res.data as T[]
    for (const val of Object.values(res)) {
      if (Array.isArray(val)) return val as T[]
    }
    return []
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    // Manager API2 does not expose a business-info endpoint; synthesise from
    // the business slug stored in tenantId.
    const details: ManagerBusinessDetails = {
      slug: credentials.tenantId,
      name: credentials.tenantId,
    }
    // Best-effort: try fetching the business settings if the platform exposes it
    try {
      const client = new ManagerClient(credentials)
      const res = await client.get<ManagerBusinessDetails>('business')
      return transformOrganization({ ...details, ...res })
    } catch {
      return transformOrganization(details)
    }
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new ManagerClient(credentials)
    const res = await client.get<ManagerListResponse<ManagerSalesInvoice>>(
      'sales-invoices',
      this.paginationParams(params),
    )
    return this.extractList<ManagerSalesInvoice>(res).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new ManagerClient(credentials)
    const res = await client.get<ManagerSalesInvoice>(`sales-invoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new ManagerClient(credentials)
    const res = await client.post<ManagerSalesInvoice>('sales-invoice-form', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new ManagerClient(credentials)
    const res = await client.put<ManagerSalesInvoice>(
      `sales-invoice-form/${id}`,
      untransformInvoice(data),
    )
    return transformInvoice(res)
  }

  // --- Bills (Purchase Invoices) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new ManagerClient(credentials)
    const res = await client.get<ManagerListResponse<ManagerPurchaseInvoice>>(
      'purchase-invoices',
      this.paginationParams(params),
    )
    return this.extractList<ManagerPurchaseInvoice>(res).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new ManagerClient(credentials)
    const res = await client.get<ManagerPurchaseInvoice>(`purchase-invoices/${id}`)
    return transformBill(res)
  }

  // --- Contacts (Customers + Suppliers) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new ManagerClient(credentials)
    const [custRes, suppRes] = await Promise.all([
      client.get<ManagerListResponse<ManagerCustomer>>('customers', this.paginationParams(params)),
      client.get<ManagerListResponse<ManagerSupplier>>('suppliers', this.paginationParams(params)),
    ])
    const customers = this.extractList<ManagerCustomer>(custRes).map(transformCustomer)
    const suppliers = this.extractList<ManagerSupplier>(suppRes).map(transformSupplier)
    return [...customers, ...suppliers]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new ManagerClient(credentials)
    if (id.startsWith('cust_')) {
      const key = id.slice(5)
      const res = await client.get<ManagerCustomer>(`customers/${key}`)
      return transformCustomer(res)
    }
    if (id.startsWith('supp_')) {
      const key = id.slice(5)
      const res = await client.get<ManagerSupplier>(`suppliers/${key}`)
      return transformSupplier(res)
    }
    throw new Error(`Invalid contact id: ${id}. Expected cust_<key> or supp_<key>`)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new ManagerClient(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<ManagerSupplier>('supplier-form', {
        name: data.name,
        code: data.identification,
        email: data.emails?.[0]?.email,
        phone: data.telephones?.[0]?.telephone,
        address: data.billingAddress?.address1,
      })
      return transformSupplier(res)
    }
    const res = await client.post<ManagerCustomer>('customer-form', {
      name: data.name,
      code: data.identification,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      address: data.billingAddress?.address1,
    })
    return transformCustomer(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new ManagerClient(credentials)
    if (id.startsWith('supp_')) {
      const key = id.slice(5)
      const res = await client.put<ManagerSupplier>(`supplier-form/${key}`, {
        name: data.name,
        email: data.emails?.[0]?.email,
        phone: data.telephones?.[0]?.telephone,
        address: data.billingAddress?.address1,
      })
      return transformSupplier(res)
    }
    const key = id.slice(5)
    const res = await client.put<ManagerCustomer>(`customer-form/${key}`, {
      name: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      address: data.billingAddress?.address1,
    })
    return transformCustomer(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new ManagerClient(credentials)
    const res = await client.get<ManagerListResponse<ManagerAccount>>(
      'chart-of-accounts',
      this.paginationParams(params),
    )
    return this.extractList<ManagerAccount>(res).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new ManagerClient(credentials)
    const res = await client.get<ManagerAccount>(`chart-of-accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new ManagerClient(credentials)
    const res = await client.get<ManagerListResponse<ManagerJournalEntry>>(
      'journal-entries',
      this.paginationParams(params),
    )
    return this.extractList<ManagerJournalEntry>(res).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new ManagerClient(credentials)
    const res = await client.get<ManagerJournalEntry>(`journal-entries/${id}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new ManagerClient(credentials)
    const res = await client.post<ManagerJournalEntry>(
      'journal-entry-form',
      untransformJournal(data),
    )
    return transformJournal(res)
  }

  // --- Transactions (Payments) ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new ManagerClient(credentials)
    const res = await client.get<ManagerListResponse<ManagerPayment>>(
      'payments',
      this.paginationParams(params),
    )
    return this.extractList<ManagerPayment>(res).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new ManagerClient(credentials)
    const res = await client.get<ManagerPayment>(`payments/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new ManagerClient(credentials)
    const res = await client.get<ManagerListResponse<ManagerTaxCode>>(
      'tax-codes',
      this.paginationParams(params),
    )
    return this.extractList<ManagerTaxCode>(res).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new ManagerClient(credentials)
    const res = await client.get<ManagerTaxCode>(`tax-codes/${id}`)
    return transformTaxRate(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new ManagerClient(credentials)
    const res = await client.get<ManagerListResponse<ManagerCreditNote>>(
      'credit-notes',
      this.paginationParams(params),
    )
    return this.extractList<ManagerCreditNote>(res).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new ManagerClient(credentials)
    const res = await client.get<ManagerCreditNote>(`credit-notes/${id}`)
    return transformCreditMemo(res)
  }

  // --- Expenses (Expense Claims) ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new ManagerClient(credentials)
    const res = await client.get<ManagerListResponse<ManagerExpenseClaim>>(
      'expense-claims',
      this.paginationParams(params),
    )
    return this.extractList<ManagerExpenseClaim>(res).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new ManagerClient(credentials)
    const res = await client.get<ManagerExpenseClaim>(`expense-claim-form/${id}`)
    return transformExpense(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new ManagerClient(credentials)
    const res = await client.get<ManagerListResponse<ManagerPurchaseOrder>>(
      'pending-purchase-orders',
      this.paginationParams(params),
    )
    return this.extractList<ManagerPurchaseOrder>(res).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new ManagerClient(credentials)
    const res = await client.get<ManagerPurchaseOrder>(`purchase-order-form/${id}`)
    return transformPurchaseOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new ManagerClient(credentials)
    const res = await client.get<ManagerListResponse<ManagerSalesOrder>>(
      'pending-sales-orders',
      this.paginationParams(params),
    )
    return this.extractList<ManagerSalesOrder>(res).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new ManagerClient(credentials)
    const res = await client.get<ManagerSalesOrder>(`sales-order-form/${id}`)
    return transformSalesOrder(res)
  }
}
