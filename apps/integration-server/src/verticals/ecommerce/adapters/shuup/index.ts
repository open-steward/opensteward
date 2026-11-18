import { simpleApiKey } from '@opensteward/shared'
// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: discount    — No DRF viewset under /api/v1/shuup/discount/; discount/campaign management is admin-UI-only.
// Unavailable: refund      — Refund creation is an action on orders (POST /api/v1/shuup/order/{id}/create_refund/); no list/get refund endpoint exists.
// Unavailable: transaction — No /api/v1/shuup/payment/ or /api/v1/shuup/transaction/ DRF endpoint registered.

/**
 * Shuup adapter for the ecommerce vertical.
 *
 * Maps the Shuup DRF REST API (`/api/v1/shuup/`) to the canonical ecommerce
 * resources. Shuup is an open-source Python/Django ecommerce and marketplace
 * platform that uses a static DRF token sent via the `Authorization` header.
 * There is no OAuth code-exchange flow.
 *
 * Required credentials:
 *  - `accessToken` = DRF auth token (from `POST /api/v1/auth/`)
 *  - `extra.baseUrl` = full base URL of the Shuup store
 *    (e.g. `https://myshop.example.com`)
 *
 * Implemented resources: products, collections (categories), orders, customers,
 * fulfillments (from shipments endpoint), inventory levels (from stock_count),
 * and locations (derived from suppliers).
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'

import {
  getAuthUrl as shuupGetAuthUrl,
  exchangeCode as shuupExchangeCode,
  refreshCredentials as shuupRefreshCredentials,
} from './auth'
import { ShuupClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import {
  transformProduct,
  untransformProduct,
  type ShuupProduct,
} from './transform/product'
import { transformOrder, type ShuupOrder } from './transform/order'
import { transformCustomer, type ShuupContact } from './transform/customer'
import { transformFulfillment, type ShuupShipment } from './transform/fulfillment'
import { transformInventoryLevel, type ShuupStockCount } from './transform/inventory'

// ── Collection (category) raw shape ──────────────────────────────────────────

export interface ShuupCategory {
  id: number | string
  name?: Record<string, string> | string | null
  description?: Record<string, string> | string | null
  parent?: number | string | null
  status?: number | null
  [key: string]: unknown
}

function pickTranslation(field: Record<string, string> | string | null | undefined): string {
  if (!field) return ''
  if (typeof field === 'string') return field
  return field['en'] ?? Object.values(field)[0] ?? ''
}

function transformCollection(raw: ShuupCategory): Collection {
  return {
    id: String(raw.id),
    title: pickTranslation(raw.name) || String(raw.id),
    description: raw.description ? pickTranslation(raw.description) || undefined : undefined,
    type: 'MANUAL',
    productIds: [],
    metadata: raw as Record<string, unknown>,
  }
}

// ── Supplier (location) raw shape ─────────────────────────────────────────────

export interface ShuupSupplier {
  id: number | string
  name?: string | null
  enabled?: boolean | null
  module_identifier?: string | null
  [key: string]: unknown
}

function transformLocation(raw: ShuupSupplier): Location {
  return {
    id: String(raw.id),
    name: raw.name ?? String(raw.id),
    active: raw.enabled ?? undefined,
    isFulfillmentCenter: true,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Adapter ───────────────────────────────────────────────────────────────────
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ShuupAdapter implements EcommerceAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'shuup'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return shuupGetAuthUrl(state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return shuupExchangeCode(code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return shuupRefreshCredentials(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): ShuupClient {
    return new ShuupClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page != null) out['page'] = params.page
    if (params.search) out['search'] = params.search
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<ShuupProduct>(
      client.shuupPath('product'),
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const raw = await client.get<ShuupProduct>(client.shuupPath(`product/${id}`))
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const raw = await client.post<ShuupProduct>(
      client.shuupPath('product'),
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const raw = await client.patch<ShuupProduct>(
      client.shuupPath(`product/${id}`),
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    await client.delete(client.shuupPath(`product/${id}`))
  }

  // ── Collections (categories) ──────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<ShuupCategory>(
      client.shuupPath('category'),
      this.listParams(params),
    )
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.clientFor(credentials)
    const raw = await client.get<ShuupCategory>(client.shuupPath(`category/${id}`))
    return transformCollection(raw)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<ShuupOrder>(
      client.shuupPath('order'),
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const raw = await client.get<ShuupOrder>(client.shuupPath(`order/${id}`))
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    // Shuup orders are cancelled by setting status to 'cancelled'
    const raw = await client.patch<ShuupOrder>(client.shuupPath(`order/${id}`), {
      status: { identifier: 'cancelled' },
    })
    return transformOrder(raw)
  }

  // ── Customers (contacts) ──────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<ShuupContact>(
      client.shuupPath('contact'),
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const client = this.clientFor(credentials)
    const raw = await client.get<ShuupContact>(client.shuupPath(`contact/${id}`))
    return transformCustomer(raw)
  }

  // ── Fulfillments (shipments) ──────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<ShuupShipment>(
      client.shuupPath('shipment'),
      this.listParams(params),
    )
    return res.items.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const raw = await client.get<ShuupShipment>(client.shuupPath(`shipment/${id}`))
    return transformFulfillment(raw)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<ShuupStockCount>(
      client.shuupPath('stock_count'),
      this.listParams(params),
    )
    return res.items.map(transformInventoryLevel)
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // id = `${productId}:default:${supplierId}` — first segment is the stock_count id
    const stockCountId = id.split(':')[0]!
    const client = this.clientFor(credentials)
    const raw = await client.get<ShuupStockCount>(client.shuupPath(`stock_count/${stockCountId}`))
    return transformInventoryLevel(raw)
  }

  // ── Locations (suppliers) ─────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<ShuupSupplier>(
      client.shuupPath('supplier'),
      this.listParams(params),
    )
    return res.items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const client = this.clientFor(credentials)
    const raw = await client.get<ShuupSupplier>(client.shuupPath(`supplier/${id}`))
    return transformLocation(raw)
  }
}
