/**
 * Reckon One accounting adapter (API v2).
 *
 * Resources implemented:
 *   - Organization (book)
 *   - Invoices
 *   - Bills (supplier purchases)
 *   - Contacts (customers + suppliers)
 *   - Accounts (chart of accounts)
 *   - Tax codes
 *   - Journals
 *   - Payments / transactions
 *   - Credit Notes (credit memos)
 *   - Expense Receipts (expenses)
 *
 * Auth: OAuth2 Authorization Code via identity.reckon.com.
 * Base: https://api.reckon.com/R1/{cashbookId}/
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unverified: order       — Reckon One API v2 Swagger spec is behind developer-partner auth;
 *                           no public documentation confirms a /orders REST endpoint and the
 *                           app has no generic order concept distinct from invoices.
 * Unverified: purchaseorder — App has a purchase order management UI feature, but no public
 *                           docs or third-party evidence confirms a /purchaseOrders API endpoint.
 * Unverified: salesorder  — No public documentation or third-party integration evidence
 *                           confirms a sales-order concept or REST endpoint in Reckon One API v2.
 */

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'
import type { TaxRate } from '../../schema/taxrate'
import type { Journal } from '../../schema/journal'
import type { Transaction } from '../../schema/transaction'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Expense } from '../../schema/expense'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { ReckonOneClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, RECKON_DEFAULT_SCOPES } from './constants'

import {
  transformInvoice,
  untransformInvoice,
  type ReckonOneInvoice,
} from './transform/invoice'
import {
  transformBill,
  type ReckonOneBill,
} from './transform/bill'
import {
  transformCustomer,
  transformSupplier,
  type ReckonOneCustomer,
  type ReckonOneSupplier,
} from './transform/contact'
import { transformAccount, type ReckonOneAccount } from './transform/account'
import { transformOrganization, type ReckonOneBook } from './transform/organization'
import { transformTaxRate, type ReckonOneTaxCode } from './transform/taxrate'
import { transformJournal, type ReckonOneJournalEntry } from './transform/journal'
import { transformTransaction, type ReckonOnePayment } from './transform/transaction'
import { transformCreditMemo, type ReckonOneCreditNote } from './transform/creditmemo'
import { transformExpense, type ReckonOneExpenseReceipt } from './transform/expense'

interface ReckonOneAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class ReckonOneAdapter implements AccountingAdapter {
  readonly platform = 'reckon-one'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ReckonOneAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? RECKON_DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    const creds = await refreshAccessToken(
      credentials.refreshToken,
      this.clientId,
      this.clientSecret,
    )
    creds.tenantId = credentials.tenantId
    return creds
  }

  // --- Organization (Book) ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new ReckonOneClient(credentials)
    // GET /R1/{cashbookId} returns the book record for the connected cashbook
    const res = await client.get<ReckonOneBook>('')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new ReckonOneClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const extra = params.updatedAfter
      ? { modifiedAfter: params.updatedAfter.toISOString() }
      : undefined
    const items = await client.list<ReckonOneInvoice>(
      'invoices',
      params.page ?? 1,
      pageSize,
      extra,
    )
    return items.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new ReckonOneClient(credentials)
    const res = await client.get<ReckonOneInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new ReckonOneClient(credentials)
    const res = await client.post<ReckonOneInvoice>('invoices', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new ReckonOneClient(credentials)
    const res = await client.put<ReckonOneInvoice>(`invoices/${id}`, {
      ...untransformInvoice(data),
      id,
    })
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new ReckonOneClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const extra = params.updatedAfter
      ? { modifiedAfter: params.updatedAfter.toISOString() }
      : undefined
    const items = await client.list<ReckonOneBill>(
      'bills',
      params.page ?? 1,
      pageSize,
      extra,
    )
    return items.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new ReckonOneClient(credentials)
    const res = await client.get<ReckonOneBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new ReckonOneClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const extra = params.updatedAfter
      ? { modifiedAfter: params.updatedAfter.toISOString() }
      : undefined

    const [customers, suppliers] = await Promise.all([
      client.list<ReckonOneCustomer>('customers', page, pageSize, extra),
      client.list<ReckonOneSupplier>('suppliers', page, pageSize, extra),
    ])

    return [
      ...customers.map(transformCustomer),
      ...suppliers.map(transformSupplier),
    ]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new ReckonOneClient(credentials)
    if (id.startsWith('cust_')) {
      const res = await client.get<ReckonOneCustomer>(`customers/${id.slice(5)}`)
      return transformCustomer(res)
    } else if (id.startsWith('supp_')) {
      const res = await client.get<ReckonOneSupplier>(`suppliers/${id.slice(5)}`)
      return transformSupplier(res)
    }
    throw new Error(`reckon-one: unrecognised contact id prefix — expected 'cust_' or 'supp_', got: ${JSON.stringify(id)}`)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new ReckonOneClient(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<ReckonOneSupplier>('suppliers', {
        name: data.name,
        firstName: data.firstName,
        lastName: data.lastName,
        companyName: data.companyName,
        emailAddress: data.emails?.[0]?.email,
        phoneNumber: data.telephones?.[0]?.telephone,
        taxNumber: data.taxNumber,
        billingAddress: data.billingAddress
          ? {
              street: data.billingAddress.address1,
              city: data.billingAddress.city,
              state: data.billingAddress.region,
              postCode: data.billingAddress.postalCode,
              country: data.billingAddress.country,
            }
          : undefined,
      })
      return transformSupplier(res)
    }
    const res = await client.post<ReckonOneCustomer>('customers', {
      name: data.name,
      firstName: data.firstName,
      lastName: data.lastName,
      companyName: data.companyName,
      emailAddress: data.emails?.[0]?.email,
      phoneNumber: data.telephones?.[0]?.telephone,
      taxNumber: data.taxNumber,
      currency: data.currency,
      billingAddress: data.billingAddress
        ? {
            street: data.billingAddress.address1,
            city: data.billingAddress.city,
            state: data.billingAddress.region,
            postCode: data.billingAddress.postalCode,
            country: data.billingAddress.country,
          }
        : undefined,
      shippingAddress: data.shippingAddress
        ? {
            street: data.shippingAddress.address1,
            city: data.shippingAddress.city,
            state: data.shippingAddress.region,
            postCode: data.shippingAddress.postalCode,
            country: data.shippingAddress.country,
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
    const client = new ReckonOneClient(credentials)
    if (id.startsWith('cust_')) {
      const res = await client.put<ReckonOneCustomer>(`customers/${id.slice(5)}`, {
        name: data.name,
        firstName: data.firstName,
        lastName: data.lastName,
        companyName: data.companyName,
        emailAddress: data.emails?.[0]?.email,
      })
      return transformCustomer(res)
    } else if (id.startsWith('supp_')) {
      const res = await client.put<ReckonOneSupplier>(`suppliers/${id.slice(5)}`, {
        name: data.name,
        firstName: data.firstName,
        lastName: data.lastName,
        companyName: data.companyName,
        emailAddress: data.emails?.[0]?.email,
      })
      return transformSupplier(res)
    }
    throw new Error(`reckon-one: unrecognised contact id prefix — expected 'cust_' or 'supp_', got: ${JSON.stringify(id)}`)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new ReckonOneClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const items = await client.list<ReckonOneAccount>(
      'accounts',
      params.page ?? 1,
      pageSize,
    )
    return items.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new ReckonOneClient(credentials)
    const res = await client.get<ReckonOneAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new ReckonOneClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const items = await client.list<ReckonOneTaxCode>(
      'taxCodes',
      params.page ?? 1,
      pageSize,
    )
    return items.map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new ReckonOneClient(credentials)
    const res = await client.get<ReckonOneTaxCode>(`taxCodes/${id}`)
    return transformTaxRate(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new ReckonOneClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const extra = params.updatedAfter
      ? { modifiedAfter: params.updatedAfter.toISOString() }
      : undefined
    const items = await client.list<ReckonOneJournalEntry>(
      'journals',
      params.page ?? 1,
      pageSize,
      extra,
    )
    return items.map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new ReckonOneClient(credentials)
    const res = await client.get<ReckonOneJournalEntry>(`journals/${id}`)
    return transformJournal(res)
  }

  // --- Transactions (payments) ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new ReckonOneClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const extra = params.updatedAfter
      ? { modifiedAfter: params.updatedAfter.toISOString() }
      : undefined
    const items = await client.list<ReckonOnePayment>(
      'payments',
      params.page ?? 1,
      pageSize,
      extra,
    )
    return items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new ReckonOneClient(credentials)
    const res = await client.get<ReckonOnePayment>(`payments/${id}`)
    return transformTransaction(res)
  }

  // --- Credit Memos (Credit Notes) ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new ReckonOneClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const extra = params.updatedAfter
      ? { modifiedAfter: params.updatedAfter.toISOString() }
      : undefined
    const items = await client.list<ReckonOneCreditNote>(
      'creditNotes',
      params.page ?? 1,
      pageSize,
      extra,
    )
    return items.map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new ReckonOneClient(credentials)
    const res = await client.get<ReckonOneCreditNote>(`creditNotes/${id}`)
    return transformCreditMemo(res)
  }

  // --- Expenses (Expense Receipts) ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new ReckonOneClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const extra = params.updatedAfter
      ? { modifiedAfter: params.updatedAfter.toISOString() }
      : undefined
    const items = await client.list<ReckonOneExpenseReceipt>(
      'expenseReceipts',
      params.page ?? 1,
      pageSize,
      extra,
    )
    return items.map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new ReckonOneClient(credentials)
    const res = await client.get<ReckonOneExpenseReceipt>(`expenseReceipts/${id}`)
    return transformExpense(res)
  }
}
