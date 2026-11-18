/**
 * Listing Mirror adapter — multi-channel e-commerce listing + inventory sync.
 *
 * Auth: HTTP Basic (username + API token from Integrations > API).
 * Supported resources: products (with variations), inventory/stock-levels.
 * Webhooks: not exposed via documented HMAC/JWT signing; omitted.
 *
 * API docs: https://api.listingmirror.com/api/v3/guide/
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: location        — no warehouse/location endpoint; inventory is account-wide per SKU with no per-location breakdown
// Unavailable: supplier        — no supplier endpoint; supplier management is not part of the platform's data model
// Unavailable: purchase-order  — no purchase order endpoint; platform focuses on listing syndication/order fulfillment, not procurement
// Unavailable: stock-transfer  — no stock transfer endpoint; inter-location transfers are not supported in the API
// Unavailable: stock-adjustment — no stock adjustment endpoint; inventory changes applied via PATCH /v3/inventory/ with no adjustment audit trail

import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'

import {
  credentialFields as listingMirrorCredentialFields,
  exchangeCredentials as listingMirrorExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {ListingMirrorClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {
  transformProduct,
  transformVariation,
  type RawListingMirrorProduct,
} from './transform/product'
import {transformStockLevel, type RawListingMirrorInventory} from './transform/stock-level'

export interface ListingMirrorAdapterConfig {
  // No OAuth; config object kept for structural parity with other adapters.
  [key: string]: unknown
}

interface PagedResponse<T> {
  data?: T[]
  pagination?: { page?: number; pages?: number; count?: number; pageSize?: number }
  errors?: unknown[]
}

export class ListingMirrorAdapter implements InventoryAdapter {
  readonly platform = 'listing-mirror'
  readonly version = '0.1.0'

  constructor(_config: ListingMirrorAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return listingMirrorCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return listingMirrorExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('listing-mirror uses static API key; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): ListingMirrorClient {
    return new ListingMirrorClient(credentials)
  }

  private pageParam(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { page: params.page } : {}),
    }
  }

  // ── Products ─────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<PagedResponse<RawListingMirrorProduct>>(
      '/products/',
      this.pageParam(params),
    )
    const products: Product[] = []
    for (const raw of res.data ?? []) {
      const parent = transformProduct(raw)
      products.push(parent)
      for (const variation of raw.variations ?? []) {
        products.push(transformVariation(variation, parent.id))
      }
    }
    return products
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<{ data?: RawListingMirrorProduct }>(
      `/products/${id}/`,
    )
    if (!res.data) throw new Error(`listing-mirror product ${id} not found`)
    return transformProduct(res.data)
  }

  // ── Stock Levels ──────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<PagedResponse<RawListingMirrorInventory>>(
      '/inventory/',
      this.pageParam(params),
    )
    return (res.data ?? []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`listing-mirror stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }
}
