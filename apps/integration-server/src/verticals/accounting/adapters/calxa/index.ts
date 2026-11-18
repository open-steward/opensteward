/**
 * Calxa accounting adapter.
 *
 * Calxa is a financial reporting and budgeting platform for businesses and
 * not-for-profits. It reads data from connected accounting systems (Xero,
 * QuickBooks, MYOB, NetSuite, Sage Intacct, Acumatica, Business Central) and
 * exposes that data through a REST API authenticated with an API key sent in
 * the `X-Api-Key` header.
 *
 * Auth model: api_key — users obtain a key from Settings › API in their Calxa
 * account. There is no OAuth flow.
 *
 * Resources supported:
 *   - organization  (GET /entities/current)
 *   - accounts      (GET /accounts, GET /accounts/:id)
 *   - invoices      (GET /invoices, GET /invoices/:id)
 *   - bills         (GET /bills, GET /bills/:id)
 *   - contacts      (GET /contacts, GET /contacts/:id)
 *   - journals      (GET /journals, GET /journals/:id)
 *   - transactions  (GET /transactions, GET /transactions/:id)
 *   - taxRates      (GET /tax-rates, GET /tax-rates/:id)
 *
 * Calxa is a read-oriented reporting layer; write operations (create/update)
 * are not exposed and are intentionally omitted from this adapter.
 */

import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Organization } from '../../schema/organization'
import type { Account } from '../../schema/account'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Journal } from '../../schema/journal'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'

import { buildAuthUrl, exchangeCode, refreshCredentials as refreshCreds } from './auth'
import { CalxaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformOrganization, type CalxaEntity } from './transform/organization'
import { transformAccount, type CalxaAccount } from './transform/account'
import { transformInvoice, type CalxaInvoice } from './transform/invoice'
import { transformBill, type CalxaBill } from './transform/bill'
import { transformContact, type CalxaContact } from './transform/contact'
import { transformJournal, type CalxaJournal } from './transform/journal'
import { transformTransaction, type CalxaTransaction } from './transform/transaction'
import { transformTaxRate, type CalxaTaxRate } from './transform/taxrate'

const SIMPLE_API_KEY_FORM = simpleApiKey()

/** Generic paginated list response envelope from the Calxa API. */
interface CalxaListResponse<T> {
  data?: T[]
  items?: T[]
  results?: T[]
  totalCount?: number
  page?: number
  pageSize?: number
}

function extractList<T>(res: CalxaListResponse<T> | T[]): T[] {
  if (Array.isArray(res)) return res
  return res.data ?? res.items ?? res.results ?? []
}

export class CalxaAdapter implements AccountingAdapter {
  readonly platform = 'calxa'
  readonly version = '0.1.0'

  // Connect Link support — single API-key form.
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
    const client = new CalxaClient(credentials)
    const res = await client.get<CalxaEntity | { data: CalxaEntity }>('entities/current')
    const raw = (res as { data: CalxaEntity }).data ?? (res as CalxaEntity)
    return transformOrganization(raw)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new CalxaClient(credentials)
    const res = await client.get<CalxaListResponse<CalxaAccount> | CalxaAccount[]>(
      'accounts',
      this.paginationParams(params),
    )
    return extractList(res).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new CalxaClient(credentials)
    const res = await client.get<CalxaAccount | { data: CalxaAccount }>(`accounts/${id}`)
    const raw = (res as { data: CalxaAccount }).data ?? (res as CalxaAccount)
    return transformAccount(raw)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new CalxaClient(credentials)
    const res = await client.get<CalxaListResponse<CalxaInvoice> | CalxaInvoice[]>(
      'invoices',
      this.paginationParams(params),
    )
    return extractList(res).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new CalxaClient(credentials)
    const res = await client.get<CalxaInvoice | { data: CalxaInvoice }>(`invoices/${id}`)
    const raw = (res as { data: CalxaInvoice }).data ?? (res as CalxaInvoice)
    return transformInvoice(raw)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new CalxaClient(credentials)
    const res = await client.get<CalxaListResponse<CalxaBill> | CalxaBill[]>(
      'bills',
      this.paginationParams(params),
    )
    return extractList(res).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new CalxaClient(credentials)
    const res = await client.get<CalxaBill | { data: CalxaBill }>(`bills/${id}`)
    const raw = (res as { data: CalxaBill }).data ?? (res as CalxaBill)
    return transformBill(raw)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new CalxaClient(credentials)
    const res = await client.get<CalxaListResponse<CalxaContact> | CalxaContact[]>(
      'contacts',
      this.paginationParams(params),
    )
    return extractList(res).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new CalxaClient(credentials)
    const res = await client.get<CalxaContact | { data: CalxaContact }>(`contacts/${id}`)
    const raw = (res as { data: CalxaContact }).data ?? (res as CalxaContact)
    return transformContact(raw)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new CalxaClient(credentials)
    const res = await client.get<CalxaListResponse<CalxaJournal> | CalxaJournal[]>(
      'journals',
      this.paginationParams(params),
    )
    return extractList(res).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new CalxaClient(credentials)
    const res = await client.get<CalxaJournal | { data: CalxaJournal }>(`journals/${id}`)
    const raw = (res as { data: CalxaJournal }).data ?? (res as CalxaJournal)
    return transformJournal(raw)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new CalxaClient(credentials)
    const res = await client.get<CalxaListResponse<CalxaTransaction> | CalxaTransaction[]>(
      'transactions',
      this.paginationParams(params),
    )
    return extractList(res).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new CalxaClient(credentials)
    const res = await client.get<CalxaTransaction | { data: CalxaTransaction }>(
      `transactions/${id}`,
    )
    const raw = (res as { data: CalxaTransaction }).data ?? (res as CalxaTransaction)
    return transformTransaction(raw)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new CalxaClient(credentials)
    const res = await client.get<CalxaListResponse<CalxaTaxRate> | CalxaTaxRate[]>(
      'tax-rates',
      this.paginationParams(params),
    )
    return extractList(res).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new CalxaClient(credentials)
    const res = await client.get<CalxaTaxRate | { data: CalxaTaxRate }>(`tax-rates/${id}`)
    const raw = (res as { data: CalxaTaxRate }).data ?? (res as CalxaTaxRate)
    return transformTaxRate(raw)
  }
}
