import { CONNECT_FORM } from './connect-form'
// ── Resource coverage ──────────────────────────────────────────────
// See ./metadata.ts for the full, cited reasoning. Summary:
// Unavailable: variant — no single documented endpoint yields a valid price (required on the canonical shape).
// Unavailable: collection — Norce's Commerce Query has no Category entity, only a Product<->Category link record.
// Unavailable: location — Warehouse/WarehouseLocation schemas exist but are not exposed as a queryable entity set.
// Unavailable: inventory — on-hand stock is documented but reachable only via an undocumented OData function import.
// Unavailable: fulfillment, refund, transaction, discount — no documented entity/field schema found.
/**
 * Norce Commerce adapter for the ecommerce vertical.
 *
 * Maps Norce's Commerce Query (OData v4) read API to the canonical ecommerce
 * resources. Auth is OAuth2 client-credentials only — see `./auth.ts` and
 * `./connect-form.ts`. Every data call needs a bearer token AND a numeric
 * `ApplicationId` header (see `./client.ts`).
 *
 * Docs: https://docs.norce.io/api-reference
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'

import { buildInfoUrl, exchangeCode as norceExchangeCode, refreshCredentials as norceRefreshCredentials } from './auth'
import { NorceClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { transformProduct, type RawNorceProduct } from './transform/product'
import { transformCustomer, type RawNorceCustomer } from './transform/customer'
import { transformOrder, type RawNorceOrder } from './transform/order'

export interface NorceAdapterConfig {
  [key: string]: unknown
}

export class NorceAdapter implements EcommerceAdapter {
  readonly platform = 'norce'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // Connect Link support — see ./connect-form.ts for the fields collected.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  constructor(_config: NorceAdapterConfig = {}) {}

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(): string {
    return buildInfoUrl()
  }

  async exchangeCode(): Promise<Credentials> {
    return norceExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return norceRefreshCredentials(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): NorceClient {
    return new NorceClient(credentials)
  }

  private pageParams(params: QueryParams): { top: number; skip: number } {
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page && params.page > 0 ? params.page : 1
    return { top, skip: (page - 1) * top }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { top, skip } = this.pageParams(params)
    const res = await this.client(credentials).list<RawNorceProduct>('Products/Products', {
      top,
      skip,
      count: true,
    })
    reportUpstreamPage(params, {
      totalCount: res.totalCount,
      hasMore: res.totalCount != null ? skip + res.items.length < res.totalCount : undefined,
    })
    return res.items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).getById<RawNorceProduct>('Products/Products', id)
    return transformProduct(raw)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const { top, skip } = this.pageParams(params)
    const res = await this.client(credentials).list<RawNorceCustomer>('Customers/Customers', {
      top,
      skip,
      count: true,
    })
    reportUpstreamPage(params, {
      totalCount: res.totalCount,
      hasMore: res.totalCount != null ? skip + res.items.length < res.totalCount : undefined,
    })
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).getById<RawNorceCustomer>('Customers/Customers', id)
    return transformCustomer(raw)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { top, skip } = this.pageParams(params)
    const res = await this.client(credentials).list<RawNorceOrder>('Orders/Orders', {
      top,
      skip,
      count: true,
    })
    reportUpstreamPage(params, {
      totalCount: res.totalCount,
      hasMore: res.totalCount != null ? skip + res.items.length < res.totalCount : undefined,
    })
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.client(credentials).getById<RawNorceOrder>('Orders/Orders', id)
    return transformOrder(raw)
  }
}
