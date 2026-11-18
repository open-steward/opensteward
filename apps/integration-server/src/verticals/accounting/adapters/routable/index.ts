import { toCalendarDate } from '../shared/transform'
/**
 * RoutableAdapter — OpenSteward accounting adapter for Routable.
 *
 * Routable is an AP/AR automation platform. It exposes:
 *   - Payables  (→ canonical Bill)        GET/POST/PATCH /v1/payables
 *   - Receivables (→ canonical Invoice)   GET/POST       /v1/receivables
 *   - Companies  (→ canonical Contact)    GET/POST/PATCH /v1/companies
 *   - Accounts  (→ canonical Account)     GET            /v1/settings/accounts
 *
 * Auth: Bearer API token (no OAuth2). Users generate tokens from the Routable
 * Dashboard. The `simpleApiKey` helper wires up the Connect-Link form.
 *
 * Docs: https://developers.routable.com/reference/introduction
 */
// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: creditmemo   — Routable has no credit memo concept; it is an AP/AR automation platform, not a full accounting system
// Unavailable: expense      — No expense management feature in the Routable API
// Unavailable: journal      — No journal entry endpoints in the Routable API
// Unavailable: order        — No order concept in the Routable API
// Unavailable: purchaseorder — No purchase order endpoints; payables (Bills) serve the AP role
// Unavailable: salesorder   — No sales order endpoints; receivables (Invoices) serve the AR role
// Unavailable: taxrate      — Tax codes are available only via the /v1/accounting-software/objects proxy which requires a connected third-party accounting system (QuickBooks, Xero, etc.), not a native Routable resource
// Unavailable: transaction  — No queryable transaction listing endpoint; payment events are delivered via webhooks only
import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Organization } from '../../schema/organization'
import type { Account } from '../../schema/account'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefreshCredentials,
} from './auth'
import { RoutableClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type RoutableReceivable } from './transform/invoice'
import { transformBill, type RoutablePayable } from './transform/bill'
import { transformCompany, type RoutableCompany } from './transform/contact'
import { transformOrganization, type RoutableWorkspace } from './transform/organization'
import { transformAccount, type RoutableAccount } from './transform/account'
import { routableWebhook } from './webhook'

// ── simpleApiKey wiring ───────────────────────────────────────────────────────

const SIMPLE_API_KEY_FORM = simpleApiKey()

// ── Routable list response envelope ──────────────────────────────────────────

interface RoutableListResponse<T> {
  results: T[]
  links?: {
    next?: string | null
    previous?: string | null
    self?: string
  }
  count?: number
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class RoutableAdapter implements AccountingAdapter {
  readonly platform = 'routable'
  readonly version = '0.1.0'

  // Connect-Link support — single API-key form
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  // --- Webhooks ---

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return routableWebhook.verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return routableWebhook.parseWebhookEvents(payload)
  }

  private pagination(params: QueryParams): Record<string, unknown> {
    return {
      page_size: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
      ...(params.updatedAfter && {
        'created_at.gte': params.updatedAfter.toISOString(),
      }),
    }
  }

  // --- Organization (workspace) ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    // Routable exposes workspace settings at /v1/workspace (undocumented but
    // available) or the user can be fetched at /v1/team-members/me. We attempt
    // workspace first and fall back to an empty object so the transform is safe.
    const client = new RoutableClient(credentials)
    try {
      const res = await client.get<RoutableWorkspace>('workspace')
      return transformOrganization(res)
    } catch {
      return transformOrganization({})
    }
  }

  // --- Invoices (Receivables) ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new RoutableClient(credentials)
    const res = await client.get<RoutableListResponse<RoutableReceivable>>(
      'receivables',
      this.pagination(params),
    )
    return (res.results ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new RoutableClient(credentials)
    const res = await client.get<RoutableReceivable>(`receivables/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new RoutableClient(credentials)
    const body: Record<string, unknown> = {
      type: 'external',
      currency_code: data.currency,
      bill_number: data.invoiceNumber,
      reference: data.reference,
      due_on: toCalendarDate(data.dueAt),
      issued_on: toCalendarDate(data.postedAt),
      ...(data.contactId && { due_from_company: data.contactId }),
      ...(data.notes && { message: data.notes }),
      line_items: (data.lineItems ?? []).map((li) => ({
        description: li.itemDescription,
        amount: li.totalAmount != null ? (li.totalAmount / 100).toFixed(2) : undefined,
        quantity: li.unitQuantity,
        unit_price: li.unitAmount != null ? (li.unitAmount / 100).toFixed(2) : undefined,
      })),
    }
    const res = await client.post<RoutableReceivable>('receivables', body)
    return transformInvoice(res)
  }

  // --- Bills (Payables) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new RoutableClient(credentials)
    const res = await client.get<RoutableListResponse<RoutablePayable>>(
      'payables',
      this.pagination(params),
    )
    return (res.results ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new RoutableClient(credentials)
    const res = await client.get<RoutablePayable>(`payables/${id}`)
    return transformBill(res)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new RoutableClient(credentials)
    const body: Record<string, unknown> = {
      type: 'vendor_choice',
      currency_code: data.currency,
      bill_number: data.billNumber,
      due_on: toCalendarDate(data.dueAt),
      issued_on: toCalendarDate(data.postedAt),
      ...(data.contactId && { company: data.contactId }),
      ...(data.notes && { message: data.notes }),
      line_items: (data.lineItems ?? []).map((li) => ({
        description: li.itemDescription,
        amount: li.totalAmount != null ? (li.totalAmount / 100).toFixed(2) : undefined,
        quantity: li.unitQuantity,
        unit_price: li.unitAmount != null ? (li.unitAmount / 100).toFixed(2) : undefined,
      })),
    }
    const res = await client.post<RoutablePayable>('payables', body)
    return transformBill(res)
  }

  // --- Contacts (Companies) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new RoutableClient(credentials)
    const res = await client.get<RoutableListResponse<RoutableCompany>>(
      'companies',
      this.pagination(params),
    )
    return (res.results ?? []).map(transformCompany)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new RoutableClient(credentials)
    const res = await client.get<RoutableCompany>(`companies/${id}`)
    return transformCompany(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new RoutableClient(credentials)
    const isPersonal = !data.companyName && (data.firstName || data.lastName)
    const body: Record<string, unknown> = isPersonal
      ? {
          type: 'personal',
          first_name: data.firstName,
          last_name: data.lastName,
          email: data.emails?.[0]?.email,
        }
      : {
          type: 'business',
          business_name: data.companyName ?? data.name,
          display_name: data.name,
          email: data.emails?.[0]?.email,
        }
    const res = await client.post<RoutableCompany>('companies', body)
    return transformCompany(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new RoutableClient(credentials)
    const body: Record<string, unknown> = {
      ...(data.name && { display_name: data.name }),
      ...(data.companyName && { business_name: data.companyName }),
      ...(data.firstName && { first_name: data.firstName }),
      ...(data.lastName && { last_name: data.lastName }),
      ...(data.emails?.[0]?.email && { email: data.emails[0].email }),
    }
    const res = await client.patch<RoutableCompany>(`companies/${id}`, body)
    return transformCompany(res)
  }

  // --- Accounts (funding bank/balance accounts) ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new RoutableClient(credentials)
    const res = await client.get<RoutableListResponse<RoutableAccount>>(
      'settings/accounts',
      this.pagination(params),
    )
    return (res.results ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new RoutableClient(credentials)
    const res = await client.get<RoutableAccount>(`settings/accounts/${id}`)
    return transformAccount(res)
  }
}
