/**
 * Orckestra adapter for the ecommerce vertical.
 *
 * Orckestra is a composable B2B+B2C commerce platform. Key characteristics:
 *
 *  1. **Server-to-server OAuth2.** No browser-redirect flow. `getAuthUrl` and
 *     `exchangeCode` both throw. Tokens are obtained via client_credentials
 *     (or refresh_token) grant. `clientId`, `clientSecret`, and `baseUrl`
 *     must be present in `credentials.extra`.
 *
 *  2. **Instance-scoped REST API.** Every API call goes to
 *     `https://{instance}.orckestra.cloud/api`. The instance URL is
 *     `credentials.extra.baseUrl`.
 *
 *  3. **Flat product model.** Orckestra products are single-SKU objects.
 *     Each is surfaced as a canonical `Product` with a single synthesised
 *     `ProductVariant`.
 *
 *  4. **Status-driven orders.** A single `Status` string (New, InProgress,
 *     Completed, Cancelled) maps to both financialStatus and fulfillmentStatus.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:   order, product, customer
// Unverified:  collection  — categories are search facets, no /categories CRUD REST endpoint confirmed (docs behind login)
// Unverified:  discount    — price-list "Discount" type exists via PriceListRequest workflow; no /discounts REST endpoint confirmed
// Unverified:  fulfillment — ChangeShipmentStatusRequest workflow exists; no /fulfillments listing REST endpoint confirmed
// Unverified:  inventory   — inventoryLocationStatuses embedded in product search; no standalone /inventory endpoint confirmed
// Unverified:  location    — /fulfillmentLocations used for timeslots; no GET listing endpoint confirmed
// Unverified:  refund      — RefundPaymentRequest workflow exists (added V5.4); no /refunds REST listing endpoint confirmed
// Unverified:  transaction — payment workflow actions exist (authorize/settle/refund); no /transactions REST listing endpoint confirmed

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'

import {
  getAuthUrl,
  exchangeCode as orckestraExchangeCode,
  refreshCredentials as orckestraRefreshCredentials,
  requestClientCredentialsToken,
} from './auth'
import { OrckestraClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import {
  transformProduct,
  transformProductVariant,
  type RawOrckestraProduct,
} from './transform/product'
import { transformOrder, type RawOrckestraOrder } from './transform/order'

// ── Customer raw shape (minimal, for adapter use) ─────────────────────────────

interface RawOrckestraCustomer {
  Id: string
  FirstName?: string | null
  LastName?: string | null
  Email?: string | null
  PhoneNumber?: string | null
  CreatedDate?: string | null
  LastModifiedDate?: string | null
  [key: string]: unknown
}

function transformCustomer(raw: RawOrckestraCustomer): Customer {
  return {
    id: raw.Id,
    firstName: raw.FirstName ?? undefined,
    lastName: raw.LastName ?? undefined,
    email: raw.Email ?? undefined,
    phone: raw.PhoneNumber ?? undefined,
    createdAt: raw.CreatedDate ?? undefined,
    updatedAt: raw.LastModifiedDate ?? undefined,
    metadata: { raw },
  }
}

// ── Adapter config ────────────────────────────────────────────────────────────

export interface OrckestraAdapterConfig {
  /** OAuth2 client ID (server-to-server). */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** Full API base URL, e.g. `https://myinstance.orckestra.cloud/api`. */
  baseUrl?: string
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class OrckestraAdapter implements EcommerceAdapter {
  readonly platform = 'orckestra'
  readonly version = '0.1.0'

  private configClientId: string | undefined
  private configClientSecret: string | undefined
  private configBaseUrl: string | undefined

  constructor(config: OrckestraAdapterConfig = {}) {
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
    this.configBaseUrl = config.baseUrl
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return getAuthUrl(_state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return orckestraExchangeCode(_code, _redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Merge constructor config into extra so refreshCredentials has what it needs
    const merged = this.mergeCredentials(credentials)
    return orckestraRefreshCredentials(merged)
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  /**
   * Bootstrap credentials from constructor config via client_credentials grant.
   * Called when the adapter is configured directly (e.g. in tests or CLI).
   */
  async bootstrap(): Promise<Credentials> {
    const clientId = this.configClientId
    const clientSecret = this.configClientSecret
    const baseUrl = this.configBaseUrl
    if (!clientId || !clientSecret || !baseUrl) {
      throw new Error(
        'orckestra bootstrap: clientId, clientSecret, and baseUrl are required in config.',
      )
    }
    return requestClientCredentialsToken(clientId, clientSecret, baseUrl)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private mergeCredentials(credentials: Credentials): Credentials {
    const extra = { ...(credentials.extra ?? {}) }
    if (!extra['clientId'] && this.configClientId) extra['clientId'] = this.configClientId
    if (!extra['clientSecret'] && this.configClientSecret)
      extra['clientSecret'] = this.configClientSecret
    if (!extra['baseUrl'] && this.configBaseUrl) extra['baseUrl'] = this.configBaseUrl
    return { ...credentials, extra }
  }

  private clientFor(credentials: Credentials): OrckestraClient {
    return new OrckestraClient(this.mergeCredentials(credentials))
  }

  private buildListParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    if (params.limit != null) out['pageSize'] = params.limit
    else out['pageSize'] = DEFAULT_PAGE_SIZE
    if (typeof params.page === 'number' && params.page > 0) {
      out['page'] = params.page
    } else {
      out['page'] = 1
    }
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const res = await client.listPaginated<RawOrckestraProduct>(
      '/products',
      'Products',
      this.buildListParams(params),
    )
    return res.items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const raw = await client.get<RawOrckestraProduct>(`/products/${id}`)
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const body: Record<string, unknown> = {
      DisplayName: data.title,
      Description: data.description,
      IsActive: data.status === 'ACTIVE' || data.status == null,
      PrimaryParentCategoryId: data.productType ?? null,
    }
    const raw = await client.post<RawOrckestraProduct>('/products', body)
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const body: Record<string, unknown> = {}
    if (data.title != null) body['DisplayName'] = data.title
    if (data.description != null) body['Description'] = data.description
    if (data.status != null) body['IsActive'] = data.status === 'ACTIVE'
    if (data.productType != null) body['PrimaryParentCategoryId'] = data.productType
    const raw = await client.put<RawOrckestraProduct>(`/products/${id}`, body)
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    await client.delete(`/products/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const client = this.clientFor(credentials)
    const res = await client.listPaginated<RawOrckestraProduct>(
      '/products',
      'Products',
      this.buildListParams(params),
    )
    return res.items.map(transformProductVariant)
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Orckestra variant ids are `{productId}-v1` — strip suffix to get productId
    const client = this.clientFor(credentials)
    const productId = id.replace(/-v1$/, '')
    const raw = await client.get<RawOrckestraProduct>(`/products/${productId}`)
    return transformProductVariant(raw)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const client = this.clientFor(credentials)
    const res = await client.listPaginated<RawOrckestraCustomer>(
      '/customers',
      'Customers',
      this.buildListParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const client = this.clientFor(credentials)
    const raw = await client.get<RawOrckestraCustomer>(`/customers/${id}`)
    return transformCustomer(raw)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const client = this.clientFor(credentials)
    const body: Record<string, unknown> = {
      FirstName: data.firstName,
      LastName: data.lastName,
      Email: data.email,
      PhoneNumber: data.phone,
    }
    const raw = await client.post<RawOrckestraCustomer>('/customers', body)
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.clientFor(credentials)
    const body: Record<string, unknown> = {}
    if (data.firstName != null) body['FirstName'] = data.firstName
    if (data.lastName != null) body['LastName'] = data.lastName
    if (data.email != null) body['Email'] = data.email
    if (data.phone != null) body['PhoneNumber'] = data.phone
    const raw = await client.put<RawOrckestraCustomer>(`/customers/${id}`, body)
    return transformCustomer(raw)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    await client.delete(`/customers/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const res = await client.listPaginated<RawOrckestraOrder>(
      '/orders',
      'Orders',
      this.buildListParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const raw = await client.get<RawOrckestraOrder>(`/orders/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = this.clientFor(credentials)
    const body: Record<string, unknown> = {
      CustomerId: data.customerId,
      Email: data.email,
      Currency: data.currency,
      Notes: data.note,
    }
    const raw = await client.post<RawOrckestraOrder>('/orders', body)
    return transformOrder(raw)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = this.clientFor(credentials)
    const body: Record<string, unknown> = {}
    if (data.note != null) body['Notes'] = data.note
    if (data.email != null) body['Email'] = data.email
    const raw = await client.put<RawOrckestraOrder>(`/orders/${id}`, body)
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    const raw = await client.post<RawOrckestraOrder>(`/orders/${id}/cancel`, {
      Reason: _data?.reason ?? null,
    })
    return transformOrder(raw)
  }
}
