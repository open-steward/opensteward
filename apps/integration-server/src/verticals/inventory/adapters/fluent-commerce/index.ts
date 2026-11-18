/**
 * Fluent Commerce adapter — inventory vertical.
 *
 * Fluent Commerce is a cloud-native Distributed Order Management System (DOMS)
 * used primarily in omnichannel retail. It exposes a GraphQL API (POST only)
 * with cursor-based pagination.
 *
 * Auth: OAuth 2.0 resource-owner password grant via FLUENT_INTEGRATION client.
 *   Endpoint: https://{account}.{env}.api.fluentretail.com/oauth/token
 *   GraphQL:  https://{account}.{env}.api.fluentretail.com/graphql
 *
 * Supported resources:
 *   - Products   (variantProducts query)
 *   - StockLevels (inventoryPositions query)
 *   - Locations  (locations query)
 *
 * Not supported (no native Fluent API):
 *   - Suppliers, PurchaseOrders, StockTransfers, StockAdjustments
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: supplier        — Fluent Commerce has no Supplier entity; vendor
 *                                management is outside its OMS domain model.
 * Unavailable: purchase-order  — No PurchaseOrder entity in Fluent; procurement
 *                                is handled by upstream ERP/WMS systems.
 * Unavailable: stock-transfer  — No StockTransfer entity; inter-location moves
 *                                are not a first-class Fluent concept (Wave is
 *                                an order-picking batch, not a stock transfer).
 * Unavailable: stock-adjustment — No StockAdjustment entity; inventory corrections
 *                                 are applied directly to inventoryPosition via
 *                                 mutation but are not exposed as a queryable resource.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Webhooks: Fluent uses RSA SHA512 signing (not a shared HMAC secret).
 *   verifyWebhook / parseWebhookEvents are intentionally not implemented.
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'

import {
  credentialFields as fluentCredentialFields,
  exchangeCredentials as fluentExchangeCredentials,
  getAuthUrl as fluentGetAuthUrl,
  refreshCredentials as fluentRefreshCredentials,
} from './auth'
import {FluentCommerceClient} from './client'
import {DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, normaliseFluentAccount} from './constants'

import {transformProduct, type RawFluentCommerceProduct} from './transform/product'
import {
  READ_QUANTITY_TYPES,
  transformStockLevel,
  type RawFluentCommerceInventoryPosition,
} from './transform/stock-level'
import {transformLocation, type RawFluentCommerceLocation} from './transform/location'

// ── GraphQL response envelopes ─────────────────────────────────────────────

/**
 * A Relay-style connection as Fluent's schema reference types it. PageInfo
 * has only `hasPreviousPage` and `hasNextPage` — no `endCursor` — so the next
 * page starts after the last edge's `cursor`, which is what Fluent's own bulk
 * extract script does (`get_cursor`).
 *
 * Edges and nodes are nullable as the schema types them, e.g.
 * InventoryPositionConnection
 * (https://api.production.shared-sydney-01.fluentcommerce.com/graphql/docs/object/inventorypositionconnection/):
 * "edges ( [InventoryPositionEdge] ) A list of edges that links to
 * InventoryPosition type node".
 */
interface Connection<T> {
  edges?: Array<Edge<T> | null> | null
  pageInfo?: { hasNextPage?: boolean | null } | null
}

interface Edge<T> {
  node?: T | null
  cursor?: string | null
}

/** The three list queries, by their root field. */
type ListField = 'variantProducts' | 'inventoryPositions' | 'locations'

// ── GraphQL query strings ───────────────────────────────────────────────────

const VARIANT_PRODUCTS_QUERY = `
  query ListVariantProducts($first: Int!, $after: String) {
    variantProducts(first: $first, after: $after) {
      edges {
        cursor
        node {
          ref
          name
          gtin
          summary
          type
          status
          createdOn
          updatedOn
          prices {
            type
            value
            currency
          }
          attributes {
            name
            value
          }
          catalogue { ref }
        }
      }
      pageInfo { hasNextPage }
    }
  }
`

// Known gap: Fluent's schema requires `catalogue: ProductCatalogueKey!` on
// `variantProduct` (and `catalogue: InventoryCatalogueKey!` on
// `inventoryPosition` below), which these get queries do not send. Pre-existing
// and outside paging: list ids are bare refs, so the catalogue would have to be
// carried in the id or looked up.
const VARIANT_PRODUCT_QUERY = `
  query GetVariantProduct($ref: String!) {
    variantProduct(ref: $ref) {
      ref
      name
      gtin
      summary
      type
      status
      createdOn
      updatedOn
      prices {
        type
        value
        currency
      }
      attributes {
        name
        value
      }
      catalogue { ref }
    }
  }
`

/**
 * A position's quantities: only the types the stock-level transform reads,
 * as many as Fluent serves.
 *
 * Both arguments matter. Without `first`, a nested connection returns 10
 * records: "Clients can supply a first or last argument on any connection.
 * If the first and last are not provided, the default argument is the first
 * 10." (https://docs.fluentcommerce.com/essential-knowledge/graphql-query-limits).
 * A position with more than 10 quantity records then lost its RESERVED or
 * LAST_ON_HAND record. InventoryPosition.quantities takes "type [String!]"
 * and "first Int Returns the first n elements from the list"
 * (https://api.production.shared-sydney-01.fluentcommerce.com/graphql/docs/object/inventoryposition/).
 * A list value matches any of its entries: "Queries can also be refined by
 * passing multiple values for a given field. These can be specified in an
 * array. For instance, to find customers with a first name starting with
 * “_joh_” or ending with “_ti_”"
 * (https://docs.fluentcommerce.com/essential-knowledge/graphql-queries).
 *
 * Complexity: "The general principle is that Total Complexity equals the
 * number of queries to be executed." (graphql-query-limits). That page's
 * `orders(first: 5000)` example, with two nested connections, gives "Total
 * Complexity: 10,001". This query has one nested connection per position,
 * and its nodes select only scalars, so by that rule a page costs
 * 1 + first ≤ 5,001, the same as without the nested `first`. Do not split it
 * into one aliased connection per type, as Fluent's inventory-queries example
 * does: three of them at 5,000 positions come to 1 + 3 × 5,000 = 15,001, over
 * the 11,111 limit.
 *
 * The nested `first` is capped too: "If the first or last is greater than
 * 5,000, it will be reset to 5,000." The transform reads the first record of
 * each type, so a position would need more than 5,000 RESERVED records ahead
 * of its LAST_ON_HAND one to lose it, and that record is read only when
 * `onHand` is null.
 */
const QUANTITIES_SELECTION = `
  quantities(type: ${JSON.stringify(READ_QUANTITY_TYPES)}, first: ${MAX_PAGE_SIZE}) {
    edges {
      node {
        ref
        type
        quantity
        status
        updatedOn
      }
    }
  }
`

const INVENTORY_POSITIONS_QUERY = `
  query ListInventoryPositions($first: Int!, $after: String) {
    inventoryPositions(first: $first, after: $after) {
      edges {
        cursor
        node {
          ref
          productRef
          locationRef
          onHand
          status
          createdOn
          updatedOn
          ${QUANTITIES_SELECTION}
        }
      }
      pageInfo { hasNextPage }
    }
  }
`

const INVENTORY_POSITION_QUERY = `
  query GetInventoryPosition($ref: String!) {
    inventoryPosition(ref: $ref) {
      ref
      productRef
      locationRef
      onHand
      status
      createdOn
      updatedOn
      ${QUANTITIES_SELECTION}
    }
  }
`

const LOCATIONS_QUERY = `
  query ListLocations($first: Int!, $after: String) {
    locations(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          ref
          name
          type
          status
          createdOn
          updatedOn
          primaryAddress {
            name
            street
            city
            state
            postcode
            country
            region
          }
          attributes {
            name
            value
          }
        }
      }
      pageInfo { hasNextPage }
    }
  }
`

const LOCATION_QUERY = `
  query GetLocation($ref: String!) {
    location(ref: $ref) {
      id
      ref
      name
      type
      status
      createdOn
      updatedOn
      primaryAddress {
        name
        street
        city
        state
        postcode
        country
        region
      }
      attributes {
        name
        value
      }
    }
  }
`

// ── Paging ──────────────────────────────────────────────────────────────────

/**
 * `first` for a caller's limit: the limit itself, clamped to 1..5000. Fluent
 * silently replaces a larger `first` with 5000, so sending the caller's 6000
 * would page at 5000 while every judgement assumed 6000.
 */
function pageSize(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_PAGE_SIZE
  return Math.min(Math.max(Math.floor(limit), 1), MAX_PAGE_SIZE)
}

/**
 * The cursor that starts the next page: the last edge's `cursor` when
 * `hasNextPage` says there is one. A page that claims more rows but whose
 * last edge carries no cursor is refused: read as the end it would mark a
 * truncated collection complete, and an earlier edge's cursor would serve
 * rows twice.
 */
function nextCursor<T>(
  field: ListField,
  conn: Connection<T>,
  edges: ReadonlyArray<Edge<T> | null>,
): string | undefined {
  if (conn.pageInfo?.hasNextPage !== true) return undefined
  const cursor = edges[edges.length - 1]?.cursor
  if (typeof cursor === 'string' && cursor !== '') return cursor
  throw new Error(`fluent-commerce ${field}: hasNextPage is true but the page has no edge cursor`)
}

/**
 * The row an edge carries. A null edge or node is refused, not skipped. The
 * client already throws on any GraphQL `errors`, so a null here came back
 * with no error. Skipping it would drop a row from a page that the sync
 * worker can then mark complete. The nested quantities connection skips
 * nulls instead (transform/stock-level.ts): a missing quantity leaves a field
 * undefined but loses no row.
 */
function nodeOf<T>(field: ListField, edge: Edge<T> | null, index: number): T {
  const node = edge?.node
  if (node == null) throw new Error(`fluent-commerce ${field}: edge ${index} carried no node`)
  return node
}

// ── Adapter class ───────────────────────────────────────────────────────────

export type FluentCommerceAdapterConfig = Record<string, never>

export class FluentCommerceAdapter implements InventoryAdapter {
  readonly platform = 'fluent-commerce'
  readonly version = '0.1.0'
  /** Every list method pages by cursor at `first` = the limit, up to 5000. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config?: FluentCommerceAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return fluentCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return fluentExchangeCredentials(fields)
  }

  getAuthUrl(state: string, _scopes?: string[]): string {
    return fluentGetAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('fluent-commerce uses OAuth2 password grant; use credentialFields() + exchangeCredentials() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return fluentRefreshCredentials(credentials)
  }

  private client(credentials: Credentials): FluentCommerceClient {
    return new FluentCommerceClient(credentials)
  }

  /**
   * One caller page of a list query: the caller's 1-based `page` at `first`
   * = the caller's limit, walked through the cursor chain by the shared pager.
   *
   * The walk is keyed by the connection (account, environment and a
   * fingerprint of its refresh token), never by the access token alone,
   * which Fluent rotates every 30 minutes, nor by the account alone, which
   * several connections can share. `first` is part of the key because a
   * cursor minted at one size is a different position at another.
   */
  private async listPage<T>(
    credentials: Credentials,
    params: QueryParams,
    field: ListField,
    query: string,
  ): Promise<T[]> {
    const account = normaliseFluentAccount(credentials.extra?.['accountId'], credentials.extra?.['env'])
    const client = this.client(credentials)
    const first = pageSize(params.limit)
    const scope = connectionScope(
      `fluent-commerce:${account.accountId.toLowerCase()}:${account.env}`,
      credentials,
    )
    const key = cursorPagerKey(scope, field, { first })
    const page = await pageByCursor<T, string>(key, params.page, async (after) => {
      const data = await client.query<Partial<Record<ListField, Connection<T>>>>(query, {
        first,
        ...(after !== undefined ? { after } : {}),
      })
      const conn = data?.[field]
      if (!conn) throw new Error(`fluent-commerce ${field}: response carried no connection`)
      const edges = conn.edges ?? []
      return {
        items: edges.map((e, i) => nodeOf(field, e, i)),
        next: nextCursor(field, conn, edges),
      }
    })
    reportUpstreamPage(params, {
      hasMore: page.hasMore,
      // A direct call past the documented maximum pages at 5000, not at its limit.
      ...(typeof params.limit === 'number' && first < params.limit ? { pageSize: first } : {}),
    })
    return page.items
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const rows = await this.listPage<RawFluentCommerceProduct>(
      credentials,
      params,
      'variantProducts',
      VARIANT_PRODUCTS_QUERY,
    )
    return rows.map((r) => transformProduct(r))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const data = await this.client(credentials).query<{ variantProduct: RawFluentCommerceProduct | null }>(
      VARIANT_PRODUCT_QUERY,
      { ref: id },
    )
    if (!data.variantProduct) throw new Error(`fluent-commerce product ref=${id} not found`)
    return transformProduct(data.variantProduct)
  }

  // ── StockLevels ───────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const rows = await this.listPage<RawFluentCommerceInventoryPosition>(
      credentials,
      params,
      'inventoryPositions',
      INVENTORY_POSITIONS_QUERY,
    )
    return rows.map((r) => transformStockLevel(r))
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    const data = await this.client(credentials).query<{ inventoryPosition: RawFluentCommerceInventoryPosition | null }>(
      INVENTORY_POSITION_QUERY,
      { ref: id },
    )
    if (!data.inventoryPosition) throw new Error(`fluent-commerce inventoryPosition ref=${id} not found`)
    return transformStockLevel(data.inventoryPosition)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const rows = await this.listPage<RawFluentCommerceLocation>(
      credentials,
      params,
      'locations',
      LOCATIONS_QUERY,
    )
    return rows.map((r) => transformLocation(r))
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const data = await this.client(credentials).query<{ location: RawFluentCommerceLocation | null }>(
      LOCATION_QUERY,
      { ref: id },
    )
    if (!data.location) throw new Error(`fluent-commerce location ref=${id} not found`)
    return transformLocation(data.location)
  }
}
