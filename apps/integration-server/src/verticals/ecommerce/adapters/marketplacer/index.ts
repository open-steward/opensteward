/**
 * Marketplacer adapter for the ecommerce vertical.
 *
 * A Marketplacer connection is a SELLER on one specific operator's
 * marketplace instance — customers, payment transactions and the
 * marketplace-level Order object belong to the operator, not the seller
 * (see ./transform/order.ts). Auth is a static per-seller API key
 * (`marketplacer-api-key` header), not OAuth — see ./connect-form.ts.
 *
 * Docs: https://api.marketplacer.com/docs/seller-api/
 */

import type { Credentials, PagedResult, QueryParams } from '@opensteward/shared'
import { cursorPagerKey, pageByCursor, reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { CONNECT_FORM } from './connect-form'
import { buildAuthUrl, exchangeCode as marketplacerExchangeCode } from './auth'
import { MarketplacerClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyMarketplacerWebhook, parseMarketplacerWebhookEvents } from './webhook'
import { LIST_PRODUCTS, GET_PRODUCT, UPSERT_PRODUCT, UPDATE_VARIANT, LIST_TAXONS, GET_TAXON, LIST_INVOICES, GET_INVOICE, LIST_REFUND_REQUESTS, GET_REFUND_REQUEST, CREATE_REFUND_REQUEST, CREATE_SHIPMENT } from './documents'

import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawMarketplacerAdvert,
  type RawMarketplacerVariant,
} from './transform/product'
import { transformCollection, type RawMarketplacerTaxon } from './transform/collection'
import { transformOrder, type RawMarketplacerInvoice } from './transform/order'
import {
  transformRefund,
  untransformRefund,
  type RawMarketplacerRefundRequest,
} from './transform/refund'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawMarketplacerShipment,
} from './transform/fulfillment'

interface Connection<T> {
  totalCount: number
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
  nodes: T[]
}

interface MutationErrorEntry {
  field?: string | null
  messages?: string[] | null
}

/** Every mutation here follows the same `{ <payload>, errors: [{field, messages}] }` shape. */
function assertNoUserErrors(errors: MutationErrorEntry[] | null | undefined, mutation: string): void {
  if (!errors || errors.length === 0) return
  const detail = errors
    .map((e) => `${e.field ? `${e.field}: ` : ''}${(e.messages ?? []).join(', ')}`)
    .join('; ')
  throw new Error(`Marketplacer ${mutation} rejected the request: ${detail}`)
}

export interface MarketplacerAdapterConfig {
  /**
   * Deployment-wide fallback currency label, used only when a connection's
   * own `extra.currency` (collected at connect time — see ./connect-form.ts)
   * is somehow absent. Marketplacer's API reports plain integers with no
   * currency field of its own, so one of the two MUST be set; there is no
   * platform default.
   */
  currency?: string
}

export class MarketplacerAdapter implements EcommerceAdapter {
  readonly platform = 'marketplacer'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // Connect Link support — see ./connect-form.ts.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  private configCurrency: string | undefined

  constructor(config: MarketplacerAdapterConfig = {}) {
    this.configCurrency = config.currency
  }

  /** The connection's own currency wins; see `MarketplacerAdapterConfig.currency`. */
  private resolveCurrency(credentials: Credentials): string {
    const fromConnection = credentials.extra?.['currency'] as string | undefined
    const currency = fromConnection ?? this.configCurrency
    if (!currency) {
      throw new Error(
        'Marketplacer adapter has no currency — reconnect via the Connect Link form, which ' +
          'collects it from the seller (Marketplacer’s API reports no currency of its own).',
      )
    }
    return currency
  }

  /** Required, never defaulted — see `resolveCurrency`; a missing instance host is a connection bug. */
  private instanceHost(credentials: Credentials): string {
    const host = credentials.extra?.['instanceHost'] as string | undefined
    if (!host) {
      throw new Error('Marketplacer connection is missing extra.instanceHost — reconnect via the Connect Link form.')
    }
    return host
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string, _overrideScopes?: string[], _codeChallenge?: string, inputs?: Record<string, string>): string {
    return buildAuthUrl(inputs?.['instanceUrl'])
  }

  async exchangeCode(): Promise<Credentials> {
    return marketplacerExchangeCode()
  }

  /** Static API keys do not expire on a schedule; Marketplacer only ever revokes them out-of-band. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyMarketplacerWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const topic =
      (payload['__topic'] as string | undefined) ?? (payload['topic'] as string | undefined)
    return parseMarketplacerWebhookEvents(payload, topic)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): MarketplacerClient {
    return new MarketplacerClient(credentials)
  }

  /** Stable per-connection scope for cursor keys — the instance host, never the API key. */
  private pagerScope(credentials: Credentials): string {
    return `marketplacer:${this.instanceHost(credentials)}`
  }

  private limitFor(params: QueryParams): number {
    return Math.min(Number(params.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
  }

  /**
   * One page of a Relay `first`/`after` connection, honouring either an
   * explicit cursor or the worker's numeric `page`. Mirrors the shared
   * cursor-pager pattern in the Shopify adapter, adapted to Marketplacer's
   * plain `pageInfo { hasNextPage endCursor }` (no Link header to parse).
   */
  private async cursorPage<T>(
    credentials: Credentials,
    collectionKey: string,
    params: QueryParams,
    run: (first: number, after: string | undefined) => Promise<Connection<T>>,
  ): Promise<PagedResult<T>> {
    const first = this.limitFor(params)
    const explicitCursor = params['cursor'] ?? params['after']
    if (explicitCursor) {
      const res = await run(first, String(explicitCursor))
      return { items: res.nodes, hasMore: res.pageInfo.hasNextPage }
    }
    return pageByCursor<T, string>(
      cursorPagerKey(this.pagerScope(credentials), collectionKey, { first }),
      params.page,
      async (after) => {
        const res = await run(first, after)
        return { items: res.nodes, next: res.pageInfo.hasNextPage ? (res.pageInfo.endCursor ?? undefined) : undefined }
      },
    )
  }

  private async cursorList<T>(
    credentials: Credentials,
    collectionKey: string,
    params: QueryParams,
    run: (first: number, after: string | undefined) => Promise<Connection<T>>,
  ): Promise<T[]> {
    const page = await this.cursorPage(credentials, collectionKey, params, run)
    reportUpstreamPage(params, { hasMore: page.hasMore })
    return page.items
  }

  /**
   * `advertsWhere` "will only return a result set if you provide at least 1
   * filter argument" — `createdSince` is always sent so an unfiltered sync
   * never silently gets back an empty page. `params.updatedAfter` maps onto
   * it too: `advertsWhere` has no `updatedSince` filter, only
   * `createdSince`/`createdUntil`, so incremental sync approximates "updated
   * since" with "created since" and will miss adverts that were updated but
   * not created after the watermark — a real, documented gap, not silently
   * papered over.
   */
  private advertsFilter(params: QueryParams): { createdSince: string } {
    return { createdSince: (params.updatedAfter ?? new Date(0)).toISOString() }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.client(credentials)
    const filter = this.advertsFilter(params)
    const rows = await this.cursorList<RawMarketplacerAdvert>(
      credentials,
      'advertsWhere',
      params,
      async (first, after) => {
        const data = await client.request<{ advertsWhere: Connection<RawMarketplacerAdvert> }>(
          LIST_PRODUCTS,
          { first, after, ...filter },
        )
        return data.advertsWhere
      },
    )
    return rows.map((r) => transformProduct(r, this.resolveCurrency(credentials)))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const data = await this.client(credentials).request<{ node: RawMarketplacerAdvert | null }>(
      GET_PRODUCT,
      { id },
    )
    if (!data.node) throw new Error(`Marketplacer advert ${id} was not found`)
    return transformProduct(data.node, this.resolveCurrency(credentials))
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const attrs = untransformProduct(data, this.resolveCurrency(credentials))
    if (!attrs.brandId || !attrs.taxonId) {
      throw new Error(
        'createProduct requires metadata.brandId and metadata.taxonId — resolve them first via ' +
          'the `brands` and `taxons` queries (Marketplacer adverts must belong to exactly one of each).',
      )
    }
    if (!attrs.variants || attrs.variants.length === 0 || !attrs.variants[0]?.optionValueIds?.length) {
      throw new Error(
        'createProduct requires at least one variant with metadata.optionValueIds — resolve ' +
          'them via the `taxons`/`node` (Prototype) queries for the chosen taxon.',
      )
    }
    const client = this.client(credentials)
    const res = await client.request<{
      advertUpsert: { advert: RawMarketplacerAdvert | null; errors: MutationErrorEntry[] }
    }>(UPSERT_PRODUCT, { input: { attributes: attrs } })
    assertNoUserErrors(res.advertUpsert.errors, 'advertUpsert')
    if (!res.advertUpsert.advert) throw new Error('advertUpsert returned no advert and no errors')
    return transformProduct(res.advertUpsert.advert, this.resolveCurrency(credentials))
  }

  async updateProduct(credentials: Credentials, id: string, data: Partial<Product>): Promise<Product> {
    const attrs = untransformProduct(data, this.resolveCurrency(credentials))
    const client = this.client(credentials)
    const res = await client.request<{
      advertUpsert: { advert: RawMarketplacerAdvert | null; errors: MutationErrorEntry[] }
    }>(UPSERT_PRODUCT, { input: { advertId: id, attributes: attrs } })
    assertNoUserErrors(res.advertUpsert.errors, 'advertUpsert')
    if (!res.advertUpsert.advert) throw new Error('advertUpsert returned no advert and no errors')
    return transformProduct(res.advertUpsert.advert, this.resolveCurrency(credentials))
  }

  // deleteProduct: not implemented — see metadata.ts / README: Marketplacer has
  // no advert-delete mutation; `published: false` (via updateProduct) is the
  // only documented removal path, and it is a soft unpublish, not a delete.

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['product_id']
    if (!productId) {
      throw new Error(
        'Marketplacer requires ?productId= for listVariants — variants have no unscoped list.',
      )
    }
    const advert = await this.getProduct(credentials, String(productId))
    return advert.variants ?? []
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Composite id: Marketplacer prices at the Advert level (see
    // ./transform/product.ts), so a variant can only be fully resolved
    // together with its parent advert's price.
    const [advertId, variantId] = id.split(':')
    if (!advertId || !variantId) {
      throw new Error('Invalid variant id format: expected `advertId:variantId`')
    }
    const data = await this.client(credentials).request<{ node: RawMarketplacerAdvert | null }>(
      GET_PRODUCT,
      { id: advertId },
    )
    const raw = data.node?.variants?.nodes.find((v) => String(v.id) === variantId)
    if (!raw) throw new Error(`Marketplacer variant ${variantId} was not found on advert ${advertId}`)
    return transformVariant(raw, {
      productId: advertId,
      price: data.node?.lowestPrice,
      compareAtPrice: data.node?.lowestOriginalPrice,
      currency: this.resolveCurrency(credentials),
    })
  }

  async createVariant(credentials: Credentials, data: Partial<ProductVariant>): Promise<ProductVariant> {
    if (!data.productId) throw new Error('createVariant requires productId (the Marketplacer advert id)')
    const attrs = untransformVariant(data)
    if (!attrs.optionValueIds || attrs.optionValueIds.length === 0) {
      throw new Error('createVariant requires metadata.optionValueIds (at least one).')
    }
    const client = this.client(credentials)
    const res = await client.request<{
      advertUpsert: { advert: RawMarketplacerAdvert | null; errors: MutationErrorEntry[] }
    }>(UPSERT_PRODUCT, { input: { advertId: data.productId, attributes: { variants: [attrs] } } })
    assertNoUserErrors(res.advertUpsert.errors, 'advertUpsert')
    const nodes = res.advertUpsert.advert?.variants?.nodes ?? []
    // advertUpsert echoes every variant on the advert, not just the one just
    // added — match by the identifying field we sent (sku/barcode), falling
    // back to the last entry when neither was supplied.
    const match =
      nodes.find((v) => (attrs.barcode && v.barcode === attrs.barcode) || (attrs.sku && v.sku === attrs.sku)) ??
      nodes[nodes.length - 1]
    if (!match) throw new Error('advertUpsert did not return the newly created variant')
    return transformVariant(match, {
      productId: data.productId,
      price: res.advertUpsert.advert?.lowestPrice,
      compareAtPrice: res.advertUpsert.advert?.lowestOriginalPrice,
      currency: this.resolveCurrency(credentials),
    })
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    // `variantUpdate`'s response carries no price (Marketplacer prices at the
    // Advert level — see ./transform/product.ts), so the parent advert must
    // be supplied to build a schema-valid ProductVariant back.
    if (!data.productId) {
      throw new Error(
        'updateVariant requires productId (the Marketplacer advert id) — its price comes from ' +
          'the parent Advert, which variantUpdate does not return.',
      )
    }
    const attrs = untransformVariant({ ...data, id })
    const client = this.client(credentials)
    const res = await client.request<{
      variantUpdate: { variant: RawMarketplacerVariant | null; errors: MutationErrorEntry[] }
    }>(UPDATE_VARIANT, { input: { variantId: id, attributes: attrs } })
    assertNoUserErrors(res.variantUpdate.errors, 'variantUpdate')
    if (!res.variantUpdate.variant) throw new Error('variantUpdate returned no variant and no errors')
    const advert = await client.request<{ node: RawMarketplacerAdvert | null }>(GET_PRODUCT, {
      id: data.productId,
    })
    if (!advert.node) throw new Error(`Marketplacer advert ${data.productId} was not found`)
    return transformVariant(res.variantUpdate.variant, {
      productId: data.productId,
      price: advert.node.lowestPrice,
      compareAtPrice: advert.node.lowestOriginalPrice,
      currency: this.resolveCurrency(credentials),
    })
  }

  // ── Collections (Taxons) — read-only ─────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const client = this.client(credentials)
    const rows = await this.cursorList<RawMarketplacerTaxon>(
      credentials,
      'taxons',
      params,
      async (first, after) => {
        const data = await client.request<{ taxons: Connection<RawMarketplacerTaxon> }>(
          LIST_TAXONS,
          { first, after },
        )
        return data.taxons
      },
    )
    return rows.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const data = await this.client(credentials).request<{ node: RawMarketplacerTaxon | null }>(
      GET_TAXON,
      { id },
    )
    if (!data.node) throw new Error(`Marketplacer taxon ${id} was not found`)
    return transformCollection(data.node)
  }

  // ── Orders (Invoices) — read-only ────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.client(credentials)
    const rows = await this.cursorList<RawMarketplacerInvoice>(
      credentials,
      'invoices',
      params,
      async (first, after) => {
        const data = await client.request<{ invoices: Connection<RawMarketplacerInvoice> }>(
          LIST_INVOICES,
          { first, after },
        )
        return data.invoices
      },
    )
    return rows.map((r) => transformOrder(r, this.resolveCurrency(credentials)))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const data = await this.client(credentials).request<{ node: RawMarketplacerInvoice | null }>(
      GET_INVOICE,
      { id },
    )
    if (!data.node) throw new Error(`Marketplacer invoice ${id} was not found`)
    return transformOrder(data.node, this.resolveCurrency(credentials))
  }

  // ── Refunds (RefundRequest) ───────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const client = this.client(credentials)
    const rows = await this.cursorList<RawMarketplacerRefundRequest>(
      credentials,
      'refundRequests',
      params,
      async (first, after) => {
        const data = await client.request<{ refundRequests: Connection<RawMarketplacerRefundRequest> }>(
          LIST_REFUND_REQUESTS,
          { first, after },
        )
        return data.refundRequests
      },
    )
    return rows.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const data = await this.client(credentials).request<{ node: RawMarketplacerRefundRequest | null }>(
      GET_REFUND_REQUEST,
      { id },
    )
    if (!data.node) throw new Error(`Marketplacer refund request ${id} was not found`)
    return transformRefund(data.node)
  }

  /**
   * Starts a Refund Request only. `refundRequestRefund` /
   * `refundRequestApprove` — the mutations that actually move money — are
   * documented "Operator Only" and are out of scope for a Seller connection.
   */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const input = untransformRefund(data)
    const res = await this.client(credentials).request<{
      refundRequestCreate: { refundRequest: RawMarketplacerRefundRequest | null; errors: MutationErrorEntry[] }
    }>(CREATE_REFUND_REQUEST, { input })
    assertNoUserErrors(res.refundRequestCreate.errors, 'refundRequestCreate')
    if (!res.refundRequestCreate.refundRequest) {
      throw new Error('refundRequestCreate returned no refund request and no errors')
    }
    return transformRefund(res.refundRequestCreate.refundRequest)
  }

  // ── Fulfillments (Shipments) — create-only ───────────────────────────────

  async createFulfillment(credentials: Credentials, data: Partial<Fulfillment>): Promise<Fulfillment> {
    const input = untransformFulfillment(data)
    const res = await this.client(credentials).request<{
      shipmentCreate: { shipment: RawMarketplacerShipment | null; errors: MutationErrorEntry[] }
    }>(CREATE_SHIPMENT, { input })
    assertNoUserErrors(res.shipmentCreate.errors, 'shipmentCreate')
    if (!res.shipmentCreate.shipment) throw new Error('shipmentCreate returned no shipment and no errors')
    return transformFulfillment(res.shipmentCreate.shipment, input)
  }
}
