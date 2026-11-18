import { toCalendarDate } from '../shared/transform'
/**
 * Campfire accounting adapter.
 *
 * Auth: static API key — `Authorization: Token <api_key>`
 * Base URL: https://api.meetcampfire.com/coa/api
 * Pagination: limit / offset; response envelope: { count, next, previous, results[] }
 *
 * Docs: https://docs.campfire.ai
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: expense      — Campfire has no expense/receipt tracking endpoint
// Unavailable: order        — Campfire has no generic order endpoint
// Unavailable: purchaseorder — Campfire has no purchase order endpoint
// Unavailable: salesorder   — Campfire has no sales order endpoint
// Unavailable: taxrate      — Campfire has no tax rate endpoint

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Organization } from '../../schema/organization'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Transaction } from '../../schema/transaction'

import { CampfireClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type CampfireInvoice } from './transform/invoice'
import { transformBill, type CampfireBill } from './transform/bill'
import { transformVendor, type CampfireVendor } from './transform/contact'
import { transformAccount, type CampfireChartAccount } from './transform/account'
import { transformJournal, untransformJournal, type CampfireJournalEntry } from './transform/journal'
import { transformOrganization, type CampfireEntity } from './transform/organization'
import { transformCreditMemo, type CampfireCreditMemo } from './transform/creditmemo'
import { transformTransaction, type CampfireTransaction } from './transform/transaction'

interface CampfireAdapterConfig {
  apiKey: string
}

// Generic paginated response envelope used by Campfire list endpoints
interface CampfirePage<T> {
  count?: number
  next?: string | null
  previous?: string | null
  results: T[]
}

export class CampfireAdapter implements AccountingAdapter {
  readonly platform = 'campfire'
  readonly version = '0.1.0'

  private apiKey: string

  constructor(config: CampfireAdapterConfig) {
    this.apiKey = config.apiKey
  }

  // Campfire uses static API keys — no OAuth flow
  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('Campfire uses API key auth; OAuth flow is not applicable.')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Campfire uses API key auth; code exchange is not applicable.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static API keys do not expire
    return credentials
  }

  private credentials(): Credentials {
    return { accessToken: this.apiKey }
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      offset: params.page !== undefined ? (params.page - 1) * (params.limit ?? DEFAULT_PAGE_SIZE) : 0,
      ...(params.updatedAfter && {
        last_modified_at__gte: params.updatedAfter.toISOString(),
      }),
    }
  }

  // --- Organization (first entity) ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new CampfireClient(credentials)
    const res = await client.get<CampfirePage<CampfireEntity>>('/entity', { limit: 1, offset: 0 })
    const entity = res.results[0]
    if (!entity) throw new Error('No Campfire entity found.')
    return transformOrganization(entity)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new CampfireClient(credentials)
    const res = await client.get<CampfirePage<CampfireInvoice>>(
      '/v1/invoice',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new CampfireClient(credentials)
    const raw = await client.get<CampfireInvoice>(`/v1/invoice/${id}/`)
    return transformInvoice(raw)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new CampfireClient(credentials)
    const raw = await client.post<CampfireInvoice>('/v1/invoice/', untransformInvoice(data))
    return transformInvoice(raw)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new CampfireClient(credentials)
    const raw = await client.patch<CampfireInvoice>(`/v1/invoice/${id}/`, untransformInvoice(data))
    return transformInvoice(raw)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new CampfireClient(credentials)
    const res = await client.get<CampfirePage<CampfireBill>>(
      '/v1/bill',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new CampfireClient(credentials)
    const raw = await client.get<CampfireBill>(`/v1/bill/${id}/`)
    return transformBill(raw)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new CampfireClient(credentials)
    // Canonical amounts are integer minor units; Campfire expects decimal dollars → divide by 100.
    const body: Record<string, unknown> = {
      bill_number: data.billNumber,
      bill_date: toCalendarDate(data.postedAt),
      due_date: toCalendarDate(data.dueAt),
      currency: data.currency,
      vendor: data.contactId ? Number(data.contactId) : undefined,
      lines: data.lineItems?.map((li) => ({
        account: li.accountId ? Number(li.accountId) : undefined,
        amount: li.totalAmount != null ? li.totalAmount / 100 : undefined,
        description: li.itemDescription,
        tax: li.taxAmount != null ? li.taxAmount / 100 : undefined,
      })),
    }
    const raw = await client.post<CampfireBill>('/v1/bill/', body)
    return transformBill(raw)
  }

  // --- Contacts (Vendors — includes customers and vendors) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new CampfireClient(credentials)
    const res = await client.get<CampfirePage<CampfireVendor>>(
      '/vendor',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformVendor)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new CampfireClient(credentials)
    const raw = await client.get<CampfireVendor>(`/vendor/${id}/`)
    return transformVendor(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new CampfireClient(credentials)
    const body: Record<string, unknown> = {
      name: data.name,
      first_name: data.firstName,
      last_name: data.lastName,
      company_name: data.companyName,
      email: data.emails?.[0]?.email,
      phone_number: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
      mobile_number: data.telephones?.find((t) => t.type === 'MOBILE')?.telephone,
      vat_number: data.taxNumber,
      business_id_ssn: data.identification,
      vendor_type: data.isCustomer ? 'customer' : 'vendor',
      billing_address_street_1: data.billingAddress?.address1,
      billing_address_street_2: data.billingAddress?.address2,
      billing_city: data.billingAddress?.city,
      billing_state: data.billingAddress?.region,
      billing_zip_code: data.billingAddress?.postalCode,
      billing_country: data.billingAddress?.country,
      address_street_1: data.shippingAddress?.address1,
      address_street_2: data.shippingAddress?.address2,
      city: data.shippingAddress?.city,
      state: data.shippingAddress?.region,
      zip_code: data.shippingAddress?.postalCode,
      country: data.shippingAddress?.country,
    }
    const raw = await client.post<CampfireVendor>('/vendor/', body)
    return transformVendor(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new CampfireClient(credentials)
    const body: Record<string, unknown> = {
      name: data.name,
      first_name: data.firstName,
      last_name: data.lastName,
      company_name: data.companyName,
      email: data.emails?.[0]?.email,
      phone_number: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
      mobile_number: data.telephones?.find((t) => t.type === 'MOBILE')?.telephone,
      vat_number: data.taxNumber,
      billing_address_street_1: data.billingAddress?.address1,
      billing_address_street_2: data.billingAddress?.address2,
      billing_city: data.billingAddress?.city,
      billing_state: data.billingAddress?.region,
      billing_zip_code: data.billingAddress?.postalCode,
      billing_country: data.billingAddress?.country,
    }
    const raw = await client.patch<CampfireVendor>(`/vendor/${id}/`, body)
    return transformVendor(raw)
  }

  // --- Accounts (Chart of Accounts) ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new CampfireClient(credentials)
    // Campfire chart-of-accounts endpoint is /account (not /chart_accounts)
    // Ref: GET /coa/api/account — https://docs.campfire.ai/llms-full.txt
    const res = await client.get<CampfirePage<CampfireChartAccount>>(
      '/account',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new CampfireClient(credentials)
    const raw = await client.get<CampfireChartAccount>(`/account/${id}/`)
    return transformAccount(raw)
  }

  // --- Journal Entries ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new CampfireClient(credentials)
    const res = await client.get<CampfirePage<CampfireJournalEntry>>(
      '/journal_entry',
      {
        ...this.paginationParams(params),
        ...(params.updatedAfter && { all_time: true }),
      },
    )
    return (res.results ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new CampfireClient(credentials)
    const raw = await client.get<CampfireJournalEntry>(`/journal_entry/${id}/`)
    return transformJournal(raw)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new CampfireClient(credentials)
    // Campfire journal write endpoint matches the read endpoint: /journal_entry/
    // Ref: POST /coa/api/journal_entry — https://docs.campfire.ai/llms-full.txt
    const raw = await client.post<CampfireJournalEntry>('/journal_entry/', untransformJournal(data))
    return transformJournal(raw)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new CampfireClient(credentials)
    const res = await client.get<CampfirePage<CampfireCreditMemo>>(
      '/v1/credit-memo',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new CampfireClient(credentials)
    const raw = await client.get<CampfireCreditMemo>(`/v1/credit-memo/${id}`)
    return transformCreditMemo(raw)
  }

  // --- Transactions (GL/chart transactions) ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new CampfireClient(credentials)
    const res = await client.get<CampfirePage<CampfireTransaction>>(
      '/transaction',
      this.paginationParams(params),
    )
    return (res.results ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new CampfireClient(credentials)
    const raw = await client.get<CampfireTransaction>(`/transaction/${id}`)
    return transformTransaction(raw)
  }
}
