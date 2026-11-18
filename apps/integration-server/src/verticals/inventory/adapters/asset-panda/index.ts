/**
 * Asset Panda adapter for the inventory vertical.
 *
 * Asset Panda is a fixed-asset tracking platform. Its records (assets, and
 * the records of the "Locations" group) are group objects. The documented
 * GET /v3/groups sample lists groups such as { "name": "Assets", "key":
 * "asset_items" } and { "name": "Locations", "key": "locations" }
 * (https://team-asset-panda.readme.io/reference/get_v3-groups.md).
 *
 * The only documented way to read group objects is "Search objects",
 * POST /v3/groups/{group_id}/search/objects with `limit` and `offset` as query
 * parameters (https://team-asset-panda.readme.io/reference/post_v3-groups-group-id-search-objects.md).
 * Its OpenAPI block documents the 200 response only as
 *
 *   "200": { "description": "Successful response", "content": { "application/json": {} } }
 *
 * and the page shows request samples only. No row key, object field or
 * end-of-list signal is documented, so no Product, StockLevel or Location can
 * be built from it without guessing. Every read method therefore refuses with
 * 501 before sending anything.
 *
 * The methods used to post to /groups/{id}/search-objects (the ReadMe page
 * slug, not the API path) with limit/offset in the JSON body, after reading
 * `entities` from GET /v3/groups (documented key: "groups"), so against the
 * real API they always returned an empty list. getProduct/getStockLevel used
 * GET /v3/entity-objects/{id}, which the v3 endpoint index
 * (https://team-asset-panda.readme.io/llms.txt) does not list.
 *
 * Resources with no method here (suppliers, purchase orders, stock transfers,
 * stock adjustments) are optional in the interface, and the router answers 501
 * for them.
 */

import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'

import {
  credentialFields as assetPandaCredentialFields,
  exchangeCredentials as assetPandaExchangeCredentials,
  refreshCredentials as assetPandaRefreshCredentials,
  getAuthUrl,
} from './auth'

export interface AssetPandaAdapterConfig {
  /** No browser-redirect flow; config is a no-op placeholder. */
  clientId?: string
  clientSecret?: string
}

const SEARCH_OBJECTS_URL =
  'https://team-asset-panda.readme.io/reference/post_v3-groups-group-id-search-objects.md'

const UNDOCUMENTED_RESPONSE =
  `group objects are readable only through Search objects (POST /v3/groups/{group_id}/search/objects), ` +
  `whose 200 response is documented only as "Successful response", "content": { "application/json": {} } ` +
  `(${SEARCH_OBJECTS_URL})`

function cannotList(resource: string): Error {
  return Object.assign(new Error(`Asset Panda cannot list ${resource}: ${UNDOCUMENTED_RESPONSE}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

function cannotRead(resource: string): Error {
  return Object.assign(
    new Error(
      `Asset Panda cannot read a ${resource} by id: the v3 endpoint index ` +
        `(https://team-asset-panda.readme.io/llms.txt) documents no single-object GET, and ${UNDOCUMENTED_RESPONSE}`,
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

export class AssetPandaAdapter implements InventoryAdapter {
  readonly platform = 'asset-panda'
  readonly version = '0.1.0'

  constructor(_config: AssetPandaAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return assetPandaCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return assetPandaExchangeCredentials(fields)
  }

  getAuthUrl(state: string, scopes?: string[]): string {
    return getAuthUrl(state, scopes)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'asset-panda signs in with a user e-mail + password; use exchangeCredentials() instead',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return assetPandaRefreshCredentials(credentials)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  /** Refused: locations are objects of the "Locations" group; see the file header. */
  async listLocations(_credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    throw cannotList('locations')
  }

  /** Refused: see the file header. */
  async getLocation(_credentials: Credentials, _id: string): Promise<Location> {
    throw cannotRead('location')
  }

  // ── Products ──────────────────────────────────────────────────────────────

  /** Refused: assets are group objects; see the file header. */
  async listProducts(_credentials: Credentials, _params: QueryParams): Promise<Product[]> {
    throw cannotList('products')
  }

  /** Refused: see the file header. */
  async getProduct(_credentials: Credentials, _id: string): Promise<Product> {
    throw cannotRead('product')
  }

  // ── StockLevels ───────────────────────────────────────────────────────────

  /** Refused: quantities would come from group-object fields; see the file header. */
  async listStockLevels(_credentials: Credentials, _params: QueryParams): Promise<StockLevel[]> {
    throw cannotList('stock levels')
  }

  /** Refused: see the file header. */
  async getStockLevel(_credentials: Credentials, _id: string): Promise<StockLevel> {
    throw cannotRead('stock level')
  }
}
