/**
 * GOFRUGAL adapter for the ecommerce vertical.
 *
 * GOFRUGAL's "eCommerce Integration API" is not a cloud API — it's served
 * by the merchant's own on-premises RetailEasy WebReporter service. Maps
 * the two documented resources (items with embedded stock, and sales
 * orders) to the canonical shapes it genuinely has: products (read-only,
 * list-only), inventory (read-only, derived from the same item payload),
 * and orders (create/list/get).
 *
 * Docs: https://community.gofrugal.com/portal/en/kb/gofrugalretaileasy/ecommerce-integration/api-integration/articles/api-integration
 *
 * Auth is a static `X-Auth-Token` API key plus the merchant's own
 * WebReporter base URL — there is no OAuth flow (see ./auth.ts and the
 * Connect Link form in ./connect-form.ts). No webhooks are documented.
 *
 * See ./metadata.ts for the full available/unavailable resource breakdown.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { pageLocally, reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeCode as gofrugalExchangeCode } from './auth'
import { CONNECT_FORM } from './connect-form'
import { GofrugalClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { transformProduct, type RawGofrugalItem } from './transform/product'
import { transformInventoryLevels } from './transform/inventory'
import { transformOrder, untransformOrder, type RawGofrugalSalesOrder } from './transform/order'

interface CreateSalesOrderResult {
  result: { status: string; id: number | string; Message?: string }
}

export class GofrugalAdapter implements EcommerceAdapter {
  readonly platform = 'gofrugal'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // Connect Link support
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(): string {
    return buildAuthUrl()
  }

  async exchangeCode(): Promise<Credentials> {
    return gofrugalExchangeCode()
  }

  /** A merchant's X-Auth-Token is a static configured key — it doesn't expire. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): GofrugalClient {
    return new GofrugalClient(credentials)
  }

  private pagination(params: QueryParams): { page: number; limit: number } {
    return {
      page: params.page ?? 1,
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  /**
   * `GET /items` documents no pagination at all ("Used to list all the
   * items"; no page, limit or q parameter) — it returns the whole collection
   * in one call. Callers page it locally with `pageLocally`, which reports
   * `pagedLocally` and an exact total.
   * https://community.gofrugal.com/portal/en/kb/gofrugalretaileasy/ecommerce-integration/api-integration/articles/list-all-items
   */
  private async fetchAllItems(client: GofrugalClient): Promise<RawGofrugalItem[]> {
    const res = await client.get<{ items?: RawGofrugalItem[] }>('/items')
    return res.items ?? []
  }

  // ── Products (read-only, list-only) ─────────────────────────────────────
  // https://community.gofrugal.com/portal/en/kb/gofrugalretaileasy/ecommerce-integration/api-integration/articles/api-integration
  // No per-item GET and no create/update/delete are documented.

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.client(credentials)
    const items = await this.fetchAllItems(client)
    return pageLocally(items, params).map((item) => transformProduct(item, client.currency))
  }

  // ── Inventory (read-only) ────────────────────────────────────────────────
  // Stock is embedded on the same `GET /items` payload as products — see
  // transform/inventory.ts. No adjust/set endpoint is documented. (Stock
  // counts carry no money field, so no currency is needed here.)

  async listInventoryLevels(credentials: Credentials, params: QueryParams): Promise<InventoryLevel[]> {
    const client = this.client(credentials)
    const items = await this.fetchAllItems(client)
    // Flatten before slicing: one item row can carry several stock entries,
    // so slicing items would overshoot the caller's limit.
    return pageLocally(items.flatMap(transformInventoryLevels), params)
  }

  // ── Orders ────────────────────────────────────────────────────────────────
  // `GET /salesOrders` documents `page`/`limit` (max 250 total) and a `q`
  // date-range filter (`q=createdAt>=...,createdAt<=...`). No total-count or
  // next-page indicator is documented in the list response, so `hasMore`
  // is left unreported rather than guessed from a full page (see
  // `@opensteward/shared`'s `reportUpstreamPage` header comment on why a
  // length===limit guess is the wrong default).

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.client(credentials)
    const { page, limit } = this.pagination(params)
    const query: Record<string, unknown> = { page, limit }
    if (params.updatedAfter) query['q'] = `createdAt>=${formatGofrugalDate(params.updatedAfter)}`
    const res = await client.get<{ salesOrders?: RawGofrugalSalesOrder[] }>('/salesOrders', query)
    reportUpstreamPage(params, { currentPage: page })
    return (res.salesOrders ?? []).map((order) => transformOrder(order, client.currency))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.client(credentials)
    const res = await client.get<{ salesOrder: RawGofrugalSalesOrder }>(`/salesOrders/${id}`)
    return transformOrder(res.salesOrder, client.currency)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).post<CreateSalesOrderResult>('/salesOrders', {
      salesOrder: untransformOrder(data),
    })
    if (res.result?.status && res.result.status.toLowerCase() !== 'success') {
      throw new Error(
        `GOFRUGAL rejected sales order creation: ${res.result.Message ?? res.result.status}`,
      )
    }
    return this.getOrder(credentials, String(res.result.id))
  }
}

/** `"YYYY-MM-DD HH:MM:SS"` — the format shown in the documented `q` filter example. */
function formatGofrugalDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  )
}
