/**
 * Qoyod accounting adapter.
 *
 * Auth: API-KEY header (per-business private key generated in Qoyod General Settings).
 * Base URL: https://api.qoyod.com/2.0/
 * Docs: https://apidoc.qoyod.com/
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
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Organization } from '../../schema/organization'

import { getAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefreshCredentials } from './auth'
import { QoyodClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type QoyodInvoice } from './transform/invoice'
import { transformBill, type QoyodBill } from './transform/bill'
import { transformCustomer, transformVendor, type QoyodCustomer, type QoyodVendor } from './transform/contact'
import { transformAccount, type QoyodAccount } from './transform/account'
import { transformJournal, untransformJournal, type QoyodJournalEntry } from './transform/journal'
import { transformOrganization, type QoyodOrganization } from './transform/organization'
import { transformTaxRate, type QoyodTaxRate } from './transform/taxrate'
import { transformCreditMemo, type QoyodCreditNote } from './transform/creditmemo'
import { transformExpense, type QoyodSimpleBill } from './transform/expense'
import { transformSalesOrder, type QoyodQuote } from './transform/salesorder'
import { transformPurchaseOrder, type QoyodPurchaseOrder } from './transform/purchaseorder'
import { transformTransaction, type QoyodPayment } from './transform/transaction'

// Qoyod paginated list responses wrap items in a `data` array
interface QoyodListResponse<T> {
  data: T[]
  meta?: {
    current_page?: number
    last_page?: number
    total?: number
    per_page?: number
  }
}

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API key',
  helpText: 'Generate your API key in Qoyod → Settings → General Settings.',
})

export class QoyodAdapter implements AccountingAdapter {
  readonly platform = 'qoyod'
  readonly version = '0.1.0'

  // Connect Link support — single API-key form
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

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
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new QoyodClient(credentials)
    const res = await client.get<{ data: QoyodOrganization }>('organization')
    return transformOrganization(res.data)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new QoyodClient(credentials)
    const res = await client.get<QoyodListResponse<QoyodInvoice>>(
      'invoices',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new QoyodClient(credentials)
    const res = await client.get<{ data: QoyodInvoice }>(`invoices/${id}`)
    return transformInvoice(res.data)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new QoyodClient(credentials)
    const res = await client.post<{ data: QoyodInvoice }>('invoices', untransformInvoice(data))
    return transformInvoice(res.data)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new QoyodClient(credentials)
    const res = await client.put<{ data: QoyodInvoice }>(`invoices/${id}`, untransformInvoice(data))
    return transformInvoice(res.data)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new QoyodClient(credentials)
    const res = await client.get<QoyodListResponse<QoyodBill>>(
      'bills',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new QoyodClient(credentials)
    const res = await client.get<{ data: QoyodBill }>(`bills/${id}`)
    return transformBill(res.data)
  }

  // --- Contacts (Customers + Vendors) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new QoyodClient(credentials)
    const pagination = this.paginationParams(params)
    const [custRes, vendRes] = await Promise.all([
      client.get<QoyodListResponse<QoyodCustomer>>('customers', pagination),
      client.get<QoyodListResponse<QoyodVendor>>('vendors', pagination),
    ])
    const customers = (custRes.data ?? []).map(transformCustomer)
    const vendors = (vendRes.data ?? []).map(transformVendor)
    return [...customers, ...vendors]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new QoyodClient(credentials)
    if (id.startsWith('cust_')) {
      const rawId = id.slice(5)
      const res = await client.get<{ data: QoyodCustomer }>(`customers/${rawId}`)
      return transformCustomer(res.data)
    }
    if (id.startsWith('vend_')) {
      const rawId = id.slice(5)
      const res = await client.get<{ data: QoyodVendor }>(`vendors/${rawId}`)
      return transformVendor(res.data)
    }
    throw new Error(`Invalid contact id: ${id}. Expected cust_<n> or vend_<n>`)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new QoyodClient(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<{ data: QoyodVendor }>('vendors', {
        name: data.name,
        email: data.emails?.[0]?.email,
        phone: data.telephones?.[0]?.telephone,
        vat_number: data.taxNumber,
        address: data.billingAddress?.address1,
        city: data.billingAddress?.city,
        country: data.billingAddress?.country,
      })
      return transformVendor(res.data)
    }
    const res = await client.post<{ data: QoyodCustomer }>('customers', {
      name: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      vat_number: data.taxNumber,
      address: data.billingAddress?.address1,
      city: data.billingAddress?.city,
      country: data.billingAddress?.country,
    })
    return transformCustomer(res.data)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new QoyodClient(credentials)
    if (id.startsWith('vend_')) {
      const rawId = id.slice(5)
      const res = await client.put<{ data: QoyodVendor }>(`vendors/${rawId}`, {
        name: data.name,
        email: data.emails?.[0]?.email,
        phone: data.telephones?.[0]?.telephone,
      })
      return transformVendor(res.data)
    }
    const rawId = id.startsWith('cust_') ? id.slice(5) : id
    const res = await client.put<{ data: QoyodCustomer }>(`customers/${rawId}`, {
      name: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
    })
    return transformCustomer(res.data)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new QoyodClient(credentials)
    const res = await client.get<QoyodListResponse<QoyodAccount>>(
      'accounts',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new QoyodClient(credentials)
    const res = await client.get<{ data: QoyodAccount }>(`accounts/${id}`)
    return transformAccount(res.data)
  }

  // --- Journals (Journal Entries) ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new QoyodClient(credentials)
    const res = await client.get<QoyodListResponse<QoyodJournalEntry>>(
      'journal_entries',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new QoyodClient(credentials)
    const res = await client.get<{ data: QoyodJournalEntry }>(`journal_entries/${id}`)
    return transformJournal(res.data)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new QoyodClient(credentials)
    const res = await client.post<{ data: QoyodJournalEntry }>(
      'journal_entries',
      untransformJournal(data),
    )
    return transformJournal(res.data)
  }

  // --- Transactions (Invoice Payments / Receipts) ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new QoyodClient(credentials)
    const res = await client.get<QoyodListResponse<QoyodPayment>>(
      'invoice_payments',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new QoyodClient(credentials)
    const res = await client.get<{ data: QoyodPayment }>(`invoice_payments/${id}`)
    return transformTransaction(res.data)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new QoyodClient(credentials)
    const res = await client.get<QoyodListResponse<QoyodTaxRate>>(
      'taxes',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new QoyodClient(credentials)
    const res = await client.get<{ data: QoyodTaxRate }>(`taxes/${id}`)
    return transformTaxRate(res.data)
  }

  // --- Expenses (Simple Bills) ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new QoyodClient(credentials)
    const res = await client.get<QoyodListResponse<QoyodSimpleBill>>(
      'simple_bills',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new QoyodClient(credentials)
    const res = await client.get<{ data: QoyodSimpleBill }>(`simple_bills/${id}`)
    return transformExpense(res.data)
  }

  // --- Credit Memos (Credit Notes) ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new QoyodClient(credentials)
    const res = await client.get<QoyodListResponse<QoyodCreditNote>>(
      'credit_notes',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new QoyodClient(credentials)
    const res = await client.get<{ data: QoyodCreditNote }>(`credit_notes/${id}`)
    return transformCreditMemo(res.data)
  }

  // --- Sales Orders (Quotes) ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new QoyodClient(credentials)
    const res = await client.get<QoyodListResponse<QoyodQuote>>(
      'quotes',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new QoyodClient(credentials)
    const res = await client.get<{ data: QoyodQuote }>(`quotes/${id}`)
    return transformSalesOrder(res.data)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new QoyodClient(credentials)
    const res = await client.get<QoyodListResponse<QoyodPurchaseOrder>>(
      'purchase_orders',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new QoyodClient(credentials)
    const res = await client.get<{ data: QoyodPurchaseOrder }>(`purchase_orders/${id}`)
    return transformPurchaseOrder(res.data)
  }
}
