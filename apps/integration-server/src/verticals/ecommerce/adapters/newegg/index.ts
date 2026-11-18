/**
 * Newegg Marketplace adapter for the ecommerce vertical.
 *
 * Maps Newegg's Marketplace REST APIs to the canonical ecommerce resources.
 * API key auth: API key (Authorization header) + secret key (SecretKey
 * header) + seller ID (query string), on a per-marketplace base path.
 *
 * Newegg's API natively uses XML but supports JSON via Accept/Content-Type
 * headers. This adapter always requests JSON.
 *
 * Slug: `newegg`
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: collection   — Newegg is a pure marketplace; no seller-side storefront collections exist in the API
 * Unavailable: customer     — No customer profile endpoints; buyer info is embedded in orders only
 * Unavailable: transaction  — Settlement transactions are async batch reports, not a direct REST resource endpoint
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Discount } from '../../schema/discount'
import type { Location } from '../../schema/location'

import { NeweggClient } from './client'
import { getSellerId } from './auth'
import { NEWEGG_FORM } from './connect-form'
import { transformDiscount, untransformDiscount } from './transform/discount'
import { transformLocation } from './transform/location'

export interface NeweggAdapterConfig {
  sellerId?: string
  secretKey?: string
}

// ── Response envelope types ───────────────────────────────────────────────────

interface NeweggWarehouseResponse {
  IsSuccess?: string
  ResponseBody?: {
    WarehouseList?: {
      Warehouse?: Array<{
        WarehouseLocation?: string
        Status?: number
        ShippingDestination?: string[]
        [key: string]: unknown
      }>
    }
  }
  [key: string]: unknown
}

interface NeweggVolumeDiscountResponse {
  IsSuccess?: string
  SellerPartNumber?: string
  NeweggItemNumber?: string
  VolumeActivation?: boolean
  DiscountSetting?: {
    Tier?: Array<{
      Priority?: number
      Quantity?: number
      SellingPrice?: number
      EnableFreeShipping?: number
      [key: string]: unknown
    }>
  }
  [key: string]: unknown
}

export class NeweggAdapter implements EcommerceAdapter {
  // Connect Link support — seller ID, API key, secret key, marketplace (see ./connect-form).
  credentialFields = NEWEGG_FORM.credentialFields
  exchangeCredentials = NEWEGG_FORM.exchangeCredentials

  readonly platform = 'newegg'
  readonly version = '0.1.0'

  private configSellerId: string | undefined
  private configSecretKey: string | undefined

  constructor(config: NeweggAdapterConfig = {}) {
    this.configSellerId = config.sellerId
    this.configSecretKey = config.secretKey
  }

  getAuthUrl(_state: string): string {
    throw new Error('Newegg uses API key auth — no user-facing auth URL.')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Newegg uses API key auth — exchangeCode is not applicable.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API key auth has no expiry — return credentials unchanged.
    return credentials
  }

  // ── Locations ──────────────────────────────────────────────────────────────
  // GET /sellermgmt/seller/warehouse?sellerid={sellerid}

  async listLocations(credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    const client = new NeweggClient(credentials)
    const sellerId = getSellerId(credentials)
    const resp = await client.get<NeweggWarehouseResponse>(
      `/sellermgmt/seller/warehouse?sellerid=${encodeURIComponent(sellerId)}`,
    )
    const warehouses = resp.ResponseBody?.WarehouseList?.Warehouse ?? []
    return warehouses.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const locations = await this.listLocations(credentials, {})
    const found = locations.find((l) => l.id === id)
    if (!found) throw new Error(`Newegg location not found: ${id}`)
    return found
  }

  // ── Discounts ──────────────────────────────────────────────────────────────
  // PUT /contentmgmt/item/volumediscount?sellerid={sellerid}
  // (OperationType=GetVolumeDiscountRequest, keyed by SellerPartNumber or NeweggItemNumber)

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = new NeweggClient(credentials)
    const sellerId = getSellerId(credentials)
    const resp = await client.put<NeweggVolumeDiscountResponse>(
      `/contentmgmt/item/volumediscount?sellerid=${encodeURIComponent(sellerId)}`,
      {
        OperationType: 'GetVolumeDiscountRequest',
        SellerPartNumber: id,
      },
    )
    return transformDiscount(resp)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const client = new NeweggClient(credentials)
    const sellerId = getSellerId(credentials)
    const body = untransformDiscount(data)
    const resp = await client.post<NeweggVolumeDiscountResponse>(
      `/contentmgmt/item/volumediscount?sellerid=${encodeURIComponent(sellerId)}`,
      body,
    )
    return transformDiscount(resp)
  }

  async updateDiscount(credentials: Credentials, id: string, data: Partial<Discount>): Promise<Discount> {
    // Newegg uses the same POST endpoint for create and update (upsert).
    return this.createDiscount(credentials, { ...data, id })
  }
}
