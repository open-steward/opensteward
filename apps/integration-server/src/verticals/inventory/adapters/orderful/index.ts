/**
 * Orderful adapter for the inventory vertical.
 *
 * Orderful is a modern EDI platform. Resources map as follows:
 *
 *   PurchaseOrders → GET /v3/transactions?transactionType=850_PURCHASE_ORDER
 *   StockLevels    → refused (501): no stock-level resource; see listStockLevels
 *   Suppliers      → GET /v3/relationships  (trading partners)
 *
 * Auth: single API key via `orderful-api-key` header.
 * Pagination: cursor-based. "The next page of results is indicated using a
 *   link with a `nextCursor` parameter" (https://docs.orderful.com/reference/pagination),
 *   at `metadata.pagination.links.next`, null on the last page.
 *   /relationships also takes `limit` (max 100); /transactions takes no size
 *   and returns "A maximum of 100 Transactions ... at a time."
 * No HMAC/JWT webhook signing documented — webhook.ts omitted.
 *
 * Docs: https://docs.orderful.com/reference/overview
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: location — Orderful has no location master-data endpoint;
 *   it is a pure EDI transaction routing platform with no dedicated REST
 *   resource for warehouses or locations (confirmed via llms.txt endpoint index).
 * Unavailable: product — Orderful has no product catalog endpoint; product
 *   data is embedded in 850/832 EDI transaction messages, not a REST resource.
 * Unverified:  stock-adjustment — EDI transaction type
 *   947_WAREHOUSE_INVENTORY_ADJUSTMENT_ADVICE confirmed at /v3/transactions,
 *   but Mosaic JSON message schema requires login access to verify field names.
 * Unverified:  stock-transfer — EDI transaction types
 *   943_WAREHOUSE_STOCK_TRANSFER_SHIPMENT_ADVICE and
 *   944_WAREHOUSE_STOCK_TRANSFER_RECEIPT_ADVICE confirmed at /v3/transactions,
 *   but Mosaic JSON message schema requires login access to verify field names.
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  reportUpstreamPage,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { StockLevel } from '../../schema/stock-level'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'

import {
  credentialFields as orderfulCredentialFields,
  exchangeCredentials as orderfulExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { OrderfulClient } from './client'
import { API_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformPurchaseOrder, type RawOrderfulTransaction } from './transform/purchase-order'
import { transformSupplier, type RawOrderfulRelationship } from './transform/supplier'
export type OrderfulAdapterConfig = Record<string, never>

/** Orderful v3 paginated list envelope. */
interface OrderfulListResponse<T> {
  data: T[]
  metadata?: {
    pagination?: { links?: { next?: string | null; prev?: string | null } }
  }
}

/**
 * The percent-decoded `nextCursor` query value of `link`, or undefined when it
 * is absent, empty or not validly percent-encoded.
 *
 * Decoded with decodeURIComponent, not URLSearchParams, which would read a
 * base64 `+` as a space.
 */
function nextCursorParam(link: string): string | undefined {
  const query = link.includes('?') ? (link.slice(link.indexOf('?') + 1).split('#')[0] ?? '') : ''
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=')
    if (eq > 0 && pair.slice(0, eq) === 'nextCursor' && eq < pair.length - 1) {
      try {
        return decodeURIComponent(pair.slice(eq + 1))
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

/**
 * The cursor that starts the page after `res`: the `nextCursor` query value of
 * `metadata.pagination.links.next`, or undefined when the link is null (the
 * last page). The pagination guide's example is
 * `"next": "https://{baseUrl}/v3/transactions?nextCursor=Mjk3NDk%3D"`.
 *
 * A next link with no usable `nextCursor` is refused as an upstream fault
 * (502): ending the walk there would mark a truncated collection complete.
 */
function nextCursorOf(res: OrderfulListResponse<unknown>, path: string): string | undefined {
  const link = res.metadata?.pagination?.links?.next
  if (link == null || link === '') return undefined
  const cursor = nextCursorParam(link)
  if (cursor !== undefined) return cursor
  throw Object.assign(
    new Error(
      `orderful GET ${path}: metadata.pagination.links.next carries no usable nextCursor (${link})`,
    ),
    { statusCode: 502, code: 'UPSTREAM_ERROR' },
  )
}

export class OrderfulAdapter implements InventoryAdapter {
  readonly platform = 'orderful'
  readonly version = '0.1.0'

  constructor(_config: OrderfulAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return orderfulCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return orderfulExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('orderful uses a static API key; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): OrderfulClient {
    return new OrderfulClient(credentials)
  }

  /**
   * Pager scope for one connection. Orderful has no account id in the
   * credentials (an API key alone reaches one organization), so the scope is
   * the host plus a fingerprint of the key.
   */
  private pagerScope(credentials: Credentials): string {
    return connectionScope(API_BASE_URL, credentials)
  }

  // ── PurchaseOrders ───────────────────────────────────────────────────────

  /**
   * GET /v3/transactions takes no page size ("A maximum of 100 Transactions
   * will be returned at a time."), so one upstream page is not one caller
   * page. `pageByRows` walks the `nextCursor` chain and cuts exactly rows
   * [(page − 1) × limit, page × limit), reporting `hasMore` and
   * `pagedLocally` itself. The filter goes with every cursor, not only the
   * first request: the guide's example link carries only `nextCursor`, and
   * its example cursors decode to bare row positions (`Mjk3NDk=` is `29749`),
   * so a cursor alone would page on through every transaction type.
   */
  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = this.client(credentials)
    const query = { transactionType: '850_PURCHASE_ORDER' }
    const { items } = await pageByRows<RawOrderfulTransaction, string>(
      cursorPagerKey(this.pagerScope(credentials), '/transactions', query),
      params,
      async (cursor) => {
        const res = await client.get<OrderfulListResponse<RawOrderfulTransaction>>(
          '/transactions',
          cursor === undefined ? query : { ...query, nextCursor: cursor },
        )
        return { items: res.data ?? [], next: nextCursorOf(res, '/transactions') }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const txn = await this.client(credentials).get<RawOrderfulTransaction>(`/transactions/${id}`)
    return transformPurchaseOrder(txn)
  }

  // ── StockLevels: refused ─────────────────────────────────────────────

  /**
   * Orderful has no stock-level resource. Stock reaches it only inside 846
   * Inventory Inquiry/Advice documents, and neither list returns their
   * content: v3 GET /v3/transactions describes `message` as "Transaction
   * message. Contains an href link to the message content. When
   * expand=message is used, the full transactionSets array is included."
   * (https://docs.orderful.com/reference/transactioncontrollerv3_list).
   * `expand` is not among that endpoint's documented query parameters, and
   * even if honoured, transactionSets is "the EDI transaction data in
   * Orderful JSON format"
   * (https://docs.orderful.com/reference/transactioncontrollerv3_getmessage),
   * for which Orderful publishes no 846 schema. The
   * content endpoint returns whatever format the relationship trades: "What
   * downloads depends on how the Transaction is backed: Relationships that
   * trade JSON return the JSON document, while X12 and EDIFACT Relationships
   * return the EDI file."
   * (https://docs.orderful.com/reference/transactionv4controller_getmessage).
   * The only 846 content schema published, Mosaic Inventory Advice
   * (https://docs.orderful.com/reference/inventory-advice), reports quantity
   * types "available unavailable incoming allocated maxOrderQuantity" and no
   * on-hand quantity, which StockLevel requires. So the method refuses before
   * sending anything, rather than answering with an empty list the sync would
   * read as "no stock".
   */
  async listStockLevels(_credentials: Credentials, _params: QueryParams): Promise<StockLevel[]> {
    throw Object.assign(
      new Error(
        'Orderful cannot list stock levels: it has no stock-level resource; stock arrives only inside 846 documents whose content "depends on how the Transaction is backed" (X12, EDIFACT or JSON), and the published 846 schema carries no on-hand quantity',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async getStockLevel(_credentials: Credentials, _id: string): Promise<StockLevel> {
    throw Object.assign(
      new Error(
        'Orderful cannot read stock levels: it has no stock-level resource, only 846 Inventory Inquiry/Advice documents',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  // ── Suppliers (trading-partner relationships) ────────────────────────────

  /**
   * GET /v3/relationships pages by `limit` (max 100) and `nextCursor`, so one
   * upstream page is one caller page. `pageByCursor` reaches page N by the
   * cursor chain, remembering where each page starts. A limit over 100 is
   * sent as 100 and reported as the page size, so the router and the sync
   * worker judge the page at the size it was asked for.
   */
  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const asked = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const wanted = Number.isFinite(asked) && asked >= 1 ? Math.floor(asked) : DEFAULT_PAGE_SIZE
    const limit = Math.min(wanted, MAX_PAGE_SIZE)
    const client = this.client(credentials)
    const { items, hasMore } = await pageByCursor<RawOrderfulRelationship, string>(
      cursorPagerKey(this.pagerScope(credentials), '/relationships', { limit }),
      params.page,
      async (cursor) => {
        const res = await client.get<OrderfulListResponse<RawOrderfulRelationship>>(
          '/relationships',
          cursor === undefined ? { limit } : { limit, nextCursor: cursor },
        )
        return { items: res.data ?? [], next: nextCursorOf(res, '/relationships') }
      },
    )
    reportUpstreamPage(params, { hasMore, ...(limit < wanted ? { pageSize: limit } : {}) })
    return items.map(transformSupplier)
  }

  /**
   * Orderful documents no single-relationship read, only the list, so walk
   * GET /v3/relationships at its largest page until the id turns up. An id on
   * no page is a 404: the chain ended without it. A chain that comes back to
   * a cursor it already sent is an upstream fault, not an endless walk.
   */
  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const client = this.client(credentials)
    const sent = new Set<string>()
    let cursor: string | undefined
    for (;;) {
      const res = await client.get<OrderfulListResponse<RawOrderfulRelationship>>(
        '/relationships',
        cursor === undefined
          ? { limit: MAX_PAGE_SIZE }
          : { limit: MAX_PAGE_SIZE, nextCursor: cursor },
      )
      const match = (res.data ?? []).find((r) => String(r.id) === id)
      if (match) return transformSupplier(match)
      const next = nextCursorOf(res, '/relationships')
      if (next === undefined) {
        throw Object.assign(new Error(`orderful relationship ${id} not found`), {
          statusCode: 404,
          code: 'NOT_FOUND',
        })
      }
      if (sent.has(next)) {
        throw Object.assign(
          new Error('orderful GET /relationships: the nextCursor chain loops back on itself'),
          { statusCode: 502, code: 'UPSTREAM_ERROR' },
        )
      }
      sent.add(next)
      cursor = next
    }
  }
}
