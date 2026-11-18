/**
 * Nacelle adapter for the ecommerce vertical.
 *
 * Nacelle is a composability/data layer, NOT a store: it indexes catalog data
 * one-way (read-only) from a backend commerce platform (typically Shopify)
 * and adds its own order-management layer, NOMS. Writing a product back
 * through Nacelle's Ingest API does not change the merchant's real store, so
 * product/variant/collection are read-only here — no create/update/delete.
 *
 * Docs used (see individual methods/files for the exact page cited):
 *   https://docs.nacelle.com/docs/storefront-graphql-api-stable
 *   https://docs.nacelle.com/docs/auth-storefront
 *   https://docs.nacelle.com/docs/product-data-model
 *   https://docs.nacelle.com/docs/variant-data-model
 *   https://docs.nacelle.com/docs/content-data-model
 *   https://docs.nacelle.com/docs/noms-introduction
 *   https://docs.nacelle.com/reference/noms-graphql
 *   https://docs.nacelle.com/docs/noms-authentication (webhook signature)
 *
 * Supported: products, variants, collections (read, Storefront GraphQL);
 * createOrder (write, NOMS REST — the one NOMS operation with a fully
 * documented endpoint/headers/body).
 *
 * NOT supported (see metadata.ts for the full per-resource reasons):
 *   product/variant/collection writes — Nacelle's Ingest API writes catalog
 *     data into Nacelle's OWN index, never into the merchant's real store.
 *   order reads, customer, fulfillment, transaction — NOMS Admin GraphQL
 *     documents the schema and required headers
 *     (https://docs.nacelle.com/reference/noms-graphql) but no page in
 *     Nacelle's public docs states the endpoint URL those queries are
 *     POSTed to. Implementing a client against a guessed hostname would
 *     silently fail for every customer, so these are left unimplemented
 *     rather than guessed.
 *   refund — no `Refund` type or field exists anywhere in the documented
 *     NOMS schema.
 *   location, inventory, discount — no corresponding entity is documented
 *     in either the Storefront GraphQL or NOMS Admin GraphQL schema.
 */

import { customForm } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { cursorPagerKey, pageByCursor, reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Order, LineItem } from '../../schema/order'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as nacelleExchangeCode } from './auth'
import { NacelleNomsClient, NacelleStorefrontClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyNacelleWebhook, parseNacelleWebhookEvents } from './webhook'
import {
  transformProduct,
  transformVariant,
  type RawNacelleProduct,
} from './transform/product'
import { transformCollection, type RawNacelleCollection } from './transform/collection'

// ── Connect Link form (spaceId + Private Access Token) ──────────────────────

const NACELLE_FORM = customForm({
  fields: [
    {
      name: 'spaceId',
      label: 'Space ID',
      type: 'text',
      required: true,
      helpText: 'Found in the Nacelle dashboard under Space Settings → API Details.',
    },
    {
      name: 'accessToken',
      label: 'Private Access Token',
      type: 'password',
      required: true,
      helpText:
        'Generated from Client Credentials (Space Settings → API Details). See ' +
        'https://docs.nacelle.com/docs/auth-credentials.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const spaceId = (fields['spaceId'] ?? '').trim()
    const accessToken = (fields['accessToken'] ?? '').trim()
    if (!spaceId || !accessToken) {
      throw new Error('Space ID and Private Access Token are both required.')
    }
    return { accessToken, extra: { spaceId } }
  },
})

// ── GraphQL: Storefront catalog reads ───────────────────────────────────────

const PRODUCT_FIELDS = `
  nacelleEntryId
  sourceEntryId
  sourceId
  availableForSale
  vendor
  productType
  tags
  createdAt
  updatedAt
  content {
    title
    description
    handle
    locale
    media { id url alt width height position }
    options { name values }
    published
  }
  variants {
    nacelleEntryId
    productEntryId
    sku
    price
    priceCurrency
    compareAtPrice
    weight
    weightUnit
    quantityAvailable
    availableForSale
    variantPosition
    content { title locale }
  }
`

const COLLECTION_FIELDS = `
  nacelleEntryId
  sourceEntryId
  sourceId
  tags
  createdAt
  updatedAt
  content {
    title
    description
    handle
    locale
    featuredMedia { id url alt }
  }
`

/**
 * `filter` input type name is not stated verbatim anywhere in Nacelle's public
 * docs for `allProducts`/`allProductCollections` — inferred by analogy with
 * the one fully-documented example (`allContent($filter: ContentFilterInput)`
 * — https://docs.nacelle.com/docs/storefront-graphql-api-stable). The
 * queried FIELDS above (Product/Variant/Content shapes) and the
 * pagination/auth mechanics ARE verbatim from the docs cited in index.ts's
 * header comment.
 */
const ALL_PRODUCTS_QUERY = `
  query AllProducts($first: Int!, $after: String, $nacelleEntryIds: [ID!]) {
    allProducts(filter: { first: $first, after: $after, nacelleEntryIds: $nacelleEntryIds }) {
      pageInfo { hasNextPage endCursor }
      edges { node { ${PRODUCT_FIELDS} } }
    }
  }
`

const ALL_COLLECTIONS_QUERY = `
  query AllProductCollections($first: Int!, $after: String, $nacelleEntryIds: [ID!]) {
    allProductCollections(filter: { first: $first, after: $after, nacelleEntryIds: $nacelleEntryIds }) {
      pageInfo { hasNextPage endCursor }
      edges { node { ${COLLECTION_FIELDS} } }
    }
  }
`

interface Edge<T> {
  node: T
}
interface Connection<T> {
  pageInfo: { hasNextPage: boolean; endCursor?: string | null }
  edges: Edge<T>[]
}
interface AllProductsResponse {
  allProducts: Connection<RawNacelleProduct>
}
interface AllProductCollectionsResponse {
  allProductCollections: Connection<RawNacelleCollection>
}

export interface NacelleAdapterConfig {
  spaceId?: string
}

export class NacelleAdapter implements EcommerceAdapter {
  readonly platform = 'nacelle'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // Connect Link support
  credentialFields = NACELLE_FORM.credentialFields
  exchangeCredentials = NACELLE_FORM.exchangeCredentials

  private configSpaceId: string | undefined

  constructor(config: NacelleAdapterConfig = {}) {
    this.configSpaceId = config.spaceId
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(): string {
    return buildAuthUrl()
  }

  async exchangeCode(): Promise<Credentials> {
    return nacelleExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // No documented refresh flow for a Private Access Token used directly
    // (as opposed to the client-credentials exchange that mints one) — see
    // constants.ts. Returned unchanged, matching every other adapter here
    // that has no verified refresh mechanism.
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyNacelleWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseNacelleWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private spaceId(credentials: Credentials): string {
    const fromExtra = credentials.extra?.['spaceId']
    const spaceId = (typeof fromExtra === 'string' ? fromExtra : undefined) ?? this.configSpaceId
    if (!spaceId) {
      throw new Error(
        'Nacelle adapter is missing spaceId — configure it in ' +
          'apps/integration-server/config/config.yml under adapters.nacelle, ' +
          'or POST it to /v1/connections with credentials: { spaceId, accessToken }.',
      )
    }
    return spaceId
  }

  private storefront(credentials: Credentials): NacelleStorefrontClient {
    return new NacelleStorefrontClient(credentials, this.spaceId(credentials))
  }

  private noms(credentials: Credentials): NacelleNomsClient {
    return new NacelleNomsClient(credentials, this.spaceId(credentials))
  }

  /** Stable per-connection scope for cursor keys — the space id, never the token. */
  private pagerScope(credentials: Credentials): string {
    return `nacelle:${this.spaceId(credentials)}`
  }

  private clampLimit(limit: number | undefined): number {
    return Math.min(Math.max(1, limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
  }

  /** One page of `allProducts`, resolving the worker's numeric `page` through the cursor pager. */
  private async productsPage(
    credentials: Credentials,
    params: QueryParams,
    nacelleEntryIds?: string[],
  ): Promise<{ items: RawNacelleProduct[]; hasMore: boolean }> {
    const client = this.storefront(credentials)
    const first = this.clampLimit(params.limit)
    const key = cursorPagerKey(this.pagerScope(credentials), 'allProducts', {
      first,
      nacelleEntryIds,
    })
    const result = await pageByCursor<RawNacelleProduct, string>(key, params.page, async (after) => {
      const res = await client.query<AllProductsResponse>(ALL_PRODUCTS_QUERY, {
        first,
        after,
        nacelleEntryIds,
      })
      const conn = res.allProducts
      return {
        items: conn.edges.map((e) => e.node),
        next: conn.pageInfo.hasNextPage ? (conn.pageInfo.endCursor ?? undefined) : undefined,
      }
    })
    return result
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const page = await this.productsPage(credentials, params)
    reportUpstreamPage(params, { hasMore: page.hasMore })
    return page.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const page = await this.productsPage(credentials, { limit: 1 }, [id])
    const raw = page.items[0]
    if (!raw) throw new Error(`Nacelle product not found: ${id}`)
    return transformProduct(raw)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['product_id']
    if (productId) {
      const page = await this.productsPage(credentials, { limit: 1 }, [String(productId)])
      const raw = page.items[0]
      return (raw?.variants ?? []).map((v) => transformVariant(v))
    }
    // No unscoped variant list — flatten variants from a page of products,
    // like the Shopify reference adapter's fallback. The page's end is the
    // products' end (reported below), not how many variants it held.
    const page = await this.productsPage(credentials, params)
    reportUpstreamPage(params, { hasMore: page.hasMore })
    return page.items.flatMap((p) => (p.variants ?? []).map((v) => transformVariant(v)))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Composite id `productId:variantId` — Nacelle has no root query to fetch
    // a single variant by its own id (only `allProducts(filter:{nacelleEntryIds})`).
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    const page = await this.productsPage(credentials, { limit: 1 }, [productId])
    const raw = page.items[0]?.variants?.find((v) => v.nacelleEntryId === variantId)
    if (!raw) throw new Error(`Nacelle variant not found: ${id}`)
    return transformVariant(raw)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const client = this.storefront(credentials)
    const first = this.clampLimit(params.limit)
    const key = cursorPagerKey(this.pagerScope(credentials), 'allProductCollections', { first })
    const result = await pageByCursor<RawNacelleCollection, string>(key, params.page, async (after) => {
      const res = await client.query<AllProductCollectionsResponse>(ALL_COLLECTIONS_QUERY, {
        first,
        after,
      })
      const conn = res.allProductCollections
      return {
        items: conn.edges.map((e) => e.node),
        next: conn.pageInfo.hasNextPage ? (conn.pageInfo.endCursor ?? undefined) : undefined,
      }
    })
    reportUpstreamPage(params, { hasMore: result.hasMore })
    return result.items.map((c) => transformCollection(c))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.storefront(credentials)
    const res = await client.query<AllProductCollectionsResponse>(ALL_COLLECTIONS_QUERY, {
      first: 1,
      after: undefined,
      nacelleEntryIds: [id],
    })
    const raw = res.allProductCollections.edges[0]?.node
    if (!raw) throw new Error(`Nacelle collection not found: ${id}`)
    return transformCollection(raw)
  }

  // ── Orders (NOMS "Create Order" only — see class doc comment) ────────────

  /**
   * Builds the documented NOMS create-order REST body
   * (https://docs.nacelle.com/docs/noms-introduction):
   *   { order: { source_reference_id, source_name, source_identifier,
   *              line_items: [{ source_reference_id, quantity }] } }
   *
   * These fields describe an order being SYNDICATED INTO Nacelle from an
   * external system of record — `source_name`/`source_identifier` name that
   * system (OpenSteward), `source_reference_id` is that system's id for the
   * order (and, per line item, for the SKU/variant). Money/price fields are
   * not part of the documented request body at all.
   */
  private buildCreateOrderBody(data: Partial<Order>): Record<string, unknown> {
    const orderRef = data.id ?? data.orderNumber
    if (!orderRef) throw new Error('createOrder requires id or orderNumber')
    const lineItems = (data.lineItems ?? []) as LineItem[]
    return {
      order: {
        source_reference_id: orderRef,
        source_name: 'opensteward',
        source_identifier: orderRef,
        line_items: lineItems.map((li) => ({
          source_reference_id: li.sku ?? li.variantId ?? li.productId ?? li.id,
          quantity: li.quantity,
        })),
      },
    }
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const body = this.buildCreateOrderBody(data)
    const submittedRef = (body.order as { source_reference_id: string }).source_reference_id
    // No response-body example is published anywhere in Nacelle's docs. The
    // one assumption made — that a create response mirrors the request's own
    // `{ order: {...} }` envelope — follows directly from the documented
    // REQUEST shape, not a guess between unrelated candidate shapes. If it
    // echoes an id, use it; otherwise fall back to the id WE submitted (a
    // real, known-correct value) rather than a placeholder.
    const res = await this.noms(credentials).createOrder<{ order?: { id?: string } }>(body)
    const id = typeof res.order?.id === 'string' ? res.order.id : submittedRef
    return {
      id,
      lineItems: data.lineItems,
      metadata: res as unknown as Record<string, unknown>,
    }
  }
}
