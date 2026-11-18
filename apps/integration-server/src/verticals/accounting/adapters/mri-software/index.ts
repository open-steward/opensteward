import { toCalendarDate } from '../shared/transform'
/**
 * MRI Software Accounting Adapter.
 *
 * Supported resources (as exposed by MRI's REST API):
 *   - Bills (AP invoices)
 *   - Contacts (Customers + Suppliers)
 *   - Accounts (Ledger Accounts)
 *   - Tax Rates
 *   - Purchase Orders
 *   - Journal Entries
 *
 * Webhooks: not supported by MRI Software.
 *
 * Auth: OAuth2 authorization-code flow with per-tenant instanceUrl.
 * The instanceUrl (e.g. https://acme.mrisoftware.com) is passed in the
 * adapter config and preserved in `credentials.extra.instanceUrl`.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: creditmemo   — no credit memo/credit note endpoint; payables are Bills only
// Unavailable: expense      — no employee expense endpoint in MRI's accounting API
// Unavailable: invoice      — no AR invoice endpoint; MRI models payables as Bills only
// Unavailable: order        — no general order endpoint in MRI's accounting API
// Unavailable: salesorder   — no sales order endpoint; platform is property-management-focused
// Unavailable: transaction  — no dedicated transactions endpoint; GL entries via Journal Entries (implemented)
// Unverified:  organization — Subsidiaries endpoint catalogued but full API docs require partner-portal login; field shape unconfirmed

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { TaxRate } from '../../schema/taxrate'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Journal } from '../../schema/journal'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { MriSoftwareClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, DEFAULT_SCOPES } from './constants'

import { transformBill, type MriBill } from './transform/bill'
import {
  transformCustomer,
  transformSupplier,
  type MriCustomer,
  type MriSupplier,
} from './transform/contact'
import { transformAccount, type MriAccount } from './transform/account'
import { transformTaxRate, type MriTaxRate } from './transform/taxrate'
import { transformPurchaseOrder, type MriPurchaseOrder } from './transform/purchaseorder'
import { transformJournal, untransformJournal, type MriJournalEntry } from './transform/journal'

interface MriSoftwareAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
  instanceUrl: string
}

interface MriPagedResponse<T> {
  data: T[]
  totalCount?: number
  nextPage?: string | null
  [key: string]: unknown
}

export class MriSoftwareAdapter implements AccountingAdapter {
  readonly platform = 'mri-software'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]
  private instanceUrl: string

  constructor(config: MriSoftwareAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
    this.instanceUrl = config.instanceUrl
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
      this.instanceUrl,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri, this.instanceUrl)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    const instanceUrl = (credentials.extra?.['instanceUrl'] as string) ?? this.instanceUrl
    return refreshAccessToken(
      credentials.refreshToken,
      this.clientId,
      this.clientSecret,
      instanceUrl,
    )
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skip = ((params.page ?? 1) - 1) * top
    return {
      $top: top,
      $skip: skip,
      ...(params.updatedAfter && {
        $filter: `updatedAt gt ${params.updatedAfter.toISOString()}`,
      }),
    }
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new MriSoftwareClient(credentials)
    const res = await client.get<MriPagedResponse<MriBill>>('bills', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new MriSoftwareClient(credentials)
    const res = await client.get<MriBill>(`bills/${id}`)
    return transformBill(res)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new MriSoftwareClient(credentials)
    const body: Record<string, unknown> = {
      vendorId: data.contactId,
      currencyCode: data.currency,
      billNumber: data.billNumber,
      notes: data.notes,
      invoiceDate: toCalendarDate(data.postedAt),
      dueDate: toCalendarDate(data.dueAt),
      lines: data.lineItems?.map((li) => ({
        accountId: li.accountId,
        itemId: li.itemId,
        description: li.itemDescription,
        unitAmount: li.unitAmount,
        quantity: li.unitQuantity,
        totalAmount: li.totalAmount,
      })),
    }
    const res = await client.post<MriBill>('bills', body)
    return transformBill(res)
  }

  async updateBill(credentials: Credentials, id: string, data: Partial<Bill>): Promise<Bill> {
    const client = new MriSoftwareClient(credentials)
    const body: Record<string, unknown> = {
      vendorId: data.contactId,
      currencyCode: data.currency,
      billNumber: data.billNumber,
      notes: data.notes,
      invoiceDate: toCalendarDate(data.postedAt),
      dueDate: toCalendarDate(data.dueAt),
      lines: data.lineItems?.map((li) => ({
        accountId: li.accountId,
        itemId: li.itemId,
        description: li.itemDescription,
        unitAmount: li.unitAmount,
        quantity: li.unitQuantity,
        totalAmount: li.totalAmount,
      })),
    }
    const res = await client.put<MriBill>(`bills/${id}`, body)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new MriSoftwareClient(credentials)
    const pagination = this.paginationParams(params)
    const [custRes, suppRes] = await Promise.all([
      client.get<MriPagedResponse<MriCustomer>>('customers', pagination),
      client.get<MriPagedResponse<MriSupplier>>('suppliers', pagination),
    ])
    return [
      ...(custRes.data ?? []).map(transformCustomer),
      ...(suppRes.data ?? []).map(transformSupplier),
    ]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new MriSoftwareClient(credentials)
    if (id.startsWith('cust_')) {
      const res = await client.get<MriCustomer>(`customers/${id.slice(5)}`)
      return transformCustomer(res)
    } else if (id.startsWith('vend_')) {
      const res = await client.get<MriSupplier>(`suppliers/${id.slice(5)}`)
      return transformSupplier(res)
    }
    throw new Error(`getContact: unrecognised id prefix — expected 'cust_' or 'vend_', got '${id}'`)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new MriSoftwareClient(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const body: Record<string, unknown> = {
        name: data.name,
        firstName: data.firstName,
        lastName: data.lastName,
        companyName: data.companyName,
        email: data.emails?.[0]?.email,
        phone: data.telephones?.[0]?.telephone,
        currencyCode: data.currency,
        taxNumber: data.taxNumber,
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
      const res = await client.post<MriSupplier>('suppliers', body)
      return transformSupplier(res)
    }
    const body: Record<string, unknown> = {
      name: data.name,
      firstName: data.firstName,
      lastName: data.lastName,
      companyName: data.companyName,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      currencyCode: data.currency,
      taxNumber: data.taxNumber,
      billingAddress: data.billingAddress
        ? {
            line1: data.billingAddress.address1,
            line2: data.billingAddress.address2,
            city: data.billingAddress.city,
            state: data.billingAddress.region,
            postalCode: data.billingAddress.postalCode,
            country: data.billingAddress.country,
          }
        : undefined,
      shippingAddress: data.shippingAddress
        ? {
            line1: data.shippingAddress.address1,
            line2: data.shippingAddress.address2,
            city: data.shippingAddress.city,
            state: data.shippingAddress.region,
            postalCode: data.shippingAddress.postalCode,
            country: data.shippingAddress.country,
          }
        : undefined,
    }
    const res = await client.post<MriCustomer>('customers', body)
    return transformCustomer(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new MriSoftwareClient(credentials)
    if (id.startsWith('cust_')) {
      const body: Record<string, unknown> = {
        name: data.name,
        firstName: data.firstName,
        lastName: data.lastName,
        companyName: data.companyName,
        email: data.emails?.[0]?.email,
        phone: data.telephones?.[0]?.telephone,
      }
      const res = await client.put<MriCustomer>(`customers/${id.slice(5)}`, body)
      return transformCustomer(res)
    } else if (id.startsWith('vend_')) {
      const body: Record<string, unknown> = {
        name: data.name,
        firstName: data.firstName,
        lastName: data.lastName,
        companyName: data.companyName,
        email: data.emails?.[0]?.email,
        phone: data.telephones?.[0]?.telephone,
      }
      const res = await client.put<MriSupplier>(`suppliers/${id.slice(5)}`, body)
      return transformSupplier(res)
    }
    throw new Error(`updateContact: unrecognised id prefix — expected 'cust_' or 'vend_', got '${id}'`)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new MriSoftwareClient(credentials)
    const res = await client.get<MriPagedResponse<MriAccount>>(
      'ledger-accounts',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new MriSoftwareClient(credentials)
    const res = await client.get<MriAccount>(`ledger-accounts/${id}`)
    return transformAccount(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new MriSoftwareClient(credentials)
    const res = await client.get<MriPagedResponse<MriTaxRate>>(
      'tax-rates',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new MriSoftwareClient(credentials)
    const res = await client.get<MriTaxRate>(`tax-rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new MriSoftwareClient(credentials)
    const res = await client.get<MriPagedResponse<MriPurchaseOrder>>(
      'purchase-orders',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new MriSoftwareClient(credentials)
    const res = await client.get<MriPurchaseOrder>(`purchase-orders/${id}`)
    return transformPurchaseOrder(res)
  }

  // --- Journal Entries ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new MriSoftwareClient(credentials)
    const res = await client.get<MriPagedResponse<MriJournalEntry>>(
      'journal-entries',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new MriSoftwareClient(credentials)
    const res = await client.get<MriJournalEntry>(`journal-entries/${id}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new MriSoftwareClient(credentials)
    const res = await client.post<MriJournalEntry>('journal-entries', untransformJournal(data))
    return transformJournal(res)
  }
}
