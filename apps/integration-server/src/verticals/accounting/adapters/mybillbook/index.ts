import { toCalendarDate } from '../shared/transform'
/**
 * myBillBook accounting adapter.
 *
 * myBillBook (by FloBiz) is India's leading GST billing & accounting software
 * for small and medium businesses.
 *
 * Auth: API key — stored in credentials.accessToken, sent as X-API-KEY header.
 *   Generated in Settings > Integrations > API Keys.
 *
 * Supported resources:
 *   - Organization  (GET /business)
 *   - Invoices      (GET /invoices, POST /invoices, PUT /invoices/:id)
 *   - Bills         (GET /purchase-bills, POST /purchase-bills, PUT /purchase-bills/:id)
 *   - Contacts      (GET /parties, POST /parties, PUT /parties/:id)
 *     (myBillBook calls contacts "parties"; party_type: "customer"|"supplier"|"both")
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: account      — myBillBook exposes no chart-of-accounts API endpoint
 * Unavailable: creditmemo   — myBillBook exposes no credit-note API endpoint
 * Unavailable: expense      — myBillBook exposes no expenses API endpoint
 * Unavailable: journal      — myBillBook exposes no journal-entries API endpoint
 * Unavailable: order        — myBillBook exposes no orders API endpoint
 * Unavailable: purchaseorder — myBillBook exposes no purchase-orders API endpoint
 * Unavailable: salesorder   — myBillBook exposes no sales-orders API endpoint
 * Unavailable: taxrate      — myBillBook exposes no tax-rates API endpoint
 * Unavailable: transaction  — myBillBook exposes no transactions API endpoint
 */

import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Organization } from '../../schema/organization'

import { refreshCredentials } from './auth'
import {
  MybillbookClient,
  type MybillbookListResponse,
  type MybillbookSingleResponse,
} from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformInvoice,
  untransformInvoice,
  type MybillbookInvoice,
} from './transform/invoice'
import { transformBill, type MybillbookBill } from './transform/bill'
import { transformParty, type MybillbookParty } from './transform/contact'
import { transformOrganization, type MybillbookBusiness } from './transform/organization'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API Key',
  placeholder: 'mbb_live_xxxxxxxxxxxxxxxxxxxx',
  helpText: 'Generate an API key in myBillBook under Settings > Integrations > API Keys.',
})

export class MybillbookAdapter implements AccountingAdapter {
  readonly platform = 'mybillbook'
  readonly version = '0.1.0'

  /** API key auth — no OAuth config needed. */
  constructor() {}

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  /**
   * myBillBook uses static API keys — no OAuth flow.
   * Throws to signal misconfiguration if called.
   */
  getAuthUrl(_state: string): string {
    throw new Error('myBillBook uses API key authentication — getAuthUrl is not applicable.')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('myBillBook uses API key authentication — exchangeCode is not applicable.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire — return as-is
    return refreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      ...(params.updatedAfter && {
        updated_since: params.updatedAfter.toISOString().split('T')[0],
      }),
    }
  }

  private client(credentials: Credentials): MybillbookClient {
    return new MybillbookClient(credentials)
  }

  // ── Organization ────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const c = this.client(credentials)
    const res = await c.get<MybillbookSingleResponse<MybillbookBusiness>>('business')
    return transformOrganization(res.data)
  }

  // ── Invoices ────────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const c = this.client(credentials)
    const res = await c.get<MybillbookListResponse<MybillbookInvoice>>(
      'invoices',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const c = this.client(credentials)
    const res = await c.get<MybillbookSingleResponse<MybillbookInvoice>>(`invoices/${id}`)
    return transformInvoice(res.data)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const c = this.client(credentials)
    const res = await c.post<MybillbookSingleResponse<MybillbookInvoice>>(
      'invoices',
      untransformInvoice(data),
    )
    return transformInvoice(res.data)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const c = this.client(credentials)
    const res = await c.put<MybillbookSingleResponse<MybillbookInvoice>>(
      `invoices/${id}`,
      untransformInvoice(data),
    )
    return transformInvoice(res.data)
  }

  // ── Bills (Purchase Bills) ──────────────────────────────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const c = this.client(credentials)
    const res = await c.get<MybillbookListResponse<MybillbookBill>>(
      'purchase-bills',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const c = this.client(credentials)
    const res = await c.get<MybillbookSingleResponse<MybillbookBill>>(`purchase-bills/${id}`)
    return transformBill(res.data)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const c = this.client(credentials)
    const res = await c.post<MybillbookSingleResponse<MybillbookBill>>('purchase-bills', {
      party_id: data.contactId,
      currency: data.currency,
      bill_date: toCalendarDate(data.postedAt),
      due_date: toCalendarDate(data.dueAt),
      notes: data.notes,
      items: data.lineItems?.map((li) => ({
        item_name: li.itemName,
        description: li.itemDescription,
        unit_price: li.unitAmount !== undefined && li.unitAmount !== null
          ? li.unitAmount / 100
          : undefined,
        quantity: li.unitQuantity,
        discount: li.discountAmount !== undefined && li.discountAmount !== null
          ? li.discountAmount / 100
          : undefined,
      })),
    })
    return transformBill(res.data)
  }

  // ── Contacts (Parties) ──────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const c = this.client(credentials)
    const res = await c.get<MybillbookListResponse<MybillbookParty>>(
      'parties',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformParty)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const c = this.client(credentials)
    const res = await c.get<MybillbookSingleResponse<MybillbookParty>>(`parties/${id}`)
    return transformParty(res.data)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const c = this.client(credentials)
    let partyType = 'customer'
    if (data.isSupplier && data.isCustomer) partyType = 'both'
    else if (data.isSupplier) partyType = 'supplier'

    const res = await c.post<MybillbookSingleResponse<MybillbookParty>>('parties', {
      name: data.name,
      party_type: partyType,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
      gstin: data.taxNumber,
      pan: data.identification,
      address: data.billingAddress?.address1,
      city: data.billingAddress?.city,
      state: data.billingAddress?.region,
      pincode: data.billingAddress?.postalCode,
      country: data.billingAddress?.country,
    })
    return transformParty(res.data)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const c = this.client(credentials)
    const res = await c.put<MybillbookSingleResponse<MybillbookParty>>(`parties/${id}`, {
      name: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
      gstin: data.taxNumber,
      address: data.billingAddress?.address1,
      city: data.billingAddress?.city,
      state: data.billingAddress?.region,
      pincode: data.billingAddress?.postalCode,
      country: data.billingAddress?.country,
    })
    return transformParty(res.data)
  }
}
