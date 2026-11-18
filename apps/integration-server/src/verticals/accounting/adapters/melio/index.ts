import { toCalendarDate } from '../shared/transform'
// ── Resource coverage ──────────────────────────────────────────────
// Available:   bill, contact, invoice, organization, transaction
// Unavailable: account       — Melio is a payments platform, not a ledger; no chart-of-accounts endpoint
// Unavailable: creditmemo    — no credit memo concept; adjustments handled in connected accounting system (QuickBooks/Xero)
// Unavailable: expense       — no expense-report endpoint; scope is vendor bills and payments only
// Unavailable: journal       — no journal-entry endpoint; double-entry bookkeeping delegated to accounting system
// Unavailable: order         — no order concept; Melio is bill-pay/invoicing, not order management
// Unavailable: purchaseorder — no purchase-order endpoint; managed in connected ERP/accounting system
// Unavailable: salesorder    — no sales-order endpoint; invoicing (AR) provided but not order management
// Unavailable: taxrate       — no tax-rate endpoint; tax config/calculation owned by connected accounting system

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Organization } from '../../schema/organization'
import type { Transaction } from '../../schema/transaction'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { MelioClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { melioWebhook } from './webhook'

import { transformInvoice, untransformInvoice, type MelioInvoice } from './transform/invoice'
import { transformBill, type MelioBill } from './transform/bill'
import { transformVendor, type MelioVendor } from './transform/contact'
import { transformOrganization, type MelioOrganization } from './transform/organization'
import { transformPayment, type MelioPayment } from './transform/transaction'

interface MelioAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

// Melio list response envelope
interface MelioListResponse<T> {
  data: T[]
  meta?: {
    totalCount?: number
    page?: number
    limit?: number
  }
}

export class MelioAdapter implements AccountingAdapter {
  readonly platform = 'melio'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: MelioAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  // --- Webhooks ---

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return melioWebhook.parseWebhookEvents(payload)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new MelioClient(credentials)
    const res = await client.get<{ data: MelioOrganization }>('organizations/me')
    return transformOrganization(res.data)
  }

  // --- Bills (AP) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new MelioClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100)
    const page = params.page ?? 1
    const res = await client.get<MelioListResponse<MelioBill>>('bills', {
      limit,
      page,
      ...(params.updatedAfter && { updatedAfter: params.updatedAfter.toISOString() }),
    })
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new MelioClient(credentials)
    const res = await client.get<{ data: MelioBill }>(`bills/${id}`)
    return transformBill(res.data)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new MelioClient(credentials)
    const body: Record<string, unknown> = {
      vendorId: data.contactId,
      amount: data.totalAmount,
      currency: data.currency,
      invoiceNumber: data.billNumber,
      invoiceDate: toCalendarDate(data.postedAt),
      dueDate: toCalendarDate(data.dueAt),
      notes: data.notes,
      lineItems: data.lineItems?.map((li) => ({
        description: li.itemDescription,
        amount: li.totalAmount,
        unitPrice: li.unitAmount,
        quantity: li.unitQuantity,
      })),
    }
    const res = await client.post<{ data: MelioBill }>('bills', body)
    return transformBill(res.data)
  }

  async updateBill(credentials: Credentials, id: string, data: Partial<Bill>): Promise<Bill> {
    const client = new MelioClient(credentials)
    const body: Record<string, unknown> = {
      vendorId: data.contactId,
      amount: data.totalAmount,
      currency: data.currency,
      invoiceNumber: data.billNumber,
      invoiceDate: toCalendarDate(data.postedAt),
      dueDate: toCalendarDate(data.dueAt),
      notes: data.notes,
    }
    const res = await client.patch<{ data: MelioBill }>(`bills/${id}`, body)
    return transformBill(res.data)
  }

  async deleteBill(credentials: Credentials, id: string): Promise<void> {
    const client = new MelioClient(credentials)
    await client.delete(`bills/${id}`)
  }

  // --- Contacts (Vendors) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new MelioClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100)
    const page = params.page ?? 1
    const res = await client.get<MelioListResponse<MelioVendor>>('vendors', {
      limit,
      page,
      ...(params.updatedAfter && { updatedAfter: params.updatedAfter.toISOString() }),
    })
    return (res.data ?? []).map(transformVendor)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new MelioClient(credentials)
    const res = await client.get<{ data: MelioVendor }>(`vendors/${id}`)
    return transformVendor(res.data)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new MelioClient(credentials)
    const body: Record<string, unknown> = {
      name: data.companyName ?? data.name,
      email: data.emails?.[0]?.email,
      taxId: data.taxNumber,
      currency: data.currency,
      address: data.billingAddress
        ? {
            line1: data.billingAddress.address1,
            line2: data.billingAddress.address2,
            city: data.billingAddress.city,
            state: data.billingAddress.region,
            postalCode: data.billingAddress.postalCode,
            country: data.billingAddress.country,
          }
        : undefined,
    }
    const res = await client.post<{ data: MelioVendor }>('vendors', body)
    return transformVendor(res.data)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new MelioClient(credentials)
    const body: Record<string, unknown> = {
      name: data.companyName ?? data.name,
      email: data.emails?.[0]?.email,
      taxId: data.taxNumber,
      currency: data.currency,
      address: data.billingAddress
        ? {
            line1: data.billingAddress.address1,
            line2: data.billingAddress.address2,
            city: data.billingAddress.city,
            state: data.billingAddress.region,
            postalCode: data.billingAddress.postalCode,
            country: data.billingAddress.country,
          }
        : undefined,
    }
    const res = await client.patch<{ data: MelioVendor }>(`vendors/${id}`, body)
    return transformVendor(res.data)
  }

  // --- Invoices (AR) ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new MelioClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100)
    const page = params.page ?? 1
    const res = await client.get<MelioListResponse<MelioInvoice>>('invoices', {
      limit,
      page,
      ...(params.updatedAfter && { updatedAfter: params.updatedAfter.toISOString() }),
    })
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new MelioClient(credentials)
    const res = await client.get<{ data: MelioInvoice }>(`invoices/${id}`)
    return transformInvoice(res.data)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new MelioClient(credentials)
    const res = await client.post<{ data: MelioInvoice }>('invoices', untransformInvoice(data))
    return transformInvoice(res.data)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new MelioClient(credentials)
    const res = await client.patch<{ data: MelioInvoice }>(
      `invoices/${id}`,
      untransformInvoice(data),
    )
    return transformInvoice(res.data)
  }

  async deleteInvoice(credentials: Credentials, id: string): Promise<void> {
    const client = new MelioClient(credentials)
    await client.delete(`invoices/${id}`)
  }

  // --- Transactions (Payments) ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new MelioClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100)
    const page = params.page ?? 1
    const res = await client.get<MelioListResponse<MelioPayment>>('payments', {
      limit,
      page,
      ...(params.updatedAfter && { updatedAfter: params.updatedAfter.toISOString() }),
    })
    return (res.data ?? []).map(transformPayment)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new MelioClient(credentials)
    const res = await client.get<{ data: MelioPayment }>(`payments/${id}`)
    return transformPayment(res.data)
  }
}
