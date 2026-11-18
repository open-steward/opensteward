/**
 * Bigcapital accounting adapter.
 *
 * Auth: API key (Bearer token, prefix bc_)
 * Base URL: https://api.bigcapital.com/api/ (cloud default)
 *           or customer-supplied via credentials.extra.baseUrl (self-hosted)
 * Docs: https://docs.bigcapital.app/api-reference/introduction
 *
 * Bigcapital is primarily self-hosted open-source software. Self-hosted
 * customers supply their own instance URL at credential-entry time.
 *
 * Supported resources: Organization, Invoices, Bills, Contacts (Customers +
 * Vendors), Accounts, Journals (Manual Journals), Expenses, Tax Rates,
 * CreditMemos, SalesOrders (derived from /api/sale-estimates).
 *
 * Money: Bigcapital returns floating-point major-unit amounts (e.g. 1250.00).
 * Canonical Amount fields are integer minor units (cents). All transforms
 * multiply raw amounts by 100 and Math.round() before returning.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: transaction — /api/banking/transactions requires a mandatory
 *   bank accountId and returns bank-feed withdrawal/deposit entries with no
 *   standalone id; getTransaction(id) cannot be satisfied.
 * Unavailable: order — Bigcapital has no generic order resource; sales flow
 *   uses invoices and purchase flow uses bills.
 * Unavailable: purchaseorder — no dedicated purchase order endpoint;
 *   bills serve this role and are already mapped separately.
 */
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Organization } from '../../schema/organization'
import type { Expense } from '../../schema/expense'
import type { TaxRate } from '../../schema/taxrate'
import type { CreditMemo } from '../../schema/creditmemo'
import type { SalesOrder } from '../../schema/salesorder'

import { BIGCAPITAL_AUTH } from './auth'
import { BigcapitalClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type BigcapitalInvoice } from './transform/invoice'
import { transformBill, untransformBill, type BigcapitalBill } from './transform/bill'
import {
  transformCustomer,
  transformVendor,
  type BigcapitalCustomer,
  type BigcapitalVendor,
} from './transform/contact'
import { transformAccount, type BigcapitalAccount } from './transform/account'
import {
  transformJournal,
  untransformJournal,
  type BigcapitalManualJournal,
} from './transform/journal'
import { transformOrganization, type BigcapitalOrganization } from './transform/organization'
import { transformExpense, untransformExpense, type BigcapitalExpense } from './transform/expense'
import { transformTaxRate, type BigcapitalTaxRate } from './transform/taxrate'
import {
  transformCreditMemo,
  untransformCreditMemo,
  type BigcapitalCreditNote,
} from './transform/creditmemo'
import {
  transformSalesOrder,
  untransformSalesOrder,
  type BigcapitalSaleEstimate,
} from './transform/salesorder'

interface BigcapitalPagination {
  total: number
  page: number
  pageSize: number
}

interface BigcapitalListResponse<T> {
  data: T[]
  pagination: BigcapitalPagination
}

export class BigcapitalAdapter implements AccountingAdapter {
  readonly platform = 'bigcapital'
  readonly version = '0.1.0'

  // API key auth — form fields + credential exchange
  credentialFields = BIGCAPITAL_AUTH.credentialFields
  exchangeCredentials = BIGCAPITAL_AUTH.exchangeCredentials

  // Bigcapital uses API keys; no OAuth flows.
  getAuthUrl(_state: string): string {
    throw new Error('Bigcapital uses API key authentication, not OAuth.')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Bigcapital uses API key authentication, not OAuth.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire; return as-is.
    return credentials
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new BigcapitalClient(credentials)
    const res = await client.get<BigcapitalOrganization>('organization/current')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new BigcapitalClient(credentials)
    const res = await client.get<BigcapitalListResponse<BigcapitalInvoice>>(
      'sale-invoices',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new BigcapitalClient(credentials)
    const res = await client.get<BigcapitalInvoice>(`sale-invoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new BigcapitalClient(credentials)
    const res = await client.post<BigcapitalInvoice>('sale-invoices', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new BigcapitalClient(credentials)
    const res = await client.put<BigcapitalInvoice>(`sale-invoices/${id}`, untransformInvoice(data))
    return transformInvoice(res)
  }

  async deleteInvoice(credentials: Credentials, id: string): Promise<void> {
    const client = new BigcapitalClient(credentials)
    await client.delete(`sale-invoices/${id}`)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new BigcapitalClient(credentials)
    const res = await client.get<BigcapitalListResponse<BigcapitalBill>>(
      'bills',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new BigcapitalClient(credentials)
    const res = await client.get<BigcapitalBill>(`bills/${id}`)
    return transformBill(res)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new BigcapitalClient(credentials)
    const res = await client.post<BigcapitalBill>('bills', untransformBill(data))
    return transformBill(res)
  }

  async updateBill(credentials: Credentials, id: string, data: Partial<Bill>): Promise<Bill> {
    const client = new BigcapitalClient(credentials)
    const res = await client.put<BigcapitalBill>(`bills/${id}`, untransformBill(data))
    return transformBill(res)
  }

  async deleteBill(credentials: Credentials, id: string): Promise<void> {
    const client = new BigcapitalClient(credentials)
    await client.delete(`bills/${id}`)
  }

  // --- Contacts (Customers + Vendors) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new BigcapitalClient(credentials)
    const [custRes, vendRes] = await Promise.all([
      client.get<BigcapitalCustomer[] | BigcapitalListResponse<BigcapitalCustomer>>(
        'customers',
        this.paginationParams(params),
      ),
      client.get<BigcapitalVendor[] | BigcapitalListResponse<BigcapitalVendor>>(
        'vendors',
        this.paginationParams(params),
      ),
    ])
    const customers = Array.isArray(custRes)
      ? custRes
      : ((custRes as BigcapitalListResponse<BigcapitalCustomer>).data ?? [])
    const vendors = Array.isArray(vendRes)
      ? vendRes
      : ((vendRes as BigcapitalListResponse<BigcapitalVendor>).data ?? [])
    return [
      ...customers.map(transformCustomer),
      ...vendors.map(transformVendor),
    ]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new BigcapitalClient(credentials)
    if (id.startsWith('cust_')) {
      const numId = id.slice(5)
      const res = await client.get<BigcapitalCustomer>(`customers/${numId}`)
      return transformCustomer(res)
    }
    if (id.startsWith('vend_')) {
      const numId = id.slice(5)
      const res = await client.get<BigcapitalVendor>(`vendors/${numId}`)
      return transformVendor(res)
    }
    throw new Error(`Invalid contact id format: ${id}. Expected cust_<n> or vend_<n>`)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new BigcapitalClient(credentials)
    const body = {
      displayName: data.name,
      firstName: data.firstName,
      lastName: data.lastName,
      companyName: data.companyName,
      email: data.emails?.[0]?.email,
      workPhone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
      currencyCode: data.currency,
      billingAddress1: data.billingAddress?.address1,
      billingAddress2: data.billingAddress?.address2,
      billingAddressCity: data.billingAddress?.city,
      billingAddressState: data.billingAddress?.region,
      billingAddressPostcode: data.billingAddress?.postalCode,
      billingAddressCountry: data.billingAddress?.country,
    }
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<BigcapitalVendor>('vendors', body)
      return transformVendor(res)
    }
    const res = await client.post<BigcapitalCustomer>('customers', body)
    return transformCustomer(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new BigcapitalClient(credentials)
    const body = {
      displayName: data.name,
      firstName: data.firstName,
      lastName: data.lastName,
      companyName: data.companyName,
      email: data.emails?.[0]?.email,
      workPhone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
      currencyCode: data.currency,
      billingAddress1: data.billingAddress?.address1,
      billingAddress2: data.billingAddress?.address2,
      billingAddressCity: data.billingAddress?.city,
      billingAddressState: data.billingAddress?.region,
      billingAddressPostcode: data.billingAddress?.postalCode,
      billingAddressCountry: data.billingAddress?.country,
    }
    if (id.startsWith('vend_')) {
      const numId = id.slice(5)
      const res = await client.put<BigcapitalVendor>(`vendors/${numId}`, body)
      return transformVendor(res)
    }
    const numId = id.slice(5)
    const res = await client.put<BigcapitalCustomer>(`customers/${numId}`, body)
    return transformCustomer(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    const client = new BigcapitalClient(credentials)
    if (id.startsWith('vend_')) {
      await client.delete(`vendors/${id.slice(5)}`)
      return
    }
    await client.delete(`customers/${id.slice(5)}`)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new BigcapitalClient(credentials)
    const res = await client.get<BigcapitalAccount[] | BigcapitalListResponse<BigcapitalAccount>>(
      'accounts',
      this.paginationParams(params),
    )
    const accounts = Array.isArray(res)
      ? res
      : ((res as BigcapitalListResponse<BigcapitalAccount>).data ?? [])
    return accounts.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new BigcapitalClient(credentials)
    const res = await client.get<BigcapitalAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals (Manual Journals) ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new BigcapitalClient(credentials)
    const res = await client.get<
      BigcapitalManualJournal[] | BigcapitalListResponse<BigcapitalManualJournal>
    >('manual-journals', this.paginationParams(params))
    const journals = Array.isArray(res)
      ? res
      : ((res as BigcapitalListResponse<BigcapitalManualJournal>).data ?? [])
    return journals.map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new BigcapitalClient(credentials)
    const res = await client.get<BigcapitalManualJournal>(`manual-journals/${id}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new BigcapitalClient(credentials)
    const res = await client.post<BigcapitalManualJournal>(
      'manual-journals',
      untransformJournal(data),
    )
    return transformJournal(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new BigcapitalClient(credentials)
    const res = await client.get<BigcapitalListResponse<BigcapitalExpense>>(
      'expenses',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new BigcapitalClient(credentials)
    const res = await client.get<BigcapitalExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new BigcapitalClient(credentials)
    const res = await client.post<BigcapitalExpense>('expenses', untransformExpense(data))
    return transformExpense(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new BigcapitalClient(credentials)
    const res = await client.get<BigcapitalTaxRate[] | BigcapitalListResponse<BigcapitalTaxRate>>(
      'tax-rates',
      this.paginationParams(params),
    )
    const rates = Array.isArray(res)
      ? res
      : ((res as BigcapitalListResponse<BigcapitalTaxRate>).data ?? [])
    return rates.map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new BigcapitalClient(credentials)
    const res = await client.get<BigcapitalTaxRate>(`tax-rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Credit Memos (Credit Notes) ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new BigcapitalClient(credentials)
    const res = await client.get<
      BigcapitalCreditNote[] | BigcapitalListResponse<BigcapitalCreditNote>
    >('credit-notes', this.paginationParams(params))
    const notes = Array.isArray(res)
      ? res
      : ((res as BigcapitalListResponse<BigcapitalCreditNote>).data ?? [])
    return notes.map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new BigcapitalClient(credentials)
    const res = await client.get<BigcapitalCreditNote>(`credit-notes/${id}`)
    return transformCreditMemo(res)
  }

  async createCreditMemo(credentials: Credentials, data: Partial<CreditMemo>): Promise<CreditMemo> {
    const client = new BigcapitalClient(credentials)
    const res = await client.post<BigcapitalCreditNote>('credit-notes', untransformCreditMemo(data))
    return transformCreditMemo(res)
  }

  // --- Sales Orders (derived from Sale Estimates) ---
  // Bigcapital uses /api/sale-estimates as its pre-sale order concept.
  // Estimates carry status lifecycle (draft → delivered → approved/rejected →
  // converted to invoice) that maps onto the canonical SalesOrder statuses.

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new BigcapitalClient(credentials)
    const res = await client.get<
      BigcapitalSaleEstimate[] | BigcapitalListResponse<BigcapitalSaleEstimate>
    >('sale-estimates', this.paginationParams(params))
    const estimates = Array.isArray(res)
      ? res
      : ((res as BigcapitalListResponse<BigcapitalSaleEstimate>).data ?? [])
    return estimates.map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new BigcapitalClient(credentials)
    const res = await client.get<BigcapitalSaleEstimate>(`sale-estimates/${id}`)
    return transformSalesOrder(res)
  }

  async createSalesOrder(credentials: Credentials, data: Partial<SalesOrder>): Promise<SalesOrder> {
    const client = new BigcapitalClient(credentials)
    const res = await client.post<BigcapitalSaleEstimate>(
      'sale-estimates',
      untransformSalesOrder(data),
    )
    return transformSalesOrder(res)
  }
}
