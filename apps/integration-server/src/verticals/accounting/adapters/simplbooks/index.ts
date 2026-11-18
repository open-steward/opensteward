// ── Resource coverage ──────────────────────────────────────────────
// Unverified: journal      — SimplBooks API docs are behind authentication; cannot confirm a journal-entries endpoint exists.
// Unverified: order        — SimplBooks API docs are behind authentication; orders exist in the UI but no public docs confirm a REST endpoint.
// Unverified: purchaseorder — SimplBooks API docs are behind authentication; purchase orders exist in the UI but no public docs confirm a REST endpoint.
// Unverified: salesorder   — SimplBooks API docs are behind authentication; sales orders/offers exist in the UI but no public docs confirm a REST endpoint.

import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { TaxRate } from '../../schema/taxrate'
import type { Organization } from '../../schema/organization'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Expense } from '../../schema/expense'
import type { Transaction } from '../../schema/transaction'

import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefreshCredentials,
} from './auth'
import { SimplbooksClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type SimplbooksInvoice } from './transform/invoice'
import { transformBill, type SimplbooksBill } from './transform/bill'
import { transformContact, type SimplbooksContact } from './transform/contact'
import { transformAccount, type SimplbooksAccount } from './transform/account'
import { transformTaxRate, type SimplbooksTaxRate } from './transform/taxrate'
import { transformOrganization, type SimplbooksCompany } from './transform/organization'
import { transformCreditMemo, type SimplbooksCreditInvoice } from './transform/creditmemo'
import { transformExpense, type SimplbooksExpense } from './transform/expense'
import { transformTransaction, type SimplbooksTransaction } from './transform/transaction'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API key',
  helpText: 'Generate an API key in SimplBooks → Settings → API (Premium plan required).',
})

// SimplBooks paginated list envelope
interface SimplbooksListResponse<T> {
  data: T[]
  meta?: {
    current_page?: number
    last_page?: number
    per_page?: number
    total?: number
  }
}

export class SimplbooksAdapter implements AccountingAdapter {
  readonly platform = 'simplbooks'
  readonly version = '0.1.0'

  // Connect Link support — single API-key form
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

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
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
      ...(params.updatedAfter && {
        updated_after: params.updatedAfter.toISOString().split('T')[0],
      }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new SimplbooksClient(credentials)
    const res = await client.get<SimplbooksCompany>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new SimplbooksClient(credentials)
    const res = await client.get<SimplbooksListResponse<SimplbooksInvoice>>(
      'invoices',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new SimplbooksClient(credentials)
    const res = await client.get<SimplbooksInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new SimplbooksClient(credentials)
    const res = await client.post<SimplbooksInvoice>('invoices', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new SimplbooksClient(credentials)
    const res = await client.put<SimplbooksInvoice>(`invoices/${id}`, untransformInvoice(data))
    return transformInvoice(res)
  }

  // --- Bills (purchase invoices) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new SimplbooksClient(credentials)
    const res = await client.get<SimplbooksListResponse<SimplbooksBill>>(
      'purchase-invoices',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new SimplbooksClient(credentials)
    const res = await client.get<SimplbooksBill>(`purchase-invoices/${id}`)
    return transformBill(res)
  }

  // --- Contacts (clients + suppliers) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new SimplbooksClient(credentials)
    const res = await client.get<SimplbooksListResponse<SimplbooksContact>>(
      'clients',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new SimplbooksClient(credentials)
    const res = await client.get<SimplbooksContact>(`clients/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new SimplbooksClient(credentials)
    const type =
      data.isSupplier && !data.isCustomer
        ? 'supplier'
        : data.isCustomer && !data.isSupplier
          ? 'client'
          : 'both'
    const res = await client.post<SimplbooksContact>('clients', {
      name: data.name,
      vat_number: data.taxNumber,
      reg_code: data.identification,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      type,
      currency: data.currency,
      address: data.billingAddress?.address1,
      city: data.billingAddress?.city,
      postal_code: data.billingAddress?.postalCode,
      country: data.billingAddress?.country,
    })
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new SimplbooksClient(credentials)
    const res = await client.put<SimplbooksContact>(`clients/${id}`, {
      name: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      address: data.billingAddress?.address1,
      city: data.billingAddress?.city,
      postal_code: data.billingAddress?.postalCode,
      country: data.billingAddress?.country,
    })
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new SimplbooksClient(credentials)
    const res = await client.get<SimplbooksListResponse<SimplbooksAccount>>(
      'accounts',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new SimplbooksClient(credentials)
    const res = await client.get<SimplbooksAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new SimplbooksClient(credentials)
    const res = await client.get<SimplbooksListResponse<SimplbooksTaxRate>>(
      'tax-rates',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new SimplbooksClient(credentials)
    const res = await client.get<SimplbooksTaxRate>(`tax-rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Credit Memos (credit invoices) ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new SimplbooksClient(credentials)
    const res = await client.get<SimplbooksListResponse<SimplbooksCreditInvoice>>(
      'credit-invoices',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new SimplbooksClient(credentials)
    const res = await client.get<SimplbooksCreditInvoice>(`credit-invoices/${id}`)
    return transformCreditMemo(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new SimplbooksClient(credentials)
    const res = await client.get<SimplbooksListResponse<SimplbooksExpense>>(
      'expenses',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new SimplbooksClient(credentials)
    const res = await client.get<SimplbooksExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Transactions (bank/cash entries) ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new SimplbooksClient(credentials)
    const res = await client.get<SimplbooksListResponse<SimplbooksTransaction>>(
      'transactions',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new SimplbooksClient(credentials)
    const res = await client.get<SimplbooksTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }
}
