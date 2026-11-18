/**
 * Ozon adapter for the ecommerce vertical.
 *
 * Maps the Ozon Seller API (https://api-seller.ozon.ru, RPC over HTTP POST)
 * to canonical ecommerce resources. Ozon is a marketplace: there is no
 * storefront, no customer list, no collections and no discount codes (see
 * ./metadata.ts for the reasons).
 *
 * Auth: a Client-Id + Api-Key pair minted per seller in the seller dashboard,
 * sent as headers on every request. No OAuth.
 *
 * Implemented, each against a method confirmed live on 2026-09-13 and whose
 * shapes come from Ozon's official spec:
 *   Locations  list, get          POST /v1/warehouse/list
 *   Inventory  set (absolute)     POST /v2/products/stocks
 *   Orders     list               POST /v3/posting/fbs/list   (offset + has_next;
 *                                 no window → full-history walk, see ./history.ts)
 *              get                POST /v3/posting/fbs/get
 *              cancel             POST /v2/posting/fbs/cancel
 *   Refunds    list               POST /v3/returns/company/fbs (last_id cursor)
 *   Transactions list             POST /v3/finance/transaction/list (page + page_count;
 *                                 no window → full-history walk, see ./history.ts)
 *
 * Deliberately not implemented:
 *   adjustInventoryLevel — Ozon has no delta method; `/v2/products/stocks`
 *     sets an absolute quantity, and a read-then-write delta would race
 *     Ozon's own reservations.
 *   Products — the product-read methods in the last retrievable official
 *     spec have been switched off (404); their replacements' shapes could
 *     not be verified. Nothing is guessed.
 *   Fulfillments — `/v4/posting/fbs/ship` exists but its response schema is
 *     not resolvable in the retrieved spec.
 *   Webhooks — Ozon push notifications carry no signature (the spec only
 *     lists sender IP ranges), so there is nothing to verify fail-closed.
 *
 * Docs: https://docs.ozon.ru/api/seller/
 * Archived official spec:
 *   https://web.archive.org/web/20240531073337/https://docs.ozon.ru/api/seller/swagger.json
 */
import { cursorPagerKey, customForm, pageByCursor, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'

import { OzonClient } from './client'
import {
  CANCEL_REASON_OTHER,
  FINANCE_MAX_PAGE_SIZE,
  FINANCE_MAX_WINDOW_DAYS,
  FINANCE_TRANSACTION_LIST,
  FINANCE_WINDOWS_PER_CALL,
  OZON_HISTORY_FLOOR,
  POSTING_FBS_CANCEL,
  POSTING_FBS_GET,
  POSTING_FBS_LIST,
  POSTINGS_MAX_LIMIT,
  POSTINGS_MAX_WINDOW_DAYS,
  POSTINGS_WINDOWS_PER_CALL,
  RETURNS_FBS_LIST,
  RETURNS_MAX_LIMIT,
  STOCKS_UPDATE,
  WAREHOUSE_LIST,
} from './constants'
import { walkHistoryPage, type HistoryCursor } from './history'
import { transformLocation, type RawOzonWarehouse } from './transform/location'
import {
  toStockUpdateBody,
  transformStockUpdate,
  type RawOzonStockUpdateResult,
} from './transform/inventory'
import { transformOrder, type RawOzonPosting } from './transform/order'
import { transformRefund, type RawOzonFbsReturn } from './transform/refund'
import { transformTransaction, type RawOzonFinanceOperation } from './transform/transaction'

const DAY_MS = 86_400_000

const NO_OAUTH =
  'Ozon does not use OAuth — connect with the Client ID and API key from the Ozon seller dashboard (Settings → API keys).'

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: true,
      helpText: 'Ozon seller dashboard → Settings → API keys. Sent as the Client-Id header.',
    },
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      helpText: 'Generated on the same page. Sent as the Api-Key header.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const clientId = (fields['clientId'] ?? '').trim()
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!clientId || !apiKey) {
      throw new Error('Client ID and API key are both required.')
    }
    return { accessToken: apiKey, extra: { clientId } }
  },
})

/** A 1-based page number from the worker's `page`. */
function pageNumber(page: unknown): number {
  const n = Math.floor(Number(page ?? 1))
  return Number.isFinite(n) && n > 1 ? n : 1
}

/** The worker's `limit`, within Ozon's documented 1…max. */
function clampLimit(limit: unknown, max: number): number {
  const n = Math.floor(Number(limit ?? max))
  return Number.isFinite(n) && n >= 1 ? Math.min(n, max) : max
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the factory passes a config object; Ozon needs none.
export interface OzonAdapterConfig {}

export class OzonAdapter implements EcommerceAdapter {
  readonly platform = 'ozon'
  readonly version = '0.2.0'

  /**
   * Postings and returns both cap `limit` at 1000. Declared, not just
   * clamped: the sync worker's short-page test must see the same ceiling, or
   * a full clamped page reads as the last one.
   */
  readonly capabilities = { maxPageSize: POSTINGS_MAX_LIMIT }

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  constructor(_config: OzonAdapterConfig = {}) {}

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    throw new Error(NO_OAUTH)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(NO_OAUTH)
  }

  /** Ozon API keys do not expire. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  /** Per-connection cursor scope: the Client-Id, never the API key. */
  private pagerScope(credentials: Credentials): string {
    return `ozon:${String(credentials.extra?.['clientId'] ?? '')}`
  }

  // ── Locations (seller warehouses) ─────────────────────────────────────────

  /**
   * `/v1/warehouse/list` takes no parameters and returns every warehouse at
   * once, so only page 1 has rows — later pages are empty rather than the
   * same warehouses again.
   */
  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    if (pageNumber(params.page) > 1) {
      reportUpstreamPage(params, { hasMore: false })
      return []
    }
    const warehouses = await this.warehouses(credentials)
    reportUpstreamPage(params, { hasMore: false })
    return warehouses.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const match = (await this.warehouses(credentials)).find((w) => String(w.warehouse_id) === id)
    if (!match) throw new Error(`Ozon warehouse ${id} not found`)
    return transformLocation(match)
  }

  private async warehouses(credentials: Credentials): Promise<RawOzonWarehouse[]> {
    const res = await new OzonClient(credentials).post<{ result?: RawOzonWarehouse[] }>(WAREHOUSE_LIST, {})
    return res.result ?? []
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  /**
   * Set stock for `variantId` (the seller's `offer_id`) on `locationId` (an
   * Ozon warehouse id). Ozon allows one update per warehouse per two minutes
   * and 80 requests a minute; a refusal surfaces Ozon's own error code.
   */
  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const body = toStockUpdateBody(data.variantId, data.locationId, data.available)
    const res = await new OzonClient(credentials).post<{ result?: RawOzonStockUpdateResult[] }>(
      STOCKS_UPDATE,
      body,
    )
    const item = (res.result ?? []).find(
      (r) => r.offer_id === data.variantId && String(r.warehouse_id) === data.locationId,
    )
    if (!item) {
      throw new Error(
        `Ozon returned no result for the stock update of ${data.variantId} on warehouse ${data.locationId}`,
      )
    }
    return transformStockUpdate(item, data.available)
  }

  // ── Orders (FBS postings) ─────────────────────────────────────────────────

  /**
   * Ozon lists postings only for a `since`/`to` period of at most one year.
   *
   * With both `since` and `to`, exactly that window is paged by offset. With
   * neither — the sync worker's call — the whole history is walked back from
   * now in calendar-year windows to `OZON_HISTORY_FLOOR` (./history.ts), so a
   * finished sync covers everything rather than a guessed recent slice.
   * Params: `since`, `to` (ISO 8601 UTC), optional `status`.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const since = typeof params['since'] === 'string' ? params['since'] : undefined
    const to = typeof params['to'] === 'string' ? params['to'] : undefined
    if (since === undefined && to === undefined) return this.walkOrders(credentials, params)
    if (!since || !to) {
      throw new Error(
        'Ozon lists postings within a since/to window of at most one year (ISO 8601 UTC): ' +
          'pass both since and to, or neither to walk the full history.',
      )
    }
    const from = Date.parse(since)
    const until = Date.parse(to)
    if (Number.isNaN(from) || Number.isNaN(until) || until < from) {
      throw new Error(`Ozon posting window is invalid: since=${since} to=${to}`)
    }
    if (until - from > POSTINGS_MAX_WINDOW_DAYS * DAY_MS) {
      throw new Error('Ozon allows a posting window of at most one year.')
    }

    const limit = clampLimit(params.limit, POSTINGS_MAX_LIMIT)
    const filter: Record<string, unknown> = { since, to }
    if (typeof params['status'] === 'string') filter['status'] = params['status']

    const res = await new OzonClient(credentials).post<{
      result?: { postings?: RawOzonPosting[]; has_next?: boolean }
    }>(POSTING_FBS_LIST, {
      dir: 'ASC',
      filter,
      limit,
      offset: (pageNumber(params.page) - 1) * limit,
    })
    reportUpstreamPage(params, { hasMore: res.result?.has_next === true })
    return (res.result?.postings ?? []).map(transformOrder)
  }

  /** One sync page of the full postings history, newest year first. */
  private async walkOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new OzonClient(credentials)
    const limit = clampLimit(params.limit, POSTINGS_MAX_LIMIT)
    const status = typeof params['status'] === 'string' ? params['status'] : undefined

    const page = await pageByCursor<RawOzonPosting, HistoryCursor>(
      cursorPagerKey(this.pagerScope(credentials), `${POSTING_FBS_LIST}#history`, { limit, status }),
      params.page,
      (cursor) =>
        walkHistoryPage<RawOzonPosting>({
          cursor,
          unit: 'year',
          floor: OZON_HISTORY_FLOOR,
          firstPosition: 0,
          maxWindows: POSTINGS_WINDOWS_PER_CALL,
          idOf: (posting) => posting.posting_number,
          fetchWindow: async (window, offset) => {
            const filter: Record<string, unknown> = { since: window.since, to: window.to }
            if (status !== undefined) filter['status'] = status
            const res = await client.post<{
              result?: { postings?: RawOzonPosting[]; has_next?: boolean }
            }>(POSTING_FBS_LIST, { dir: 'ASC', filter, limit, offset })
            return {
              rows: res.result?.postings ?? [],
              nextPosition: res.result?.has_next === true ? offset + limit : undefined,
            }
          },
        }),
    )
    reportUpstreamPage(params, { hasMore: page.hasMore })
    return page.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await new OzonClient(credentials).post<{ result: RawOzonPosting }>(POSTING_FBS_GET, {
      posting_number: id,
    })
    return transformOrder(res.result)
  }

  /**
   * Cancel a posting. `reason` is either a documented Ozon
   * `cancel_reason_id` (e.g. "352" out of stock) or free text, which Ozon
   * accepts only as reason 402 — "other (seller's fault)" — with the text as
   * the required message. Reasons available for a posting:
   * `POST /v1/posting/fbs/cancel-reason`. Conditionally-delivered postings
   * cannot be cancelled.
   */
  async cancelOrder(credentials: Credentials, id: string, data?: { reason?: string }): Promise<Order> {
    const reason = data?.reason?.trim() ?? ''
    const body: Record<string, unknown> = { posting_number: id }
    if (/^\d+$/.test(reason) && Number(reason) !== CANCEL_REASON_OTHER) {
      body['cancel_reason_id'] = Number(reason)
    } else if (reason && !/^\d+$/.test(reason)) {
      body['cancel_reason_id'] = CANCEL_REASON_OTHER
      body['cancel_reason_message'] = reason
    } else {
      throw new Error(
        'Ozon requires a cancellation reason: pass a documented cancel_reason_id (e.g. "352" — out of stock) ' +
          'or free text, which is sent as reason 402 "other (seller’s fault)".',
      )
    }
    const res = await new OzonClient(credentials).post<{ result?: boolean }>(POSTING_FBS_CANCEL, body)
    if (res.result !== true) throw new Error(`Ozon did not cancel posting ${id}`)
    return this.getOrder(credentials, id)
  }

  // ── Refunds (FBS returns) ─────────────────────────────────────────────────

  /**
   * `/v3/returns/company/fbs` pages by `last_id` ("returns whose ids are
   * greater than last_id"), walked through the shared cursor pager. A page
   * shorter than `limit` is the last. Rows with no posting number are
   * skipped rather than given an invented order id.
   */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const client = new OzonClient(credentials)
    const limit = clampLimit(params.limit, RETURNS_MAX_LIMIT)
    const body = { filter: {}, limit }

    const page = await pageByCursor<RawOzonFbsReturn, number>(
      cursorPagerKey(this.pagerScope(credentials), RETURNS_FBS_LIST, body),
      params.page,
      async (lastId) => {
        const res = await client.post<{ returns?: RawOzonFbsReturn[]; last_id?: number }>(
          RETURNS_FBS_LIST,
          lastId === undefined ? body : { ...body, last_id: lastId },
        )
        const rows = res.returns ?? []
        return { items: rows, next: rows.length === limit && res.last_id ? res.last_id : undefined }
      },
    )
    reportUpstreamPage(params, { hasMore: page.hasMore })
    return page.items.map(transformRefund).filter((r): r is Refund => r !== undefined)
  }

  // ── Transactions (finance operations) ─────────────────────────────────────

  /**
   * Ozon returns finance operations only for a `from`/`to` period of at most
   * one month, paged by `page` with `page_count` in the response.
   *
   * With both `from` and `to`, exactly that window is paged. With neither —
   * the sync worker's call — the whole history is walked back from now in
   * calendar-month windows to `OZON_HISTORY_FLOOR` (./history.ts).
   * Params: `from`, `to` (ISO 8601).
   */
  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const from = typeof params['from'] === 'string' ? params['from'] : undefined
    const to = typeof params['to'] === 'string' ? params['to'] : undefined
    if (from === undefined && to === undefined) return this.walkTransactions(credentials, params)
    if (!from || !to) {
      throw new Error(
        'Ozon lists finance operations within a from/to window of at most one month (ISO 8601): ' +
          'pass both from and to, or neither to walk the full history.',
      )
    }
    const start = Date.parse(from)
    const end = Date.parse(to)
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
      throw new Error(`Ozon finance window is invalid: from=${from} to=${to}`)
    }
    if (end - start > FINANCE_MAX_WINDOW_DAYS * DAY_MS) {
      throw new Error('Ozon allows a finance window of at most one month.')
    }

    const page = pageNumber(params.page)
    const res = await new OzonClient(credentials).post<{
      result?: { operations?: RawOzonFinanceOperation[]; page_count?: number }
    }>(FINANCE_TRANSACTION_LIST, {
      filter: { date: { from, to }, transaction_type: 'all' },
      page,
      page_size: clampLimit(params.limit, FINANCE_MAX_PAGE_SIZE),
    })
    reportUpstreamPage(params, { hasMore: page < (res.result?.page_count ?? 0) })
    return (res.result?.operations ?? []).map(transformTransaction)
  }

  /** One sync page of the full finance history, newest month first. */
  private async walkTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new OzonClient(credentials)
    const pageSize = clampLimit(params.limit, FINANCE_MAX_PAGE_SIZE)

    const page = await pageByCursor<RawOzonFinanceOperation, HistoryCursor>(
      cursorPagerKey(this.pagerScope(credentials), `${FINANCE_TRANSACTION_LIST}#history`, { page_size: pageSize }),
      params.page,
      (cursor) =>
        walkHistoryPage<RawOzonFinanceOperation>({
          cursor,
          unit: 'month',
          floor: OZON_HISTORY_FLOOR,
          firstPosition: 1,
          maxWindows: FINANCE_WINDOWS_PER_CALL,
          idOf: (operation) => String(operation.operation_id),
          fetchWindow: async (window, upstreamPage) => {
            const res = await client.post<{
              result?: { operations?: RawOzonFinanceOperation[]; page_count?: number }
            }>(FINANCE_TRANSACTION_LIST, {
              filter: { date: { from: window.since, to: window.to }, transaction_type: 'all' },
              page: upstreamPage,
              page_size: pageSize,
            })
            return {
              rows: res.result?.operations ?? [],
              nextPosition: upstreamPage < (res.result?.page_count ?? 0) ? upstreamPage + 1 : undefined,
            }
          },
        }),
    )
    reportUpstreamPage(params, { hasMore: page.hasMore })
    return page.items.map(transformTransaction)
  }
}
