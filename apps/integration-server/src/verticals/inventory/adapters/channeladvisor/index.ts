/**
 * ChannelAdvisor (Rithum) inventory adapter.
 *
 * ChannelAdvisor is a multi-channel commerce platform. Its REST API v1
 * exposes Products and DistributionCenters; inventory quantities are
 * available as DCQuantities (per-DC available quantity) on Products.
 *
 * Auth: OAuth 2.0 authorization-code flow with refresh tokens.
 *   Token endpoint: https://api.channeladvisor.com/oauth2/token
 *   Credentials: applicationId (client_id) + sharedSecret (client_secret)
 *
 * Supported resources:
 *   - Products (list + get)
 *   - StockLevels (DCQuantities expanded from Products — list only)
 *   - Locations (DistributionCenters — list + get)
 *
 * Not available in CA REST API (auto-501):
 *   - Suppliers, PurchaseOrders, StockTransfers, StockAdjustments
 *
 * Schema-firewall: no product images, no supplier banking, no BOM.
 */
// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: purchase-order  — REST API v1 has no purchase-order endpoints; inbound procurement not exposed
// Unavailable: stock-adjustment — REST API v1 exposes only current DCQuantities; no adjustment history endpoint
// Unavailable: stock-transfer  — REST API v1 has no stock-transfer endpoints; inter-DC transfers not exposed
// Unavailable: supplier        — REST API v1 has no supplier endpoints; vendor management not part of the API
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'

import {
  credentialFields as caCredentialFields,
  exchangeCredentials as caExchangeCredentials,
  getAuthUrl as caGetAuthUrl,
  exchangeCode as caExchangeCode,
  refreshAccessToken,
} from './auth'
import {ChannelAdvisorClient} from './client'

import {
  transformProduct,
  type RawChannelAdvisorProduct,
  type RawChannelAdvisorDCQuantity,
} from './transform/product'
import {transformStockLevel} from './transform/stock-level'
import {
  transformLocation,
  type RawChannelAdvisorDistributionCenter,
} from './transform/location'

export interface ChanneladvisorAdapterConfig {
  applicationId: string
  sharedSecret: string
  redirectUri: string
  scopes?: string[]
}

export class ChanneladvisorAdapter implements InventoryAdapter {
  readonly platform = 'channeladvisor'
  readonly version = '0.1.0'

  private readonly config: ChanneladvisorAdapterConfig

  constructor(config: ChanneladvisorAdapterConfig) {
    this.config = config
  }

  credentialFields(): CredentialField[] {
    return caCredentialFields()
  }

  async exchangeCredentials(_fields: Record<string, string>): Promise<Credentials> {
    return caExchangeCredentials(_fields)
  }

  getAuthUrl(state: string, scopes?: string[]): string {
    return caGetAuthUrl(state, this.config.applicationId, scopes, this.config.redirectUri)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return caExchangeCode(
      code,
      redirectUri,
      this.config.applicationId,
      this.config.sharedSecret,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshAccessToken(credentials)
  }

  private client(credentials: Credentials): ChannelAdvisorClient {
    return new ChannelAdvisorClient(credentials)
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).getCollection<RawChannelAdvisorProduct>(
      '/Products',
      {
        ...ChannelAdvisorClient.pageParams(params),
        $expand: 'DCQuantities,Attributes',
      },
    )
    return (res.value ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<RawChannelAdvisorProduct>(
      `/Products(${id})`,
      { $expand: 'DCQuantities,Attributes' },
    )
    return transformProduct(res)
  }

  // ── Stock Levels (DCQuantities) ───────────────────────────────────────────

  /**
   * Fetches DCQuantities by expanding products.
   * Each product may have multiple DCQuantities (one per distribution center).
   */
  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).getCollection<RawChannelAdvisorProduct>(
      '/Products',
      {
        ...ChannelAdvisorClient.pageParams(params),
        $expand: 'DCQuantities',
        $select: 'ID',
      },
    )
    const levels: StockLevel[] = []
    for (const product of res.value ?? []) {
      for (const dc of product.DCQuantities ?? []) {
        levels.push(transformStockLevel(dc as RawChannelAdvisorDCQuantity))
      }
    }
    return levels
  }

  /** Stock-level fetch is bulk-only via product expansion. */
  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(
      `channeladvisor stock-level fetch is bulk-only via listStockLevels; id=${id}`,
    )
  }

  // ── Locations (Distribution Centers) ─────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).getCollection<RawChannelAdvisorDistributionCenter>(
      '/DistributionCenters',
      ChannelAdvisorClient.pageParams(params),
    )
    return (res.value ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<RawChannelAdvisorDistributionCenter>(
      `/DistributionCenters(${id})`,
    )
    return transformLocation(res)
  }
}
