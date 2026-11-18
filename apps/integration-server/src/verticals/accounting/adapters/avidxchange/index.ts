import { toCalendarDate } from '../shared/transform'
/**
 * AvidXchange accounting adapter.
 *
 * AvidXchange is an AP-automation platform. It manages:
 *   - Vendor invoices (bills) flowing through the approval workflow
 *   - Vendor/supplier records
 *   - Outgoing AP payments
 *   - GL account codes
 *   - Company (organization) information
 *
 * Auth: static API key sent via `x-api-key` header. Company scope is carried
 * in `credentials.extra.companyId`.
 *
 * Resources implemented: Bill, Contact (vendors), Account (GL), Transaction
 *                         (payments), Organization.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: invoice    — AvidXchange is AP-only; no AR module exists.
 * Unavailable: creditmemo — AvidXchange is AP-only; credit memos are an AR concept.
 * Unavailable: salesorder — AvidXchange is AP-only; no sales order capability.
 * Unavailable: order      — AvidXchange is AP-only; no order-management capability.
 * Unverified:  expense    — API docs behind partner login; no public expense endpoint found. AvidXchange manages vendor invoices, not employee expenses.
 * Unverified:  journal    — API docs behind partner login; no public journal-entry endpoint found.
 * Unverified:  purchaseorder — API docs behind partner login; PO matching is a UI feature but no REST endpoint publicly documented.
 * Unverified:  taxrate    — API docs behind partner login; no public tax-rate endpoint found.
 */
import { customForm } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Transaction } from '../../schema/transaction'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, refreshCredentials as doRefreshCredentials } from './auth'
import { AvidXchangeClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformBill, type AvidXchangeInvoice } from './transform/bill'
import { transformVendor, type AvidXchangeVendor } from './transform/contact'
import { transformAccount, type AvidXchangeGLAccount } from './transform/account'
import { transformTransaction, type AvidXchangePayment } from './transform/transaction'
import { transformOrganization, type AvidXchangeCompany } from './transform/organization'

// ── Credential form ───────────────────────────────────────────────────────────

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText: 'Your AvidXchange partner API key. Contact your AvidXchange account manager to obtain one.',
    },
    {
      name: 'companyId',
      label: 'Company ID',
      type: 'text',
      required: true,
      helpText: 'Your AvidXchange payer company identifier (found in the AvidXchange portal under Company Settings).',
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const apiKey = (fields['apiKey'] ?? '').trim()
    const companyId = (fields['companyId'] ?? '').trim()
    if (!apiKey) throw new Error('API Key is required.')
    if (!companyId) throw new Error('Company ID is required.')
    return { accessToken: apiKey, extra: { companyId } }
  },
})

// ── Pagination response envelope ──────────────────────────────────────────────

interface AvidXchangePage<T> {
  data?: T[]
  items?: T[]
  results?: T[]
  pagination?: {
    pageNumber?: number
    pageSize?: number
    totalCount?: number
    totalPages?: number
  }
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class AvidxchangeAdapter implements AccountingAdapter {
  readonly platform = 'avidxchange'
  readonly version = '0.1.0'

  // Connect Link support — two-field form (API key + company ID).
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // AvidXchange does not use OAuth. Credentials are gathered via the form.
    throw new Error('AvidXchange uses API key auth. Use the Connect Link credential form instead.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      pageNumber: params.page ?? 1,
      ...(params.updatedAfter && {
        modifiedAfter: params.updatedAfter.toISOString(),
      }),
    }
  }

  /** Extract the items array from any of the envelope shapes AvidXchange uses. */
  private items<T>(res: AvidXchangePage<T>): T[] {
    return res.data ?? res.items ?? res.results ?? []
  }

  // ── Organization ────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new AvidXchangeClient(credentials)
    const res = await client.get<AvidXchangeCompany>(
      `companies/${client.companyId}`,
    )
    return transformOrganization(res)
  }

  // ── Bills (vendor AP invoices) ───────────────────────────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new AvidXchangeClient(credentials)
    const res = await client.get<AvidXchangePage<AvidXchangeInvoice>>(
      `companies/${client.companyId}/invoices`,
      this.paginationParams(params),
    )
    return this.items(res).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new AvidXchangeClient(credentials)
    const res = await client.get<AvidXchangeInvoice>(
      `companies/${client.companyId}/invoices/${id}`,
    )
    return transformBill(res)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new AvidXchangeClient(credentials)
    const body = {
      vendorId: data.contactId,
      invoiceNumber: data.billNumber,
      invoiceDate: toCalendarDate(data.postedAt),
      dueDate: toCalendarDate(data.dueAt),
      totalAmount: data.totalAmount,
      currency: data.currency,
      description: data.notes,
      lineItems: data.lineItems?.map((li) => ({
        glAccountId: li.accountId,
        description: li.itemDescription,
        quantity: li.unitQuantity,
        unitPrice: li.unitAmount,
        amount: li.totalAmount,
      })),
    }
    const res = await client.post<AvidXchangeInvoice>(
      `companies/${client.companyId}/invoices`,
      body,
    )
    return transformBill(res)
  }

  async updateBill(
    credentials: Credentials,
    id: string,
    data: Partial<Bill>,
  ): Promise<Bill> {
    const client = new AvidXchangeClient(credentials)
    const body = {
      invoiceNumber: data.billNumber,
      invoiceDate: toCalendarDate(data.postedAt),
      dueDate: toCalendarDate(data.dueAt),
      totalAmount: data.totalAmount,
      currency: data.currency,
      description: data.notes,
      lineItems: data.lineItems?.map((li) => ({
        glAccountId: li.accountId,
        description: li.itemDescription,
        quantity: li.unitQuantity,
        unitPrice: li.unitAmount,
        amount: li.totalAmount,
      })),
    }
    const res = await client.put<AvidXchangeInvoice>(
      `companies/${client.companyId}/invoices/${id}`,
      body,
    )
    return transformBill(res)
  }

  // ── Contacts (vendors / suppliers) ──────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new AvidXchangeClient(credentials)
    const res = await client.get<AvidXchangePage<AvidXchangeVendor>>(
      `companies/${client.companyId}/vendors`,
      this.paginationParams(params),
    )
    return this.items(res).map(transformVendor)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new AvidXchangeClient(credentials)
    const res = await client.get<AvidXchangeVendor>(
      `companies/${client.companyId}/vendors/${id}`,
    )
    return transformVendor(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new AvidXchangeClient(credentials)
    const body = {
      vendorName: data.name,
      vendorCode: data.identification,
      taxId: data.taxNumber,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
      fax: data.telephones?.find((t) => t.type === 'FAX')?.telephone,
      address1: data.billingAddress?.address1,
      address2: data.billingAddress?.address2,
      city: data.billingAddress?.city,
      state: data.billingAddress?.region,
      postalCode: data.billingAddress?.postalCode,
      country: data.billingAddress?.country,
      currency: data.currency,
    }
    const res = await client.post<AvidXchangeVendor>(
      `companies/${client.companyId}/vendors`,
      body,
    )
    return transformVendor(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new AvidXchangeClient(credentials)
    const body = {
      vendorName: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
      address1: data.billingAddress?.address1,
      address2: data.billingAddress?.address2,
      city: data.billingAddress?.city,
      state: data.billingAddress?.region,
      postalCode: data.billingAddress?.postalCode,
      country: data.billingAddress?.country,
    }
    const res = await client.put<AvidXchangeVendor>(
      `companies/${client.companyId}/vendors/${id}`,
      body,
    )
    return transformVendor(res)
  }

  // ── Accounts (GL codes) ──────────────────────────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new AvidXchangeClient(credentials)
    const res = await client.get<AvidXchangePage<AvidXchangeGLAccount>>(
      `companies/${client.companyId}/glaccounts`,
      this.paginationParams(params),
    )
    return this.items(res).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new AvidXchangeClient(credentials)
    const res = await client.get<AvidXchangeGLAccount>(
      `companies/${client.companyId}/glaccounts/${id}`,
    )
    return transformAccount(res)
  }

  // ── Transactions (AP payments) ───────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new AvidXchangeClient(credentials)
    const res = await client.get<AvidXchangePage<AvidXchangePayment>>(
      `companies/${client.companyId}/payments`,
      this.paginationParams(params),
    )
    return this.items(res).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new AvidXchangeClient(credentials)
    const res = await client.get<AvidXchangePayment>(
      `companies/${client.companyId}/payments/${id}`,
    )
    return transformTransaction(res)
  }
}
