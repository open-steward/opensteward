import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { TaxRate } from '../../schema/taxrate'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'

import { exchangeCode, refreshCredentials } from './auth'
import { InfaktClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type InfaktInvoice } from './transform/invoice'
import { transformContact, untransformContact, type InfaktClient as InfaktClientEntity } from './transform/contact'
import { transformExpense, type InfaktCost } from './transform/expense'
import { getBuiltinTaxRates } from './transform/taxrate'
import {
  transformCreditMemo,
  type InfaktCorrectiveInvoice,
} from './transform/creditmemo'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: account      — inFakt has no chart-of-accounts; bank_accounts endpoint ≠ ledger accounts
// Unavailable: bill         — inFakt is a sales-side platform; no supplier bill concept or endpoint
// Unavailable: journal      — no double-entry journal endpoint; /books.json is a tax revenue/expense book, not a journal
// Unavailable: order        — no order endpoint in inFakt API v3
// Unavailable: purchaseorder — no purchase-order endpoint in inFakt API v3
// Unavailable: salesorder   — no sales-order endpoint in inFakt API v3
// Unavailable: transaction  — no dedicated transaction/payment resource; marking paid is an invoice action
// Unverified:  organization — /account/details.json endpoint confirmed in docs but response field names not publicly documented

/**
 * inFakt Accounting Adapter
 *
 * Auth: static API key passed via X-inFakt-ApiKey header.
 * API v3 base: https://api.infakt.pl/api/v3
 *
 * Supported resources:
 *   - Invoices (CRUD)
 *   - Contacts / Clients (CRUD)
 *   - Expenses / Costs (list + get)
 *   - Tax Rates (built-in Polish VAT symbols; no live endpoint)
 *   - Credit Memos (list + get via /corrective_invoices.json)
 */

interface InfaktAdapterConfig {
  /** Static inFakt API key */
  apiKey: string
}

/** inFakt pagination envelope */
interface InfaktMetainfo {
  count: number
  total_count: number
  next: string | null
  previous: string | null
}

interface InfaktListResponse<T> {
  metainfo: InfaktMetainfo
  entities: T[]
}

export class InfaktAdapter implements AccountingAdapter {
  readonly platform = 'infakt'
  readonly version = '0.1.0'

  private apiKey: string

  constructor(config: InfaktAdapterConfig) {
    this.apiKey = config.apiKey
  }

  /** API key auth — no OAuth URL needed */
  getAuthUrl(_state: string): string {
    return 'https://app.infakt.pl/account/settings'
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  private credentials(): Credentials {
    return { accessToken: this.apiKey }
  }

  private paginationParams(
    params: QueryParams,
    dateFilterKey = 'q[invoice_date_gteq]',
  ): Record<string, unknown> {
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const offset = (page - 1) * limit
    const result: Record<string, unknown> = { limit, offset }
    if (params.updatedAfter) {
      result[dateFilterKey] = params.updatedAfter.toISOString().split('T')[0]
    }
    return result
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new InfaktClient(credentials)
    const res = await client.get<InfaktListResponse<InfaktInvoice>>(
      'invoices.json',
      this.paginationParams(params),
    )
    return (res.entities ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new InfaktClient(credentials)
    const raw = await client.get<InfaktInvoice>(`invoices/${id}.json`)
    return transformInvoice(raw)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new InfaktClient(credentials)
    // inFakt async create: POST /async/invoices.json returns a task reference.
    // For simplicity we use the synchronous endpoint which drafts the invoice.
    const raw = await client.post<InfaktInvoice>('invoices.json', {
      invoice: untransformInvoice(data),
    })
    return transformInvoice(raw)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new InfaktClient(credentials)
    const raw = await client.put<InfaktInvoice>(`invoices/${id}.json`, {
      invoice: untransformInvoice(data),
    })
    return transformInvoice(raw)
  }

  async deleteInvoice(credentials: Credentials, id: string): Promise<void> {
    const client = new InfaktClient(credentials)
    await client.delete(`invoices/${id}.json`)
  }

  // --- Contacts (Clients) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new InfaktClient(credentials)
    const res = await client.get<InfaktListResponse<InfaktClientEntity>>(
      'clients.json',
      this.paginationParams(params),
    )
    return (res.entities ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new InfaktClient(credentials)
    const raw = await client.get<InfaktClientEntity>(`clients/${id}.json`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new InfaktClient(credentials)
    const raw = await client.post<InfaktClientEntity>('clients.json', {
      client: untransformContact(data),
    })
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new InfaktClient(credentials)
    const raw = await client.put<InfaktClientEntity>(`clients/${id}.json`, {
      client: untransformContact(data),
    })
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    const client = new InfaktClient(credentials)
    await client.delete(`clients/${id}.json`)
  }

  // --- Expenses (Costs) ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new InfaktClient(credentials)
    const res = await client.get<InfaktListResponse<InfaktCost>>(
      'documents/costs.json',
      this.paginationParams(params, 'q[issue_date_gteq]'),
    )
    return (res.entities ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new InfaktClient(credentials)
    const raw = await client.get<InfaktCost>(`documents/costs/${id}.json`)
    return transformExpense(raw)
  }

  // --- Tax Rates ---
  // inFakt does not expose a /tax_rates endpoint; Polish VAT symbols are fixed.

  async listTaxRates(_credentials: Credentials, _params: QueryParams): Promise<TaxRate[]> {
    return getBuiltinTaxRates()
  }

  async getTaxRate(_credentials: Credentials, id: string): Promise<TaxRate> {
    const rates = getBuiltinTaxRates()
    const found = rates.find((r) => r.id === id)
    if (!found) throw new Error(`inFakt: unknown tax rate symbol '${id}'`)
    return found
  }

  // --- Credit Memos (Corrective Invoices) ---
  // inFakt "faktury korygujące" (corrective invoices) are the Polish-law
  // equivalent of credit memos. Endpoint: /corrective_invoices.json

  async listCreditMemos(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<CreditMemo[]> {
    const client = new InfaktClient(credentials)
    const res = await client.get<InfaktListResponse<InfaktCorrectiveInvoice>>(
      'corrective_invoices.json',
      this.paginationParams(params),
    )
    return (res.entities ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new InfaktClient(credentials)
    const raw = await client.get<InfaktCorrectiveInvoice>(
      `corrective_invoices/${id}.json`,
    )
    return transformCreditMemo(raw)
  }
}
