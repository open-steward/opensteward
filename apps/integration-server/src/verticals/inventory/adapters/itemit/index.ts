/**
 * itemit adapter — asset-tracking platform for the inventory vertical.
 *
 * itemit is a cloud asset-tracking tool. It tracks physical assets (items)
 * at named locations. There are no suppliers, purchase orders, stock transfers,
 * or stock adjustments in the itemit data model.
 *
 * Auth: four custom headers — X-Api-Key, X-User-Id, X-User-Token, X-Workspace-Id.
 * Docs: https://itemit.com/features/developer-api/
 */
// ── Resource coverage ──────────────────────────────────────────────
// Available:   location  — /location-profiles endpoint
// Available:   product   — /item-profiles/_search + /items/:id endpoints
// Unavailable: purchase-order   — no procurement workflow in itemit's data model
// Unavailable: stock-adjustment — no stock-adjustment endpoint; quantity changes are implicit in check-in/check-out
// Unavailable: stock-level      — no dedicated {productId,locationId,quantityOnHand} endpoint; only per-location _itemCount on location-profiles
// Unavailable: stock-transfer   — no transfer records; asset movement tracked via bookings, not transfer objects
// Unavailable: supplier         — no vendor/supplier management feature or endpoint
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Location } from '../../schema/location'

import {
  credentialFields as itemitCredentialFields,
  exchangeCredentials as itemitExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {ItemitClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawItemitItem} from './transform/product'
import {transformLocation, type RawItemitLocation} from './transform/location'
export type ItemitAdapterConfig = Record<string, never>

interface SearchResponse<T> { results?: T[]; total?: number }

export class ItemitAdapter implements InventoryAdapter {
  readonly platform = 'itemit'
  readonly version = '0.1.0'

  constructor(_config: ItemitAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return itemitCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return itemitExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('itemit uses static API credentials; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): ItemitClient {
    return new ItemitClient(credentials)
  }

  // ── Products (items) ────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const size = params.limit ?? DEFAULT_PAGE_SIZE
    const page = params.page ?? 1
    const res = await this.client(credentials).post<SearchResponse<RawItemitItem>>(
      `/item-profiles/_search?size=${size}&page=${page}`,
      {
        filters: [{ allOf: [] }],
        sorts: [{ sort: 'ITEM', by: { latestActivity: 'DESC' } }],
      }
    )
    return (res.results ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<RawItemitItem>(`/items/${id}`)
    return transformProduct(res)
  }

  // ── Locations ───────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const skip = params.page !== undefined ? (params.page - 1) * limit : 0
    const res = await this.client(credentials).get<SearchResponse<RawItemitLocation>>(
      '/location-profiles',
      { limit, skip }
    )
    return (res.results ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<RawItemitLocation>(`/location-profiles/${id}`)
    return transformLocation(res)
  }
}
