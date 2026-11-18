/**
 * Medius AP Automation accounting adapter.
 *
 * Medius is an AP Automation platform.  The resources it exposes via its
 * REST integration API are:
 *   - Supplier invoices  → canonical Bill
 *   - Suppliers          → canonical Contact  (suppliers only)
 *   - Companies          → canonical Organization
 *   - Purchase orders    → canonical PurchaseOrder
 *
 * Resources Medius does NOT expose as REST endpoints (auto-501):
 *   Invoice, Account, Journal, Transaction, TaxRate, Expense,
 *   CreditMemo, Order, SalesOrder
 *
 * Auth: OAuth2 authorization-code flow; token endpoint is tenant-specific.
 * Docs: https://success.medius.com/documentation/integration-documentation/
 */

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Organization } from '../../schema/organization'
import type { PurchaseOrder } from '../../schema/purchaseorder'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { MediusClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformBill,
  type MediusSupplierInvoice,
} from './transform/bill'
import {
  transformSupplier,
  type MediusSupplier,
  type MediusSupplierPage,
} from './transform/contact'
import {
  transformOrganization,
  type MediusCompanyPage,
} from './transform/organization'
import {
  transformPurchaseOrder,
  type MediusPurchaseOrder,
  type MediusPurchaseOrderPage,
} from './transform/purchaseorder'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: account     — no chart-of-accounts REST endpoint; AP/procurement only
// Unavailable: creditmemo  — no credit memo/note endpoint; AP-only, no AR functionality
// Unavailable: expense     — no expense management endpoint; out of scope for this product
// Unavailable: invoice     — no customer (AR) invoice endpoint; supplier invoices → Bill (AP)
// Unavailable: journal     — no journal entry endpoint; GL lives in the connected ERP
// Unavailable: order       — no generic order endpoint; POs already mapped, no order concept
// Unavailable: salesorder  — no sales order endpoint; AP/procurement platform only
// Unavailable: taxrate     — no tax rate export endpoint; tax groups are import-only
// Unavailable: transaction — no transaction endpoint; payment batches exist for AP only

// ── Config ─────────────────────────────────────────────────────────────────────

interface MediusAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

// ── Response envelope for ERP-sync message lists ───────────────────────────────

interface MediusInvoiceMessagePage {
  /** Array of IntegrationSupplierInvoiceDto */
  items?: MediusSupplierInvoice[]
}

// ── Adapter ────────────────────────────────────────────────────────────────────

export class MediusAdapter implements AccountingAdapter {
  readonly platform = 'medius'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: MediusAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  // ── OAuth2 ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[], tenant?: string): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state, tenant ?? '')
  }

  /**
   * Exchange an authorization code for credentials.
   * The tenant slug is passed as the optional third argument (tenant identifier
   * stored in credentials.tenantId for subsequent API calls).
   */
  async exchangeCode(code: string, redirectUri: string, tenant?: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri, tenant ?? '')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    const creds = await refreshAccessToken(
      credentials.refreshToken,
      this.clientId,
      this.clientSecret,
      credentials.tenantId ?? '',
    )
    return creds
  }

  // ── Organization ─────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new MediusClient(credentials)
    const res = await client.get<MediusCompanyPage>(
      'integration/masterdata/v1/companies',
      { offset: 0, limit: 1 },
    )
    const company = res.companies?.[0]
    if (!company) throw new Error('No company found in Medius tenant')
    return transformOrganization(company)
  }

  // ── Bills (Supplier Invoices) ─────────────────────────────────────────────────

  /**
   * List supplier invoices via the ERP-sync message endpoint.
   * Medius exposes supplier invoices as "posted" ERP messages — these are
   * invoices that have been processed and are ready for ERP posting.
   * Endpoint: GET /integration/message/v1/supplierinvoice/invoices/posted
   */
  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new MediusClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const offset = ((params.page ?? 1) - 1) * limit

    // The posted queue returns invoices awaiting ERP sync
    const res = await client.get<MediusInvoiceMessagePage | MediusSupplierInvoice[]>(
      'integration/message/v1/supplierInvoice/invoices/posted',
      { offset, limit },
    )

    // Handle both array and page-envelope response shapes
    const invoices: MediusSupplierInvoice[] = Array.isArray(res)
      ? res
      : ((res as MediusInvoiceMessagePage).items ?? [])

    return invoices.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new MediusClient(credentials)
    const res = await client.get<MediusSupplierInvoice>(
      `integration/message/v1/supplierInvoice/invoices/posted/${id}`,
    )
    return transformBill(res)
  }

  // ── Contacts (Suppliers) ──────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new MediusClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const offset = ((params.page ?? 1) - 1) * limit
    const query: Record<string, unknown> = { offset, limit }
    if (params.updatedAfter) {
      query['updatedSince'] = params.updatedAfter.toISOString()
    }
    const res = await client.get<MediusSupplierPage>(
      'integration/masterdata/v1/suppliers',
      query,
    )
    return (res.suppliers ?? []).map(transformSupplier)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    // Medius does not expose a single-supplier GET by id.
    // Fetch with identifierValue filter as a workaround.
    const client = new MediusClient(credentials)
    const res = await client.get<MediusSupplierPage>(
      'integration/masterdata/v1/suppliers',
      { offset: 0, limit: 1, identifierType: 'SUPPLIER_ID', identifierValue: id },
    )
    const supplier: MediusSupplier | undefined = res.suppliers?.[0]
    if (!supplier) throw new Error(`Supplier not found: ${id}`)
    return transformSupplier(supplier)
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new MediusClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const offset = ((params.page ?? 1) - 1) * limit
    const res = await client.get<MediusPurchaseOrderPage>(
      'integration/masterdata/v1/purchaseOrders',
      { offset, limit },
    )
    return ((res as MediusPurchaseOrderPage).purchaseOrders ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    // The export endpoint does not support single-item GET; fetch with a filter
    const client = new MediusClient(credentials)
    const res = await client.get<MediusPurchaseOrderPage>(
      'integration/masterdata/v1/purchaseOrders',
      { offset: 0, limit: 1, orderIdentifier: id },
    )
    const po: MediusPurchaseOrder | undefined = res.purchaseOrders?.[0]
    if (!po) throw new Error(`Purchase order not found: ${id}`)
    return transformPurchaseOrder(po)
  }

  /**
   * Import a purchase order into Medius.
   * Endpoint: POST /integration/masterdata/v1/purchaseOrderImportBatches
   * Returns a batch status response; we resolve it to the supplied PO.
   * Medius expects amounts as decimals (e.g. 1250.00), so canonical minor
   * units are divided by 100 when writing to the API.
   */
  async createPurchaseOrder(
    credentials: Credentials,
    data: Partial<PurchaseOrder>,
  ): Promise<PurchaseOrder> {
    const client = new MediusClient(credentials)
    // Convert canonical minor-unit amount back to Medius decimal format
    const mediusAmount = data.totalAmount != null ? data.totalAmount / 100 : undefined
    await client.post('integration/masterdata/v1/purchaseOrderImportBatches', [
      {
        externalSystemId: data.id,
        supplierId: data.contactId,
        currencyCode: data.currency,
        amount: mediusAmount,
        orderIdentifier: data.id,
        isActive: true,
      },
    ])
    // Return the canonical object built from input data (Medius does not
    // return the full PO in the import response).
    return {
      id: data.id,
      status: 'ACTIVE',
      contactId: data.contactId,
      currency: data.currency,
      totalAmount: data.totalAmount,
      lineItems: data.lineItems,
      postedAt: data.postedAt,
      metadata: {},
    }
  }
}
