import { toCalendarDate } from '../shared/transform'
/**
 * Bill4Time accounting adapter.
 *
 * Authentication: API key embedded in the URL path (no OAuth).
 * Base URL: https://secure.bill4time.com/b4t-api/{ApiKey}/v2/
 * Pagination: OData-style $top / $skip query parameters.
 *
 * Supported resources: invoices, contacts (clients), expenses,
 *   transactions (payments), accounts (bank accounts), organization (firm).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: bill         — Bill4Time is a legal time-billing platform with no AP/vendor-bill concept; no /bills endpoint exists in the v2 API.
 * Unavailable: creditmemo   — Bill4Time does not support credit memos; no credit-memo endpoint exists in the v2 API.
 * Unavailable: journal      — Bill4Time does not expose general-ledger journal entries; no /journals endpoint exists in the v2 API.
 * Unavailable: order        — Bill4Time has no order management concept; no /orders endpoint exists in the v2 API.
 * Unavailable: purchaseorder — Bill4Time has no purchase-order concept; no /purchaseorders endpoint exists in the v2 API.
 * Unavailable: salesorder   — Bill4Time has no sales-order concept; no /salesorders endpoint exists in the v2 API.
 * Unavailable: taxrate      — Bill4Time does not expose a tax-rate catalogue via its API; no /taxrates endpoint exists in the v2 API.
 */
import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Expense } from '../../schema/expense'
import type { Transaction } from '../../schema/transaction'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshCredentials as refreshCreds } from './auth'
import { Bill4TimeClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type Bill4TimeInvoice } from './transform/invoice'
import { transformClient, type Bill4TimeClient as Bill4TimeClientModel } from './transform/contact'
import { transformExpense, type Bill4TimeExpense } from './transform/expense'
import { transformTransaction, type Bill4TimePayment } from './transform/transaction'
import { transformAccount, type Bill4TimeBankAccount } from './transform/account'
import { transformOrganization, type Bill4TimeFirm } from './transform/organization'

// ── Connect Link credential form (single API key) ─────────────────────────────
const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'Bill4Time API key',
  placeholder: 'Enter your Bill4Time API key',
  helpText: 'Create an API key from Settings → API in your Bill4Time account.',
})

export class Bill4timeAdapter implements AccountingAdapter {
  // Connect Link support — single API-key form
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'bill4time'
  readonly version = '0.1.0'

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCreds(credentials)
  }

  /** OData-style pagination params used by all list routes. */
  private odataParams(params: QueryParams): Record<string, unknown> {
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const skip = (page - 1) * top
    const out: Record<string, unknown> = { $top: top, $skip: skip }
    if (params.updatedAfter) {
      // OData $filter date comparison
      out['$filter'] = `UpdatedDate ge ${params.updatedAfter.toISOString()}`
    }
    return out
  }

  // ── Organization ───────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new Bill4TimeClient(credentials)
    // Bill4Time exposes firm/account settings at /firmsettings or /users/me
    const raw = await client.get<Bill4TimeFirm>('firmsettings')
    return transformOrganization(raw)
  }

  // ── Invoices ───────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new Bill4TimeClient(credentials)
    const res = await client.get<Bill4TimeInvoice[]>('invoices', this.odataParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new Bill4TimeClient(credentials)
    const raw = await client.get<Bill4TimeInvoice>(`invoices/${id}`)
    return transformInvoice(raw)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new Bill4TimeClient(credentials)
    const raw = await client.post<Bill4TimeInvoice>('invoices', untransformInvoice(data))
    return transformInvoice(raw)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new Bill4TimeClient(credentials)
    const raw = await client.put<Bill4TimeInvoice>(`invoices/${id}`, untransformInvoice(data))
    return transformInvoice(raw)
  }

  // ── Contacts (Clients) ─────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new Bill4TimeClient(credentials)
    const res = await client.get<Bill4TimeClientModel[]>('clients', this.odataParams(params))
    return (res ?? []).map(transformClient)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new Bill4TimeClient(credentials)
    const raw = await client.get<Bill4TimeClientModel>(`clients/${id}`)
    return transformClient(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new Bill4TimeClient(credentials)
    const raw = await client.post<Bill4TimeClientModel>('clients', {
      FirstName: data.firstName,
      LastName: data.lastName,
      CompanyName: data.companyName ?? data.name,
      Email: data.emails?.[0]?.email,
      Phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
      MobilePhone: data.telephones?.find((t) => t.type === 'MOBILE')?.telephone,
      Address: data.billingAddress?.address1,
      Address2: data.billingAddress?.address2,
      City: data.billingAddress?.city,
      State: data.billingAddress?.region,
      Zip: data.billingAddress?.postalCode,
      Country: data.billingAddress?.country,
      Currency: data.currency,
    })
    return transformClient(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new Bill4TimeClient(credentials)
    const raw = await client.put<Bill4TimeClientModel>(`clients/${id}`, {
      FirstName: data.firstName,
      LastName: data.lastName,
      CompanyName: data.companyName ?? data.name,
      Email: data.emails?.[0]?.email,
      Phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
      Address: data.billingAddress?.address1,
      Address2: data.billingAddress?.address2,
      City: data.billingAddress?.city,
      State: data.billingAddress?.region,
      Zip: data.billingAddress?.postalCode,
      Country: data.billingAddress?.country,
    })
    return transformClient(raw)
  }

  // ── Accounts (Bank Accounts) ───────────────────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new Bill4TimeClient(credentials)
    const res = await client.get<Bill4TimeBankAccount[]>(
      'bankaccounts',
      this.odataParams(params),
    )
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new Bill4TimeClient(credentials)
    const raw = await client.get<Bill4TimeBankAccount>(`bankaccounts/${id}`)
    return transformAccount(raw)
  }

  // ── Expenses ───────────────────────────────────────────────────────────────

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new Bill4TimeClient(credentials)
    const res = await client.get<Bill4TimeExpense[]>('expenses', this.odataParams(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new Bill4TimeClient(credentials)
    const raw = await client.get<Bill4TimeExpense>(`expenses/${id}`)
    return transformExpense(raw)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new Bill4TimeClient(credentials)
    const raw = await client.post<Bill4TimeExpense>('expenses', {
      ClientID: data.contactId,
      UserID: data.userId,
      Description: data.name,
      Amount: data.totalAmount,
      TaxAmount: data.taxAmount,
      Currency: data.currency,
      ExpenseDate: toCalendarDate(data.postedAt),
    })
    return transformExpense(raw)
  }

  // ── Transactions (Payments) ────────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new Bill4TimeClient(credentials)
    const res = await client.get<Bill4TimePayment[]>('payments', this.odataParams(params))
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new Bill4TimeClient(credentials)
    const raw = await client.get<Bill4TimePayment>(`payments/${id}`)
    return transformTransaction(raw)
  }
}
