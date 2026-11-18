/**
 * Zyro adapter for the ecommerce vertical.
 *
 * Maps the Zyro / Hostinger eCommerce REST API to the canonical ecommerce
 * resources. Zyro exposes a limited public API surface; methods that lack a
 * known API endpoint are omitted so the registry returns 501 automatically.
 *
 * Implemented resources:
 *  - Products (list, get)
 *  - Orders (list, get)
 *  - Auth (getAuthUrl, exchangeCode, refreshCredentials)
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unverified: collection   — api.zyro.com is inaccessible and Hostinger has no public ecommerce store management API; no collection/category endpoint documented
// Unverified: customer     — api.zyro.com is inaccessible and Hostinger has no public ecommerce store management API; no customer endpoint documented
// Unverified: discount     — api.zyro.com is inaccessible and Hostinger has no public ecommerce store management API; no discount endpoint documented
// Unverified: fulfillment  — api.zyro.com is inaccessible and Hostinger has no public ecommerce store management API; no fulfillment endpoint documented
// Unverified: inventory    — api.zyro.com is inaccessible and Hostinger has no public ecommerce store management API; no inventory endpoint documented
// Unverified: location     — api.zyro.com is inaccessible and Hostinger has no public ecommerce store management API; no location endpoint documented
// Unverified: refund       — api.zyro.com is inaccessible and Hostinger has no public ecommerce store management API; no refund endpoint documented
// Unverified: transaction  — api.zyro.com is inaccessible and Hostinger has no public ecommerce store management API; no transaction endpoint documented

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Order } from '../../schema/order'

import {
  getAuthUrl as buildAuthUrl,
  exchangeCode as zyroExchangeCode,
  refreshAccessToken,
} from './auth'
import { ZyroClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformProduct,
  type RawZyroProduct,
} from './transform/product'
import {
  transformOrder,
  type RawZyroOrder,
} from './transform/order'

export interface ZyroAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export class ZyroAdapter implements EcommerceAdapter {
  readonly platform = 'zyro'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string

  constructor(config: ZyroAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, state, overrideScopes)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return zyroExchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) {
      return credentials
    }
    return refreshAccessToken(
      credentials.refreshToken,
      this.clientId,
      this.clientSecret,
    )
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): ZyroClient {
    return new ZyroClient(credentials)
  }

  private listOpts(params: QueryParams): { page?: number; limit?: number } {
    return {
      page: typeof params.page === 'number' ? params.page : undefined,
      limit: typeof params.limit === 'number'
        ? params.limit
        : DEFAULT_PAGE_SIZE,
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const result = await this.client(credentials).list<RawZyroProduct>(
      '/v1/store/products',
      'products',
      this.listOpts(params),
    )
    return result.items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<{ product: RawZyroProduct } | RawZyroProduct>(
      `/v1/store/products/${id}`,
    )
    // Handle both envelope `{ product: {...} }` and bare product shapes
    const raw = 'product' in (res as Record<string, unknown>)
      ? (res as { product: RawZyroProduct }).product
      : (res as RawZyroProduct)
    return transformProduct(raw)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const result = await this.client(credentials).list<RawZyroOrder>(
      '/v1/store/orders',
      'orders',
      this.listOpts(params),
    )
    return result.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<{ order: RawZyroOrder } | RawZyroOrder>(
      `/v1/store/orders/${id}`,
    )
    const raw = 'order' in (res as Record<string, unknown>)
      ? (res as { order: RawZyroOrder }).order
      : (res as RawZyroOrder)
    return transformOrder(raw)
  }
}
