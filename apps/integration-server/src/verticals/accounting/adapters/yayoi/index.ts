import { toCalendarDate } from '../shared/transform'
/**
 * Yayoi (Misoca) accounting adapter.
 *
 * Misoca is Yayoi Co.'s cloud invoicing platform.
 * API docs: https://doc.misoca.jp/v3/
 *
 * Supported resources:
 *   - Organization  → GET /api/v3/user/me
 *   - Invoices      → GET /api/v3/invoices, /api/v3/invoice/{id}, POST /api/v3/invoice
 *   - Contacts      → GET /api/v3/contact_groups, /api/v3/contact_group/{id},
 *                     POST /api/v3/contact_group
 *   - Orders        → GET /api/v3/estimates, /api/v3/estimate/{id} (→ Order)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: account      — Misoca has no chart-of-accounts; no /accounts endpoint in v3 API.
 * Unavailable: bill         — Misoca has no supplier-bill concept; no /bills endpoint in v3 API.
 * Unavailable: creditmemo   — Misoca has no credit-note concept; no /credit_memos endpoint in v3 API.
 * Unavailable: expense      — Misoca has no expense-claim concept; no /expenses endpoint in v3 API.
 * Unavailable: journal      — Misoca has no double-entry journal; no /journals endpoint in v3 API.
 * Unavailable: purchaseorder — Misoca has no purchase-order concept; no /purchase_orders endpoint in v3 API.
 * Unavailable: salesorder   — Misoca has no sales-order distinct from estimates; no /sales_orders endpoint in v3 API.
 * Unavailable: taxrate      — Tax type is a per-line-item enum on invoices; no standalone /tax_rates resource in v3 API.
 * Unavailable: transaction  — Misoca has no ledger-transaction concept; no /transactions endpoint in v3 API.
 */

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Organization } from '../../schema/organization'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { MisocaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type MisocaInvoice } from './transform/invoice'
import {
  transformContactGroup,
  transformContact,
  type MisocaContactGroup,
  type MisocaContact,
} from './transform/contact'
import { transformOrganization, type MisocaUser } from './transform/organization'
import { transformOrder, type MisocaEstimate } from './transform/order'

interface YayoiAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class YayoiAdapter implements AccountingAdapter {
  readonly platform = 'yayoi'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: YayoiAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? ['write']
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

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new MisocaClient(credentials)
    const raw = await client.get<MisocaUser>('user/me')
    return transformOrganization(raw)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new MisocaClient(credentials)
    const per_page = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const query: Record<string, unknown> = { page, per_page }
    if (params.updatedAfter) {
      query['updated_at_from'] = params.updatedAfter.toISOString().split('T')[0]
    }
    const items = await client.get<MisocaInvoice[]>('invoices', query)
    return (items ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new MisocaClient(credentials)
    const raw = await client.get<MisocaInvoice>(`invoice/${id}`)
    return transformInvoice(raw)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new MisocaClient(credentials)
    const raw = await client.post<MisocaInvoice>('invoice', untransformInvoice(data))
    return transformInvoice(raw)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new MisocaClient(credentials)
    // Misoca does not expose a general PUT /invoice/{id} for field updates.
    // Status-only transitions use PUT /invoice/{id}/paid|submitted|trashed.
    // For field updates, re-POST with the full body (Misoca upsert semantics).
    const raw = await client.post<MisocaInvoice>('invoice', untransformInvoice(data))
    return transformInvoice(raw)
  }

  // --- Contacts ---

  /**
   * Lists contact groups (取引先) as canonical contacts.
   * Contact groups are the primary business-partner entity in Misoca.
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new MisocaClient(credentials)
    const items = await client.get<MisocaContactGroup[]>('contact_groups', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return (items ?? []).map(transformContactGroup)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new MisocaClient(credentials)
    // Try contact_group first; fall back to contact (destination) by convention.
    if (id.startsWith('dest_')) {
      const raw = await client.get<MisocaContact>(`contact/${id.slice(5)}`)
      return transformContact(raw)
    }
    const raw = await client.get<MisocaContactGroup>(`contact_group/${id}`)
    return transformContactGroup(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new MisocaClient(credentials)
    const raw = await client.post<MisocaContactGroup>('contact_group', {
      recipient_name: data.name ?? data.companyName,
    })
    return transformContactGroup(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new MisocaClient(credentials)
    const raw = await client.put<MisocaContactGroup>(`contact_group/${id}`, {
      recipient_name: data.name ?? data.companyName,
    })
    return transformContactGroup(raw)
  }

  // --- Orders (Estimates → canonical Order) ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new MisocaClient(credentials)
    const items = await client.get<MisocaEstimate[]>('estimates', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return (items ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new MisocaClient(credentials)
    const raw = await client.get<MisocaEstimate>(`estimate/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new MisocaClient(credentials)
    const raw = await client.post<MisocaEstimate>('estimate', {
      contact_id: data.contactId ? Number(data.contactId) : undefined,
      issue_date: toCalendarDate(data.postedAt),
      items: data.lineItems?.map((li) => ({
        name: li.itemName ?? li.itemDescription,
        quantity: li.unitQuantity ?? 1,
        unit_price: li.unitAmount,
      })),
    })
    return transformOrder(raw)
  }
}
