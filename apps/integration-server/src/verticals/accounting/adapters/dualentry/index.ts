/**
 * DualEntry accounting adapter.
 *
 * Auth: API key sent in the `X-API-KEY` request header.
 * Base URL: https://api.dualentry.com/public/v2/
 * Pagination: offset-based ({ limit, offset }); responses enveloped as { items, count }.
 *
 * Supported resources: Organization (companies), Invoices, Bills, Contacts
 * (customers + vendors), Accounts, Journals (journal-entries), TaxRates
 * (vat-rates), PurchaseOrders, CreditMemos (credit-notes), Transactions
 * (payments), Expenses (direct-expenses), SalesOrders (sales-orders),
 * Orders (derived from sales-orders with type=SALES).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * All 13 canonical accounting resources are available.
 */
import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { TaxRate } from '../../schema/taxrate'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Organization } from '../../schema/organization'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Transaction } from '../../schema/transaction'
import type { Expense } from '../../schema/expense'
import type { SalesOrder } from '../../schema/salesorder'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeCode, refreshCredentials as refreshCreds } from './auth'
import { DualentryClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type DualentryInvoice } from './transform/invoice'
import { transformBill, type DualentryBill } from './transform/bill'
import {
  transformCustomer,
  transformVendor,
  type DualentryCustomer,
  type DualentryVendor,
} from './transform/contact'
import { transformAccount, type DualentryAccount } from './transform/account'
import {
  transformJournal,
  untransformJournal,
  type DualentryJournalEntry,
} from './transform/journal'
import { transformTaxRate, type DualentryVatRate } from './transform/taxrate'
import {
  transformPurchaseOrder,
  type DualentryPurchaseOrder,
} from './transform/purchaseorder'
import { transformOrganization, type DualentryCompany } from './transform/organization'
import {
  transformCreditMemo,
  type DualentryCreditNote,
} from './transform/creditmemo'
import { transformTransaction, type DualentryPayment } from './transform/transaction'
import { transformExpense, type DualentryDirectExpense } from './transform/expense'
import { transformSalesOrder, type DualentrySalesOrder } from './transform/salesorder'
import { transformOrder } from './transform/order'

// ── Connect Link (api_key form) ───────────────────────────────────────────────

const SIMPLE_API_KEY_FORM = simpleApiKey()

// ── Pagination helpers ────────────────────────────────────────────────────────

interface PagedResponse<T> {
  items: T[]
  count: number
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class DualentryAdapter implements AccountingAdapter {
  readonly platform = 'dualentry'
  readonly version = '0.1.0'

  // Connect Link support — single API-key form
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCreds(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    return {
      limit,
      offset: (page - 1) * limit,
      ...(params.updatedAfter && {
        start_date: params.updatedAfter.toISOString().split('T')[0],
      }),
    }
  }

  // ── Organization ────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new DualentryClient(credentials)
    const res = await client.get<PagedResponse<DualentryCompany>>('companies/')
    const company = res.items[0]
    if (!company) throw new Error('No company found in DualEntry account')
    return transformOrganization(company)
  }

  // ── Invoices ────────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new DualentryClient(credentials)
    const res = await client.get<PagedResponse<DualentryInvoice>>(
      'invoices/',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new DualentryClient(credentials)
    const res = await client.get<DualentryInvoice>(`invoices/${id}/`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new DualentryClient(credentials)
    const res = await client.post<DualentryInvoice>('invoices/', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new DualentryClient(credentials)
    const res = await client.put<DualentryInvoice>(`invoices/${id}/`, untransformInvoice(data))
    return transformInvoice(res)
  }

  // ── Bills ───────────────────────────────────────────────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new DualentryClient(credentials)
    const res = await client.get<PagedResponse<DualentryBill>>(
      'bills/',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new DualentryClient(credentials)
    const res = await client.get<DualentryBill>(`bills/${id}/`)
    return transformBill(res)
  }

  // ── Contacts (Customers + Vendors) ──────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new DualentryClient(credentials)
    const [custRes, vendRes] = await Promise.all([
      client.get<PagedResponse<DualentryCustomer>>('customers/', this.paginationParams(params)),
      client.get<PagedResponse<DualentryVendor>>('vendors/', this.paginationParams(params)),
    ])
    const customers = (custRes.items ?? []).map(transformCustomer)
    const vendors = (vendRes.items ?? []).map(transformVendor)
    return [...customers, ...vendors]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new DualentryClient(credentials)
    if (id.startsWith('cust_')) {
      const rawId = id.slice(5)
      const res = await client.get<DualentryCustomer>(`customers/${rawId}/`)
      return transformCustomer(res)
    }
    if (id.startsWith('vend_')) {
      const rawId = id.slice(5)
      const res = await client.get<DualentryVendor>(`vendors/${rawId}/`)
      return transformVendor(res)
    }
    throw new Error(
      `Invalid DualEntry contact id format: "${id}". Expected cust_<n> or vend_<n>`,
    )
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new DualentryClient(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<DualentryVendor>('vendors/', {
        name: data.name,
        email: data.emails?.[0]?.email,
        phone: data.telephones?.[0]?.telephone,
        unique_id: data.identification,
        tin: data.taxNumber,
      })
      return transformVendor(res)
    }
    const res = await client.post<DualentryCustomer>('customers/', {
      name: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      unique_id: data.identification,
      full_address: data.billingAddress
        ? {
            street: data.billingAddress.address1,
            second_line: data.billingAddress.address2,
            city: data.billingAddress.city,
            state: data.billingAddress.region,
            postal_code: data.billingAddress.postalCode,
            country: data.billingAddress.country,
          }
        : undefined,
    })
    return transformCustomer(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new DualentryClient(credentials)
    if (id.startsWith('vend_')) {
      const rawId = id.slice(5)
      const res = await client.put<DualentryVendor>(`vendors/${rawId}/`, {
        name: data.name,
        email: data.emails?.[0]?.email,
        phone: data.telephones?.[0]?.telephone,
      })
      return transformVendor(res)
    }
    const rawId = id.startsWith('cust_') ? id.slice(5) : id
    const res = await client.put<DualentryCustomer>(`customers/${rawId}/`, {
      name: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      full_address: data.billingAddress
        ? {
            street: data.billingAddress.address1,
            second_line: data.billingAddress.address2,
            city: data.billingAddress.city,
            state: data.billingAddress.region,
            postal_code: data.billingAddress.postalCode,
            country: data.billingAddress.country,
          }
        : undefined,
    })
    return transformCustomer(res)
  }

  // ── Accounts ────────────────────────────────────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new DualentryClient(credentials)
    const res = await client.get<PagedResponse<DualentryAccount>>(
      'accounts/',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new DualentryClient(credentials)
    const res = await client.get<DualentryAccount>(`accounts/${id}/`)
    return transformAccount(res)
  }

  // ── Journals (Journal Entries) ───────────────────────────────────────────────

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new DualentryClient(credentials)
    const res = await client.get<PagedResponse<DualentryJournalEntry>>(
      'journal-entries/',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new DualentryClient(credentials)
    const res = await client.get<DualentryJournalEntry>(`journal-entries/${id}/`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new DualentryClient(credentials)
    const res = await client.post<DualentryJournalEntry>(
      'journal-entries/',
      untransformJournal(data),
    )
    return transformJournal(res)
  }

  // ── Tax Rates (VAT Rates) ────────────────────────────────────────────────────

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new DualentryClient(credentials)
    const res = await client.get<PagedResponse<DualentryVatRate>>(
      'vat-rates/',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new DualentryClient(credentials)
    const res = await client.get<DualentryVatRate>(`vat-rates/${id}/`)
    return transformTaxRate(res)
  }

  // ── Purchase Orders ──────────────────────────────────────────────────────────

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new DualentryClient(credentials)
    const res = await client.get<PagedResponse<DualentryPurchaseOrder>>(
      'purchase-orders/',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new DualentryClient(credentials)
    const res = await client.get<DualentryPurchaseOrder>(`purchase-orders/${id}/`)
    return transformPurchaseOrder(res)
  }

  // ── Credit Memos (Credit Notes) ──────────────────────────────────────────────

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new DualentryClient(credentials)
    const res = await client.get<PagedResponse<DualentryCreditNote>>(
      'credit-notes/',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new DualentryClient(credentials)
    const res = await client.get<DualentryCreditNote>(`credit-notes/${id}/`)
    return transformCreditMemo(res)
  }

  // ── Transactions (Payments) ──────────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new DualentryClient(credentials)
    const res = await client.get<PagedResponse<DualentryPayment>>(
      'payments/',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new DualentryClient(credentials)
    const res = await client.get<DualentryPayment>(`payments/${id}/`)
    return transformTransaction(res)
  }

  // ── Expenses (Direct Expenses) ───────────────────────────────────────────────

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new DualentryClient(credentials)
    const res = await client.get<PagedResponse<DualentryDirectExpense>>(
      'direct-expenses/',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new DualentryClient(credentials)
    const res = await client.get<DualentryDirectExpense>(`direct-expenses/${id}/`)
    return transformExpense(res)
  }

  // ── Sales Orders ─────────────────────────────────────────────────────────────

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new DualentryClient(credentials)
    const res = await client.get<PagedResponse<DualentrySalesOrder>>(
      'sales-orders/',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new DualentryClient(credentials)
    const res = await client.get<DualentrySalesOrder>(`sales-orders/${id}/`)
    return transformSalesOrder(res)
  }

  // ── Orders (derived from sales-orders, type = SALES) ────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new DualentryClient(credentials)
    const res = await client.get<PagedResponse<DualentrySalesOrder>>(
      'sales-orders/',
      this.paginationParams(params),
    )
    return (res.items ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new DualentryClient(credentials)
    const res = await client.get<DualentrySalesOrder>(`sales-orders/${id}/`)
    return transformOrder(res)
  }
}
