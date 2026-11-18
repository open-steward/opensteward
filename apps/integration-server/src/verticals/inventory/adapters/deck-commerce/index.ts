/**
 * Deck Commerce OMS adapter.
 *
 * Deck Commerce publishes no API reference. The only first-party contract is
 * its own published integration code — the Magento module
 * (github.com/DeckCommerce/magento) and the Salesforce Commerce Cloud cartridge
 * (github.com/DeckCommerce/SalesforceCommerceCloud) — and this adapter follows
 * them. The inventory API there is `api/PimInventoryLookup` (Magento
 * etc/config.xml `<api_name>api/PimInventoryLookup</api_name>`): a lookup of the
 * SKUs named in the request, with no paging fields and no way to ask for the
 * whole catalog. Full-catalog inventory reaches integrators as SFTP feed files,
 * not over REST. So a stock level can be read by SKU, and the stock-level
 * collection cannot be listed.
 *
 * Auth: per-request SHA-256 token.
 *   token = UPPERCASE( HEX( sha256( lowercase(apiName) + timestampUTC + siteApiKey ) ) )
 *   Sent as: Authorization header and apiVersion: 5 header.
 *   Request body also carries: VerificationKey, TimestampUTC, SiteCode.
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { StockLevel } from '../../schema/stock-level'

import {
  credentialFields as deckCommerceCredentialFields,
  exchangeCredentials as deckCommerceExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { DeckCommerceClient } from './client'
import { expandStockLevels, type RawDeckCommerceStockLevel } from './transform/stock-level'

/** The vendor's default inventory API name (Magento etc/config.xml). */
export const DEFAULT_INVENTORY_API_NAME = 'api/PimInventoryLookup'

export interface DeckCommerceAdapterConfig {
  /**
   * The inventory API name as configured for the Deck Commerce site. The
   * vendor's Magento module makes this a setting ("Deck Commerce Inventory API
   * Name") defaulting to "api/PimInventoryLookup".
   */
  inventoryCheckApiName?: string
  /**
   * The Deck Commerce inventory feed name sent as `InventoryFeedName` with every
   * SKU looked up. The vendor's Magento module requires it ("Inventory Feed
   * Name", `required-entry`); Deck Commerce issues it per site.
   */
  inventoryFeedName?: string
}

interface InventoryLookupResponse {
  Items?: RawDeckCommerceStockLevel[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class DeckCommerceAdapter implements InventoryAdapter {
  readonly platform = 'deck-commerce'
  readonly version = '0.1.0'

  private readonly inventoryCheckApiName: string | undefined
  private readonly inventoryFeedName: string | undefined

  constructor(config: DeckCommerceAdapterConfig = {}) {
    // Unset or blank falls back to the vendor default. Anything else must pass
    // the vendor's own validation for the field (system.xml api_name:
    // `required-entry no-whitespace`); an invalid value is refused at call time.
    const apiName: unknown = config.inventoryCheckApiName
    if (apiName === undefined || (typeof apiName === 'string' && apiName.trim() === '')) {
      this.inventoryCheckApiName = DEFAULT_INVENTORY_API_NAME
    } else if (typeof apiName === 'string' && !/\s/.test(apiName)) {
      this.inventoryCheckApiName = apiName
    } else {
      this.inventoryCheckApiName = undefined
    }
    const feed = typeof config.inventoryFeedName === 'string' ? config.inventoryFeedName.trim() : ''
    this.inventoryFeedName = feed === '' ? undefined : feed
  }

  credentialFields(): CredentialField[] {
    return deckCommerceCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return deckCommerceExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('deck-commerce uses HMAC per-request tokens; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Tokens are computed per-request; no refresh needed
    return credentials
  }

  private client(credentials: Credentials): DeckCommerceClient {
    return new DeckCommerceClient(credentials)
  }

  // ── StockLevels ─────────────────────────────────────────────────────────────

  /**
   * Refused before anything is sent. The vendor's inventory API looks up the
   * SKUs named in the request — its request is only
   * `{"Items": [{"InventoryFeedName": ..., "SKU": ...}]}`, with no paging
   * fields — and the vendor's own client refuses to call it without SKUs
   * (Model/Import/InventoryCheck.php: `if (empty($skus)) { return null; }`).
   */
  async listStockLevels(_credentials: Credentials, _params: QueryParams): Promise<StockLevel[]> {
    throw notSupported(
      'Deck Commerce cannot list stock levels: its inventory API (api/PimInventoryLookup) only looks up ' +
        'the SKUs named in the request ({"Items": [{"InventoryFeedName", "SKU"}]}, no paging fields), and ' +
        'full-catalog inventory is delivered by SFTP feed, not REST. Read one SKU with GET /stock-levels/:id.',
    )
  }

  /** id is `<SKU>` or `<SKU>:<WarehouseCode>`, as expandStockLevels builds ids. */
  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    if (this.inventoryFeedName === undefined) {
      throw notSupported(
        "Deck Commerce stock lookups need the site's inventory feed name: set the deck-commerce adapter " +
          'setting "inventoryFeedName" (sent as InventoryFeedName with each SKU).',
      )
    }
    const apiName = this.inventoryCheckApiName
    if (apiName === undefined) {
      throw notSupported(
        'Deck Commerce stock lookups need a valid inventory API name: the deck-commerce adapter setting ' +
          '"inventoryCheckApiName" must be a string without whitespace (default api/PimInventoryLookup).',
      )
    }
    const separator = id.indexOf(':')
    const sku = separator === -1 ? id : id.slice(0, separator)
    const res = await this.client(credentials).post<InventoryLookupResponse>(apiName, {
      Items: [{ InventoryFeedName: this.inventoryFeedName, SKU: sku }],
    })
    const levels = (res.Items ?? []).flatMap(expandStockLevels)
    if (separator !== -1) {
      const warehouseCode = id.slice(separator + 1)
      const match = levels.find((l) => l.locationId === warehouseCode)
      if (match) return match
    } else if (levels.length > 0) {
      return levels[0]!
    }
    throw Object.assign(new Error(`deck-commerce: stock level not found for id=${id}`), {
      statusCode: 404,
    })
  }
}
