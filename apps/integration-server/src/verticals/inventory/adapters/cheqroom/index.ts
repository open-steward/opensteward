/**
 * Cheqroom adapter — equipment/asset tracking platform.
 *
 * Cheqroom tracks physical assets (cameras, tools, A/V gear, etc.) through
 * checkouts, reservations, and custody chains.  The public REST API (v2_5)
 * exposes equipment items and storage locations; it does not expose purchase
 * orders, stock transfers, stock adjustments, or suppliers as first-class
 * resources.
 *
 * Auth: single API key via `Authorization: Bearer <apiKey>`.
 * Pagination: `_skip` (offset) + `_limit` query params.
 * Schema-firewall: no cover/image attachments, no geo coordinates, no BOM.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Available:   location, product
 * Unavailable: purchase-order  — no procurement concept; v2_5 API has no purchase-order endpoint
 * Unavailable: stock-adjustment — Cheqroom tracks individual assets, not fungible quantities; no adjustment endpoint
 * Unavailable: stock-level     — individual asset tracking only; no quantity-on-hand endpoint
 * Unavailable: stock-transfer  — no inter-location transfer endpoint; custody changes use checkout/check-in orders
 * Unavailable: supplier        — no vendor/supplier concept or endpoint in v2_5 API
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Location } from '../../schema/location'

import {
  credentialFields as cheqroomCredentialFields,
  exchangeCredentials as cheqroomExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {CheqroomClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawCheqroomItem} from './transform/product'
import {transformLocation, type RawCheqroomLocation} from './transform/location'

// Cheqroom list endpoint response shape: { count: number; results: T[] }
interface CheqroomListResponse<T> {
  count?: number
  results?: T[]
  // Some endpoints wrap in data
  data?: T[]
}

export class CheqroomAdapter implements InventoryAdapter {
  readonly platform = 'cheqroom'
  readonly version = '0.1.0'

  constructor(_config?: Record<string, unknown>) {}

  credentialFields(): CredentialField[] {
    return cheqroomCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return cheqroomExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('cheqroom uses API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): CheqroomClient {
    return new CheqroomClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const skip = params.page ? (params.page - 1) * limit : 0
    return { _limit: limit, _skip: skip }
  }

  // ── Products (items) ──────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<CheqroomListResponse<RawCheqroomItem>>(
      '/items',
      this.listParams(params),
    )
    const items = res.results ?? res.data ?? []
    return items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawCheqroomItem>(`/items/${id}`)
    return transformProduct(raw)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<CheqroomListResponse<RawCheqroomLocation>>(
      '/locations',
      this.listParams(params),
    )
    const locations = res.results ?? res.data ?? []
    return locations.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawCheqroomLocation>(`/locations/${id}`)
    return transformLocation(raw)
  }
}
