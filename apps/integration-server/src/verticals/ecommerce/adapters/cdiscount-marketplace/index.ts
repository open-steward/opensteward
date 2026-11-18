/**
 * Cdiscount Marketplace adapter for the ecommerce vertical.
 *
 * Cdiscount Marketplace is operated by Octopia — a marketplace-as-a-service
 * platform used by Cdiscount and several other French/European storefronts.
 * The legacy `dev.cdiscount.com` SOAP API is retired; this adapter targets
 * the current REST API at developer.octopia-io.net (verified 2026-09-13).
 *
 * Auth: OAuth2 client-credentials per seller, plus a mandatory `SellerId`
 * header on every call (see `auth.ts` / `client.ts`). Tokens live 2h and the
 * token endpoint is rate-limited to 500 calls/hour, so `refreshCredentials`
 * — not a per-request mint — is the only place a new token is fetched.
 *
 * Coverage: 4 of 11 canonical resources (product, inventory, order,
 * fulfillment). As a marketplace seller API, Octopia has no
 * seller-manipulable customers, collections, locations, discounts, refunds
 * or per-order transactions — see `metadata.ts` for the documented reason
 * behind each.
 *
 * `createProduct`/`updateProduct` and `setInventoryLevel` submit to
 * asynchronous Octopia integration workflows (`POST /products-integration`,
 * the `/offer-packages` flow); Octopia processes them out of band, so what
 * these methods return is an accepted-submission echo, not a confirmed
 * post-processing state. Poll `GET /products-integration-reports` /
 * `GET /offer-packages/{id}/offer-requests-results` to see the outcome.
 *
 * No webhooks: Octopia documents none for sellers (`webhook.ts` removed —
 * see the top-level report for the required `webhooks.ts` change).
 */
import { oauth2ClientCredentials, cursorPagerKey, pageByCursor, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'

import {
  buildAuthUrl,
  exchangeCode as octopiaExchangeCode,
  refreshCredentials as octopiaRefreshCredentials,
} from './auth'
import { OctopiaClient } from './client'
import {
  TOKEN_ENDPOINT,
  DEFAULT_PAGE_SIZE,
  MAX_PRODUCT_PAGE_SIZE,
  MAX_OFFER_PAGE_SIZE,
  MAX_ORDER_PAGE_SIZE,
  DEFAULT_ORDER_PAGE_SIZE,
  DEFAULT_SALES_CHANNEL_ID,
} from './constants'

import { transformProduct, untransformProduct, type RawOctopiaProduct } from './transform/product'
import {
  transformInventoryLevel,
  untransformInventoryLevel,
  type RawOctopiaOffer,
} from './transform/inventory'
import { transformOrder, type RawOctopiaOrder } from './transform/order'
import { transformFulfillmentsFromOrder, untransformFulfillment } from './transform/fulfillment'

const CREDENTIAL_FORM = oauth2ClientCredentials({
  // The token endpoint is the same for every seller — no per-input function needed.
  tokenUrl: TOKEN_ENDPOINT,
  additionalFields: [
    {
      name: 'sellerId',
      label: 'Seller ID',
      type: 'text',
      required: true,
      helpText: 'Your Octopia seller identifier — sent as the `SellerId` header on every request.',
    },
    {
      name: 'salesChannelId',
      label: 'Sales channel ID (advanced)',
      type: 'text',
      required: false,
      placeholder: DEFAULT_SALES_CHANNEL_ID,
      helpText:
        `Defaults to ${DEFAULT_SALES_CHANNEL_ID} (Cdiscount France). Only change this if Octopia ` +
        'assigned your Cdiscount storefront a different sales channel id.',
    },
  ],
})

export interface CdiscountMarketplaceAdapterConfig {
  clientId?: string
  clientSecret?: string
  sellerId?: string
}

export class CdiscountMarketplaceAdapter implements EcommerceAdapter {
  readonly platform = 'cdiscount-marketplace'
  readonly version = '0.1.0'

  /** `/products` and `/orders` cap at 100; `/offers` at 1000 — declare the
   *  more common, more restrictive ceiling so the sync worker's short-page
   *  termination check stays correct for products and orders. */
  readonly capabilities = { maxPageSize: MAX_PRODUCT_PAGE_SIZE }

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private configClientId: string | undefined
  private configClientSecret: string | undefined
  private configSellerId: string | undefined

  constructor(config: CdiscountMarketplaceAdapterConfig = {}) {
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
    this.configSellerId = config.sellerId
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(): string {
    return buildAuthUrl()
  }

  async exchangeCode(): Promise<Credentials> {
    return octopiaExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return octopiaRefreshCredentials(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): OctopiaClient {
    const sellerId = (credentials.extra?.['sellerId'] as string | undefined) ?? this.configSellerId
    if (!sellerId) {
      throw new Error(
        'Cdiscount Marketplace adapter is missing sellerId — POST it to /v1/connections with ' +
          'credentials: {clientId, clientSecret, sellerId}.',
      )
    }
    const merged: Credentials = { ...credentials, extra: { ...credentials.extra, sellerId } }
    return new OctopiaClient(merged)
  }

  private salesChannelId(credentials: Credentials): string {
    return (credentials.extra?.['salesChannelId'] as string | undefined) ?? DEFAULT_SALES_CHANNEL_ID
  }

  private pagerScope(credentials: Credentials): string {
    const sellerId = (credentials.extra?.['sellerId'] as string | undefined) ?? this.configSellerId ?? ''
    return `cdiscount-marketplace:${sellerId}`
  }

  private cursorListParams(params: QueryParams, maxLimit: number): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: Math.min(Number(params.limit ?? DEFAULT_PAGE_SIZE), maxLimit),
    }
    if (params.updatedAfter) out['updatedAtMin'] = params.updatedAfter.toISOString()
    return out
  }

  /** One page of a cursor-paginated Octopia list, resolving the worker's numeric `page`. */
  private async cursorList<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    maxLimit: number,
    extra: Record<string, unknown> = {},
  ): Promise<T[]> {
    const client = this.clientFor(credentials)
    const query = { ...this.cursorListParams(params, maxLimit), ...extra }
    const result = await pageByCursor<T, string>(
      cursorPagerKey(this.pagerScope(credentials), path, query),
      params.page,
      async (cursor) => {
        const res = await client.listWithCursor<T>(
          path,
          cursor != null ? { ...query, cursor } : query,
          maxLimit,
        )
        return { items: res.items, next: res.nextCursor }
      },
    )
    reportUpstreamPage(params, { hasMore: result.hasMore })
    return result.items
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const rows = await this.cursorList<RawOctopiaProduct>(
      credentials,
      'products',
      params,
      MAX_PRODUCT_PAGE_SIZE,
    )
    return rows.map(transformProduct)
  }

  /**
   * `GET /products/{reference}` is not spelled out in the docs excerpts
   * available at write time, but every other Octopia resource follows the
   * same list+`/{reference}` item convention (`/categories/{categoryReference}`,
   * `/orders/{orderId}`) — applied here for symmetry.
   */
  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.clientFor(credentials).get<RawOctopiaProduct>(
      `products/${encodeURIComponent(id)}`,
    )
    return transformProduct(raw)
  }

  /**
   * Octopia's product `reference` is seller/integrator-assigned, so
   * `data.id` (the intended `reference`) and `data.title` (the intended
   * `label`) must both be supplied — Octopia does not mint either. `POST
   * /products-integration` is asynchronous: this returns the accepted
   * submission, not a confirmed catalog entry (poll
   * `GET /products-integration-reports` for the outcome).
   */
  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    if (!data.id || !data.title) {
      throw new Error(
        'Cdiscount Marketplace createProduct requires `id` (the product reference) and `title` ' +
          '(the label) — Octopia does not generate either.',
      )
    }
    const body = untransformProduct({ id: data.id, title: data.title, description: data.description })
    const res = await this.clientFor(credentials).post<unknown>('products-integration', [body])
    return {
      id: data.id,
      title: data.title,
      description: data.description,
      metadata: { submitted: body, integrationResponse: res },
    }
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const current = await this.getProduct(credentials, id)
    const title = data.title ?? current.title
    const body = untransformProduct({ id, title, description: data.description ?? current.description })
    const res = await this.clientFor(credentials).post<unknown>('products-integration', [body])
    return {
      id,
      title,
      description: data.description ?? current.description,
      metadata: { submitted: body, integrationResponse: res },
    }
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const rows = await this.cursorList<RawOctopiaOffer>(
      credentials,
      'offers',
      params,
      MAX_OFFER_PAGE_SIZE,
      { salesChannelId: this.salesChannelId(credentials) },
    )
    return rows.map(transformInventoryLevel)
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    const variantId = id.includes(':') ? id.split(':')[0]! : id
    const client = this.clientFor(credentials)
    const res = await client.listWithCursor<RawOctopiaOffer>(
      'offers',
      { salesChannelId: this.salesChannelId(credentials), sellerExternalReferences: variantId, limit: 1 },
      MAX_OFFER_PAGE_SIZE,
    )
    const found = res.items[0]
    if (!found) {
      throw new Error(`Cdiscount Marketplace getInventoryLevel: no offer found for '${variantId}'`)
    }
    return transformInventoryLevel(found)
  }

  /**
   * Octopia's offer-package flow only ever SETS an absolute quantity (see
   * `metadata.ts`) — asynchronous, like product writes: `POST
   * /offer-packages` → `POST /offer-packages/{id}/offer-requests` → `PATCH
   * /offer-packages/{id}` to submit for processing. `POST /offer-packages`'s
   * exact response schema is not independently documented on the pages
   * available at write time; `packageId` is used per "The package ID serves
   * as the integration tracking identifier" in the docs' own description of
   * the flow — if that assumption is wrong, this throws rather than
   * silently guessing a different field.
   */
  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    const created = await client.post<{ packageId: string }>('offer-packages', {})
    const packageId = created.packageId
    if (!packageId) {
      throw new Error('Cdiscount Marketplace setInventoryLevel: offer-packages did not return a packageId')
    }
    const body = untransformInventoryLevel({ variantId: data.variantId, available: data.available })
    await client.post(`offer-packages/${encodeURIComponent(packageId)}/offer-requests`, [body])
    const submission = await client.patch<unknown>(`offer-packages/${encodeURIComponent(packageId)}`, {
      status: 'Ready',
    })
    return {
      id: `${data.variantId}:${data.locationId}`,
      variantId: data.variantId,
      locationId: data.locationId,
      available: data.available,
      metadata: { packageId, submitted: body, submission },
    }
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  private orderParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      pageIndex: params.page ?? 1,
      pageSize: Math.min(Number(params.limit ?? DEFAULT_ORDER_PAGE_SIZE), MAX_ORDER_PAGE_SIZE),
    }
    if (params.updatedAfter) out['updatedAtMin'] = params.updatedAfter.toISOString()
    return out
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const res = await client.getPage<RawOctopiaOrder>('orders', this.orderParams(params))
    reportUpstreamPage(params, { hasMore: res.hasMore })
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.clientFor(credentials).get<RawOctopiaOrder>(
      `orders/${encodeURIComponent(id)}`,
    )
    return transformOrder(raw)
  }

  /**
   * Octopia's cancel path is `POST /orders/{orderId}/approval-status` with
   * `{approval_status: 'Refused'}` — documented as applying only to the
   * Cdiscount sales channel. There is no generic order-field update, so
   * `updateOrder` is not implemented (the accept side of approval-status
   * does not fit any canonical Order field either).
   */
  async cancelOrder(credentials: Credentials, id: string): Promise<Order> {
    await this.clientFor(credentials).post(`orders/${encodeURIComponent(id)}/approval-status`, {
      approval_status: 'Refused',
    })
    return this.getOrder(credentials, id)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  /**
   * Octopia has no store-wide or per-order fulfillment list — confirmed
   * shipments are embedded as `parcels[]` on each order line (see
   * `transform/fulfillment.ts`). This mirrors how other marketplace adapters
   * (e.g. shopify) answer an unfiltered `listFulfillments` from a page of
   * orders rather than throwing, since the sync worker calls every
   * collection unfiltered.
   */
  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = params['orderId'] ?? params['order_id']
    if (orderId) {
      const raw = await this.clientFor(credentials).get<RawOctopiaOrder>(
        `orders/${encodeURIComponent(String(orderId))}`,
      )
      return transformFulfillmentsFromOrder(raw)
    }
    const client = this.clientFor(credentials)
    const res = await client.getPage<RawOctopiaOrder>('orders', this.orderParams(params))
    reportUpstreamPage(params, { hasMore: res.hasMore })
    return res.items.flatMap(transformFulfillmentsFromOrder)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const [orderId, parcelNumber] = id.split(':')
    if (!orderId || !parcelNumber) {
      throw new Error('Cdiscount Marketplace fulfillment id must be `orderId:parcelNumber`.')
    }
    const raw = await this.clientFor(credentials).get<RawOctopiaOrder>(
      `orders/${encodeURIComponent(orderId)}`,
    )
    const found = transformFulfillmentsFromOrder(raw).find((f) => f.id === id)
    if (!found) {
      throw new Error(`Cdiscount Marketplace getFulfillment: no parcel '${parcelNumber}' on order '${orderId}'`)
    }
    return found
  }

  /** `POST /orders/{orderId}/shipments` — confirms one or more parcels shipped. */
  async createFulfillment(credentials: Credentials, data: Partial<Fulfillment>): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('Cdiscount Marketplace createFulfillment requires orderId')
    const body = untransformFulfillment({
      trackingNumber: data.trackingNumber,
      carrier: data.carrier,
      trackingUrl: data.trackingUrl,
      lineItems: data.lineItems,
    })
    await this.clientFor(credentials).post(`orders/${encodeURIComponent(data.orderId)}/shipments`, body)
    // Octopia's 201 carries no body worth trusting as the fulfillment record —
    // re-read the order so the returned parcel matches what it actually stored.
    const raw = await this.clientFor(credentials).get<RawOctopiaOrder>(
      `orders/${encodeURIComponent(data.orderId)}`,
    )
    const parcelNumber = data.trackingNumber
    const found = transformFulfillmentsFromOrder(raw).find((f) => f.id === `${data.orderId}:${parcelNumber}`)
    return (
      found ?? {
        id: `${data.orderId}:${parcelNumber ?? ''}`,
        orderId: data.orderId,
        status: 'SUCCESS',
        trackingNumber: data.trackingNumber,
        carrier: data.carrier,
        trackingUrl: data.trackingUrl,
        metadata: { submitted: body },
      }
    )
  }
}
