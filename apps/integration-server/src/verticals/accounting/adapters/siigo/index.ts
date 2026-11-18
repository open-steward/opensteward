/**
 * Siigo accounting adapter.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────────
 * Unavailable: account       — the official API Blueprint (specs/accounting-siigo.apib) has no `accounts` resource; a live unauthenticated probe of GET /v1/accounts and /v1/accounts/1 both return 404 "Resource not found"
 * Unavailable: organization  — the blueprint has no `companies` resource; a live probe of GET /v1/companies returns 404
 * Unavailable: order         — the blueprint's resource table (specs/accounting-siigo.apib L10-22) has no `orders`; a live probe of GET /v1/orders and /v1/orders/1 both return 404
 * Unavailable: salesorder    — the blueprint has no `sales-orders`; a live probe of GET /v1/sales-orders and /v1/sales-orders/1 both return 404
 * Unavailable: purchaseorder — the blueprint has no `purchase-orders`; a live probe of GET /v1/purchase-orders and /v1/purchase-orders/1 both return 404
 *
 * getTaxRate (`taxes/{id}`) was also removed: the blueprint documents only
 * `GET /v1/taxes` (L5675), no `/{id}` route, and a live probe of
 * `/v1/taxes/1` returns 404 — but `listTaxRates` (`GET /v1/taxes`) is
 * genuinely documented and stays, so `taxrate` is not declared fully
 * unavailable above (see adapter/interface.ts for why a per-method
 * declaration doesn't fit this file's per-resource metadata shape).
 *
 * deleteContact (`DELETE customers/{id}`) was removed too: it is
 * undocumented, and the live DELETE probe against it returned the same WAF
 * 400 HTML page as a DELETE against a *documented* route, so the probe
 * itself was inconclusive — it stays removed as unconfirmed rather than
 * assume it works. listContacts/getContact/createContact/updateContact are
 * all documented and stay.
 *
 * Left untouched by design (tracked separately under the
 * bill/transaction/expense "repoint" item #21): bill (`purchase-invoices`),
 * transaction (`transactions`) and getExpense (`expenses/{id}`) are also
 * undocumented 404 phantoms, same as the resources above, but their fix
 * belongs to a different, not-yet-filed change rather than this one.
 *
 * getJournal (`journals/{id}`) is undocumented too, but unlike the phantoms
 * above a live probe answers 401, not 404 — the route exists even though the
 * blueprint only documents `GET /v1/journals?document_id=`. The choice is
 * to keep it as-is or repoint it to the documented query form; this file keeps
 * it as-is, since the endpoint is confirmed reachable.
 */

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Journal } from '../../schema/journal'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'

import { buildAuthUrl, exchangeCode, signIn } from './auth'
import { SiigoClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type SiigoInvoice } from './transform/invoice'
import { transformBill, untransformBill, type SiigoBill } from './transform/bill'
import { transformContact, type SiigoContact } from './transform/contact'
import { transformJournal, untransformJournal, type SiigoJournal } from './transform/journal'
import { transformTaxRate, type SiigoTaxRate } from './transform/taxrate'
import { transformTransaction, type SiigoTransaction } from './transform/transaction'
import { transformExpense, untransformExpense, type SiigoExpense } from './transform/expense'
import {
  transformCreditMemo,
  untransformCreditMemo,
  type SiigoCreditMemo,
} from './transform/creditmemo'

interface SiigoAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri?: string
  scopes?: string[]
}

interface SiigoListResponse<T> {
  results: T[]
  pagination: { totalResults: number; page: number; pageSize: number }
}

export class SiigoAdapter implements AccountingAdapter {
  readonly platform = 'siigo'
  readonly version = '0.1.0'

  private username: string
  private accessKey: string

  constructor(config: SiigoAdapterConfig) {
    this.username = config.clientId
    this.accessKey = config.clientSecret
  }

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // code format: "username:access_key"
    return exchangeCode(code)
  }

  async refreshCredentials(_credentials: Credentials): Promise<Credentials> {
    // Siigo has no refresh token — re-authenticate with stored credentials
    return signIn(this.username, this.accessKey)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      page_size: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
      ...(params.updatedAfter && {
        updated_after: params.updatedAfter.toISOString(),
      }),
    }
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new SiigoClient(credentials)
    const res = await client.get<SiigoListResponse<SiigoInvoice>>(
      'invoices',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new SiigoClient(credentials)
    const res = await client.get<SiigoInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new SiigoClient(credentials)
    const res = await client.post<SiigoInvoice>('invoices', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new SiigoClient(credentials)
    const res = await client.put<SiigoInvoice>(`invoices/${id}`, untransformInvoice(data))
    return transformInvoice(res)
  }

  async deleteInvoice(credentials: Credentials, id: string): Promise<void> {
    const client = new SiigoClient(credentials)
    await client.delete(`invoices/${id}`)
  }

  // --- Bills ---
  // Phantom (404 live), left to the repoint item #21 — see file header.

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new SiigoClient(credentials)
    const res = await client.get<SiigoListResponse<SiigoBill>>(
      'purchase-invoices',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new SiigoClient(credentials)
    const res = await client.get<SiigoBill>(`purchase-invoices/${id}`)
    return transformBill(res)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new SiigoClient(credentials)
    const res = await client.post<SiigoBill>('purchase-invoices', untransformBill(data))
    return transformBill(res)
  }

  async updateBill(credentials: Credentials, id: string, data: Partial<Bill>): Promise<Bill> {
    const client = new SiigoClient(credentials)
    const res = await client.put<SiigoBill>(`purchase-invoices/${id}`, untransformBill(data))
    return transformBill(res)
  }

  async deleteBill(credentials: Credentials, id: string): Promise<void> {
    const client = new SiigoClient(credentials)
    await client.delete(`purchase-invoices/${id}`)
  }

  // --- Contacts ---
  // deleteContact removed: undocumented, and its live DELETE probe was
  // inconclusive (same WAF 400 HTML page a documented route's DELETE probe
  // also returned) rather than a clean confirm/deny.

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new SiigoClient(credentials)
    const res = await client.get<SiigoListResponse<SiigoContact>>(
      'customers',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new SiigoClient(credentials)
    const res = await client.get<SiigoContact>(`customers/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new SiigoClient(credentials)
    const res = await client.post<SiigoContact>('customers', {
      name: data.name,
      identification: data.identification,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      currency: data.currency,
      address: data.billingAddress?.address1,
      city: data.billingAddress?.city,
      state: data.billingAddress?.region,
      postalCode: data.billingAddress?.postalCode,
      country: data.billingAddress?.country,
    })
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new SiigoClient(credentials)
    const res = await client.put<SiigoContact>(`customers/${id}`, {
      name: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      address: data.billingAddress?.address1,
      city: data.billingAddress?.city,
      state: data.billingAddress?.region,
      postalCode: data.billingAddress?.postalCode,
      country: data.billingAddress?.country,
    })
    return transformContact(res)
  }

  // --- Journals ---
  // getJournal is undocumented but confirmed reachable (live probe: 401, not
  // 404) — kept as-is. See file header.

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new SiigoClient(credentials)
    const res = await client.get<SiigoListResponse<SiigoJournal>>(
      'journals',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new SiigoClient(credentials)
    const res = await client.get<SiigoJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new SiigoClient(credentials)
    const res = await client.post<SiigoJournal>('journals', untransformJournal(data))
    return transformJournal(res)
  }

  // --- Transactions ---
  // Phantom (404 live), left to the repoint item #21 — see file header.

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const client = new SiigoClient(credentials)
    const res = await client.get<SiigoListResponse<SiigoTransaction>>(
      'transactions',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new SiigoClient(credentials)
    const res = await client.get<SiigoTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---
  // getTaxRate removed: the blueprint documents only `GET /v1/taxes`
  // (no `/{id}`), and a live probe of `taxes/1` returns 404. listTaxRates
  // (`GET /v1/taxes`) is genuinely documented and stays.

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new SiigoClient(credentials)
    const res = await client.get<SiigoListResponse<SiigoTaxRate>>(
      'taxes',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformTaxRate)
  }

  // --- Expenses ---
  // getExpense is a phantom (404 live) too, left to the repoint item #21 —
  // see file header. listExpenses/createExpense are untouched.

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new SiigoClient(credentials)
    const res = await client.get<SiigoListResponse<SiigoExpense>>(
      'expenses',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new SiigoClient(credentials)
    const res = await client.get<SiigoExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new SiigoClient(credentials)
    const res = await client.post<SiigoExpense>('expenses', untransformExpense(data))
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<CreditMemo[]> {
    const client = new SiigoClient(credentials)
    const res = await client.get<SiigoListResponse<SiigoCreditMemo>>(
      'credit-notes',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new SiigoClient(credentials)
    const res = await client.get<SiigoCreditMemo>(`credit-notes/${id}`)
    return transformCreditMemo(res)
  }

  async createCreditMemo(
    credentials: Credentials,
    data: Partial<CreditMemo>,
  ): Promise<CreditMemo> {
    const client = new SiigoClient(credentials)
    const res = await client.post<SiigoCreditMemo>('credit-notes', untransformCreditMemo(data))
    return transformCreditMemo(res)
  }
}
