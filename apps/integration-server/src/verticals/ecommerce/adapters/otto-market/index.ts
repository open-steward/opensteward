/**
 * OTTO Market adapter for the ecommerce vertical.
 *
 * OTTO Market is a German marketplace seller (partner) API. Sellers connect
 * via OAuth2 client-credentials — client id/secret minted per-seller in
 * OTTO Partner Connect, no authorization-code / user-consent redirect.
 * Fully separate sandbox and production hosts are selected per-connection.
 *
 * ── Resource coverage ────────────────────────────────────────────────────
 * Available (6): inventory, order, fulfillment, refund, transaction, location
 * Unavailable (4): product, collection, customer, discount — see metadata.ts
 *   for the documented reason behind each.
 *
 * Within the available resources, some canonical methods are still omitted
 * because OTTO Market's public docs confirm the endpoint exists but not a
 * request/response payload precise enough to implement safely:
 *   - adjustInventoryLevel — Availability's write endpoint sets an ABSOLUTE
 *     quantity (confirmed); no delta/increment endpoint is documented.
 *   - createOrder / updateOrder — orders are buyer-initiated; no
 *     order-creation endpoint is documented for sellers.
 *   - updateFulfillment / cancelFulfillment — not documented.
 *   - createRefund — returns are buyer-initiated; sellers only accept/reject
 *     an existing return (POST .../acceptance, .../rejection), which is not
 *     the canonical "create a refund" action.
 *   - createTransaction — the receipts ledger is platform-generated.
 *
 * Pagination: every implemented list endpoint shares one hypermedia
 * envelope — `{ resources: [...], links: [{ rel, href }] }` — confirmed at
 * https://api.otto.market/docs/about-the-api/api-guides and re-confirmed
 * per-family. `capabilities.maxPageSize` is deliberately NOT declared: the
 * confirmed per-family page-size ceilings disagree (Availability 200,
 * Shipments 25, Receipts/Orders ~128) and there is no single adapter-wide
 * number that is both safe everywhere and not needlessly conservative
 * everywhere else. Each `listParams`-equivalent instead clamps to ITS OWN
 * family's documented default (see constants.ts) and reports both the size
 * it sent (`pageSize`) and `hasMore` from the presence/absence of a
 * `rel: "next"` link. Those reports are what keep a clamped page from reading
 * as the last one: 25 shipments against the router's default limit of 100 is
 * a short page by length alone. The sync worker ends on `hasMore`, and on the
 * API path `meta.hasMore` and the cache's `collectionIsComplete` defer to it,
 * while `meta.limit` reports the family's size — which is also how far each
 * caller page advances: one upstream page per page.
 *
 * Webhooks: no webhook/push-notification interface appears anywhere in
 * OTTO Market's functional-interfaces index (Availability, Orders,
 * Price-Reductions, Return-Shipments, Returns-Warehouse, Returns,
 * Shipments, Shipping-Profiles, Sponsored-Product-Ads(-Reporting),
 * Products, Receipts — the complete list). No `webhook.ts` ships with this
 * adapter; its former entry in ../../webhooks.ts must be removed centrally
 * (this adapter cannot edit that shared file).
 *
 * Docs used throughout: https://api.otto.market/docs and the
 * functional-interfaces pages cited in each transform/*.ts file.
 */

import { oauth2ClientCredentials } from '@opensteward/shared'
import type { Credentials, QueryParams, PagedResult } from '@opensteward/shared'
import { cursorPagerKey, pageByCursor, reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Location } from '../../schema/location'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'

import { mintToken, refreshCredentials as ottoRefreshCredentials, tokenUrlFor } from './auth'
import { OttoMarketClient } from './client'
import {
  DEFAULT_SCOPES,
  SHIPMENTS_PAGE_SIZE,
  RECEIPTS_PAGE_SIZE,
  ORDERS_PAGE_SIZE,
  RETURNS_PAGE_SIZE,
  LOCATIONS_PAGE_SIZE,
} from './constants'

import { transformLocation, type RawOttoReturnAddress } from './transform/location'
import { transformOrder, type RawOttoOrder } from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawOttoShipment,
} from './transform/fulfillment'
import { transformRefund, type RawOttoReturn } from './transform/refund'
import { transformTransaction, type RawOttoReceipt } from './transform/transaction'

const CREDENTIAL_FORM = oauth2ClientCredentials({
  tokenUrl: (input) => tokenUrlFor(input['environment']),
  scopes: DEFAULT_SCOPES,
  additionalFields: [
    {
      name: 'environment',
      label: 'Environment',
      type: 'select',
      required: true,
      helpText: 'OTTO Market issues separate credentials per environment.',
      options: [
        { value: 'production', label: 'Production' },
        { value: 'sandbox', label: 'Sandbox' },
      ],
    },
  ],
})

export interface OttoMarketAdapterConfig {
  clientId?: string
  clientSecret?: string
  environment?: string
}

export class OttoMarketAdapter implements EcommerceAdapter {
  readonly platform = 'otto-market'
  readonly version = '0.1.0'

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private configClientId: string | undefined
  private configClientSecret: string | undefined
  private configEnvironment: string | undefined

  constructor(config: OttoMarketAdapterConfig = {}) {
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
    this.configEnvironment = config.environment
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    throw new Error(
      'OTTO Market uses OAuth2 client-credentials — there is no user-consent redirect. ' +
        'Provide clientId, clientSecret and environment via the Connect Link form.',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.configClientId || !this.configClientSecret) {
      throw new Error(
        'OTTO Market adapter exchangeCode requires clientId and clientSecret — ' +
          'configure them in apps/integration-server/config/config.yml under ' +
          'adapters.otto-market, or connect via the Connect Link credential form.',
      )
    }
    return mintToken(this.configClientId, this.configClientSecret, this.configEnvironment)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return ottoRefreshCredentials(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): OttoMarketClient {
    return new OttoMarketClient(credentials)
  }

  /** Stable per-connection scope for cursor keys — the client id, never the access token. */
  private pagerScope(credentials: Credentials): string {
    const clientId = credentials.extra?.['clientId']
    return `otto-market:${typeof clientId === 'string' ? clientId : 'unknown'}`
  }

  private async linkPage<T>(
    credentials: Credentials,
    collection: string,
    path: string,
    params: Record<string, unknown>,
    page: number | undefined,
  ): Promise<PagedResult<T>> {
    const client = this.clientFor(credentials)
    return pageByCursor<T, string>(
      cursorPagerKey(this.pagerScope(credentials), collection, params),
      page,
      async (href) => {
        const res = await client.listPage<T>(path, params, href)
        return { items: res.items, next: res.nextHref }
      },
    )
  }

  private isoDate(d: Date | undefined): string | undefined {
    return d ? d.toISOString() : undefined
  }

  // ── Locations (returns-warehouse addresses) ──────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const query = { limit: Math.min(Number(params.limit ?? LOCATIONS_PAGE_SIZE), LOCATIONS_PAGE_SIZE) }
    reportUpstreamPage(params, { pageSize: query.limit as number })
    const page = await this.linkPage<RawOttoReturnAddress>(
      credentials,
      'returns-warehouse-addresses',
      '/v2/returns-warehouse/addresses',
      query,
      params.page,
    )
    reportUpstreamPage(params, { hasMore: page.hasMore })
    return page.items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.clientFor(credentials).get<RawOttoReturnAddress>(
      `/v2/returns-warehouse/addresses/${encodeURIComponent(id)}`,
    )
    return transformLocation(raw)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const query: Record<string, unknown> = {
      limit: Math.min(Number(params.limit ?? ORDERS_PAGE_SIZE), ORDERS_PAGE_SIZE),
    }
    reportUpstreamPage(params, { pageSize: query.limit as number })
    const fromDate = this.isoDate(params.updatedAfter)
    if (fromDate) query['fromDate'] = fromDate
    const status = params['fulfillmentStatus']
    if (status) query['fulfillmentStatus'] = status

    const page = await this.linkPage<RawOttoOrder>(credentials, 'orders', '/v4/orders', query, params.page)
    reportUpstreamPage(params, { hasMore: page.hasMore })
    return page.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.clientFor(credentials).get<RawOttoOrder>(
      `/v4/orders/${encodeURIComponent(id)}`,
    )
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    await this.clientFor(credentials).post(
      `/v4/orders/${encodeURIComponent(id)}/cancellation`,
      data?.reason ? { reason: data.reason } : {},
    )
    return this.getOrder(credentials, id)
  }

  // ── Fulfillments (Shipments) ─────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const query: Record<string, unknown> = {
      limit: Math.min(Number(params.limit ?? SHIPMENTS_PAGE_SIZE), SHIPMENTS_PAGE_SIZE),
    }
    reportUpstreamPage(params, { pageSize: query.limit as number })
    const datefrom = this.isoDate(params.updatedAfter)
    if (datefrom) query['datefrom'] = datefrom

    const page = await this.linkPage<RawOttoShipment>(
      credentials,
      'shipments',
      '/v1/shipments',
      query,
      params.page,
    )
    reportUpstreamPage(params, { hasMore: page.hasMore })
    return page.items.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const raw = await this.clientFor(credentials).get<RawOttoShipment>(
      `/v1/shipments/${encodeURIComponent(id)}`,
    )
    return transformFulfillment(raw)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const created = await client.post<RawOttoShipment>('/v1/shipments', untransformFulfillment(data))
    if (data.lineItems && data.lineItems.length > 0 && created.shipmentId) {
      await client.post(`/v1/shipments/${encodeURIComponent(created.shipmentId)}/positionitems`, {
        positionItems: data.lineItems.map((li) => ({
          positionItemId: li.lineItemId,
          quantity: li.quantity,
        })),
      })
    }
    return transformFulfillment({ ...created, salesOrderId: created.salesOrderId ?? data.orderId })
  }

  // ── Refunds (Returns) ────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const query: Record<string, unknown> = {
      limit: Math.min(Number(params.limit ?? RETURNS_PAGE_SIZE), RETURNS_PAGE_SIZE),
    }
    reportUpstreamPage(params, { pageSize: query.limit as number })
    const returnState = params['returnState']
    if (returnState) query['returnState'] = returnState

    const page = await this.linkPage<RawOttoReturn>(
      credentials,
      'returns',
      '/v3/returns',
      query,
      params.page,
    )
    reportUpstreamPage(params, { hasMore: page.hasMore })
    return page.items.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const raw = await this.clientFor(credentials).get<RawOttoReturn>(
      `/v3/returns/${encodeURIComponent(id)}`,
    )
    return transformRefund(raw)
  }

  // ── Transactions (Receipts) ──────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const query: Record<string, unknown> = {
      limit: Math.min(Number(params.limit ?? RECEIPTS_PAGE_SIZE), RECEIPTS_PAGE_SIZE),
    }
    reportUpstreamPage(params, { pageSize: query.limit as number })
    const from = this.isoDate(params.updatedAfter)
    if (from) query['from'] = from

    const page = await this.linkPage<RawOttoReceipt>(
      credentials,
      'receipts',
      '/v3/receipts',
      query,
      params.page,
    )
    reportUpstreamPage(params, { hasMore: page.hasMore })
    return page.items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const raw = await this.clientFor(credentials).get<RawOttoReceipt>(
      `/v3/receipts/${encodeURIComponent(id)}`,
    )
    return transformTransaction(raw)
  }
}
