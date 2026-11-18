/**
 * Unicommerce (Uniware) adapter — inventory vertical.
 *
 * Unicommerce is an India-focused multi-channel WMS/OMS platform.
 * Auth: OAuth2 password-grant → bearer token stored in credentials.accessToken.
 *       Tenant subdomain in credentials.extra.tenant.
 *       Facility/warehouse code in credentials.extra.facility.
 *
 * Supported resources: products, stock-levels, locations, purchase-orders,
 *                      stock-transfers (gatepasses of type STOCK_TRANSFER).
 *
 * Not supported: suppliers (no public list/get vendor API), stock-adjustments
 *   (write-only single-item API; no list/get endpoint documented).
 *
 * Pagination: product search uses displayStart/displayLength offset paging.
 *   Inventory snapshots, facility search and purchase-order search document
 *   no paging parameter and no order. Each answers with every row matching
 *   its request, so every page re-sends the same request, sorts the answer by
 *   id and slices the caller's page from it with pageLocally.
 *   Stock levels are not every SKU: with no filter the snapshot request asks
 *   for the SKUs updated in the last 24 hours (the documented maximum), so
 *   the list and its reported total cover only those.
 *   Purchase-order search returns codes only; the codes are sliced first and
 *   details are fetched serially for the page's codes alone.
 */
import type { AxiosError } from 'axios'
import { pageLocally, type CredentialField, type Credentials, type QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { PurchaseOrder } from '../../schema/purchase-order'
import type { StockTransfer } from '../../schema/stock-transfer'

import {
  credentialFields as unicommerceCredentialFields,
  exchangeCredentials as unicommerceExchangeCredentials,
  refreshCredentials as unicommerceRefreshCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {UnicommerceClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawUnicommerceProduct} from './transform/product'
import {transformStockLevel, type RawUnicommerceInventorySnapshot} from './transform/stock-level'
import {transformLocation, type RawUnicommerceLocation} from './transform/location'
import {transformPurchaseOrder, type RawUnicommercePurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawUnicommerceGatepass} from './transform/stock-transfer'

// ── Unicommerce API response envelopes ─────────────────────────────────────────

interface UniResponse {
  successful?: boolean
  message?: string
}

interface SearchItemsResponse extends UniResponse {
  totalRecords?: number
  elements?: RawUnicommerceProduct[]
}

interface GetItemResponse extends UniResponse {
  itemTypeDTO?: RawUnicommerceProduct
}

interface InventorySnapshotResponse extends UniResponse {
  inventorySnapshots?: RawUnicommerceInventorySnapshot[]
}

interface FacilitySearchResponse extends UniResponse {
  parties?: Array<{ facilityCode?: string; facilityStatus?: string; created?: number; updated?: number }>
}

interface FacilityGetResponse extends UniResponse {
  facility?: RawUnicommerceLocation
}

interface PurchaseOrderSearchResponse extends UniResponse {
  purchaseOrderCodes?: string[]
}

interface PurchaseOrderDetailResponse extends UniResponse {
  // The full PO shape sits at the root of the response, not nested
  id?: number
  code?: string
  [key: string]: unknown
}

interface GatepassGetResponse extends UniResponse {
  elements?: RawUnicommerceGatepass[]
}

// ── Local paging helpers ─────────────────────────────────────────────────────

/**
 * Code-unit order, not locale order: the same on every host. The unpaged
 * endpoints document no order, and every page re-sends the same request and
 * slices its answer by offset, so the answer is sorted first. Otherwise an
 * upstream that returns rows in a different order on a later request could
 * skip a row or serve it twice at a page boundary.
 */
function byCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return byCodeUnits(a.id, b.id)
}

/**
 * Whether a failed getPurchaseOrderDetails call is Uniware refusing this one
 * order (an HTTP 4xx other than 401 or 429). Such an order is left out of its
 * page. Any other failure fails the page: no response, a timeout, an expired
 * token, or a 429 or 5xx still failing after the client's retries. Skipping
 * those turned an outage into a short page that the sync worker then recorded
 * as the complete collection.
 */
function isOrderRefusal(err: unknown): boolean {
  const status = (err as AxiosError | undefined)?.response?.status
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 401 && status !== 429
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export interface UnicommerceAdapterConfig {
  /** No platform-level config required; credentials carry tenant + facility. */
  [key: string]: unknown
}

export class UnicommerceAdapter implements InventoryAdapter {
  readonly platform = 'unicommerce'
  readonly version = '0.1.0'

  constructor(_config?: UnicommerceAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return unicommerceCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return unicommerceExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('unicommerce uses OAuth2 password-grant; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return unicommerceRefreshCredentials(credentials)
  }

  // ── private helpers ─────────────────────────────────────────────────────────

  private client(credentials: Credentials): UnicommerceClient {
    return new UnicommerceClient(credentials)
  }

  // ── Products ────────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page = params.page ?? 1
    const displayStart = (page - 1) * limit

    const res = await this.client(credentials).post<SearchItemsResponse>(
      '/product/itemType/search',
      {
        searchOptions: {
          displayLength: limit,
          displayStart,
          getCount: false,
        },
      },
    )
    return (res.elements ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).post<GetItemResponse>(
      '/catalog/itemType/get',
      { skuCode: id },
    )
    if (!res.itemTypeDTO) {
      throw new Error(`unicommerce: product with skuCode ${id} not found`)
    }
    return transformProduct(res.itemTypeDTO)
  }

  // ── StockLevels ─────────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    // inventorySnapshot/get requires at least itemTypeSKUs OR updatedSinceInMinutes.
    // When called with no filter we request the last 24 h (max 1440 min).
    const updatedSince = Number(params.updatedSinceMinutes ?? 1440)

    const res = await this.client(credentials).postFacility<InventorySnapshotResponse>(
      '/inventory/inventorySnapshot/get',
      { updatedSinceInMinutes: updatedSince },
    )
    // The request documents no paging or size parameter: every snapshot
    // matching the filter comes back at once, so page it here. The total is
    // the SKUs in that window, not every SKU in the facility. The window is
    // measured from each request's own time, so a SKU can enter or leave it
    // between two pages; sorting cannot stop that, only pin the order.
    const levels = (res.inventorySnapshots ?? []).map(transformStockLevel).sort(byId)
    return pageLocally(levels, params)
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    // id = SKU code
    const res = await this.client(credentials).postFacility<InventorySnapshotResponse>(
      '/inventory/inventorySnapshot/get',
      { itemTypeSKUs: [id] },
    )
    const snap = res.inventorySnapshots?.[0]
    if (!snap) {
      throw new Error(`unicommerce: inventory snapshot for SKU ${id} not found`)
    }
    return transformStockLevel(snap)
  }

  // ── Locations (Facilities) ──────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).post<FacilitySearchResponse>(
      '/facility/search',
      { facilityStatus: 'ALL' },
    )
    // facility/search documents no paging or size parameter and returns every
    // matching facility, so page it here.
    const locations = (res.parties ?? [])
      .map((p) => transformLocation(p as RawUnicommerceLocation))
      .sort(byId)
    return pageLocally(locations, params)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).post<FacilityGetResponse>(
      '/facility/get',
      { facilityCode: id },
    )
    if (!res.facility) {
      throw new Error(`unicommerce: facility ${id} not found`)
    }
    return transformLocation(res.facility)
  }

  // ── PurchaseOrders ──────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    // Search documents no paging or size parameter and returns every matching
    // code, so slice the caller's page from the codes BEFORE the per-code
    // detail calls: only this page's orders are fetched. The reported total
    // counts codes, so a page that leaves out a refused order is short of it.
    const res = await this.client(credentials).post<PurchaseOrderSearchResponse>(
      '/purchase/purchaseOrder/getPurchaseOrders',
      {},
    )
    const codes = pageLocally([...(res.purchaseOrderCodes ?? [])].sort(byCodeUnits), params)
    const orders: PurchaseOrder[] = []
    for (const code of codes) {
      let detail: PurchaseOrderDetailResponse
      try {
        // getPurchaseOrderDetails is documented as Level: Facility.
        detail = await this.client(credentials).postFacility<PurchaseOrderDetailResponse>(
          '/purchase/purchaseOrder/getPurchaseOrderDetails',
          { purchaseOrderCode: code },
        )
      } catch (err) {
        if (isOrderRefusal(err)) continue
        throw err
      }
      // Uniware's documented envelope carries an error in the body
      // (`successful: false` with an `errors` list) rather than an order. Such
      // an answer is the same refusal, and transforming it would give a row
      // with an empty id. getPurchaseOrder applies the same test.
      if (!detail.code && !detail.id) continue
      orders.push(transformPurchaseOrder(detail as unknown as RawUnicommercePurchaseOrder))
    }
    return orders
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    // Level: Facility, like every getPurchaseOrderDetails call.
    const res = await this.client(credentials).postFacility<PurchaseOrderDetailResponse>(
      '/purchase/purchaseOrder/getPurchaseOrderDetails',
      { purchaseOrderCode: id },
    )
    if (!res.code && !res.id) {
      throw new Error(`unicommerce: purchase order ${id} not found`)
    }
    return transformPurchaseOrder(res as unknown as RawUnicommercePurchaseOrder)
  }

  // ── StockTransfers (Gatepasses type=STOCK_TRANSFER) ─────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const facilityCode = String(credentials.extra?.['facility'] ?? '')
    // Unicommerce gatepass/get requires specific gatepass codes — there's no
    // "list all" endpoint without codes. We use a thin adapter pattern: if the
    // caller supplies codes via params.ids we fetch those; otherwise return [].
    const codes = (params as Record<string, unknown>)['ids'] as string[] | undefined
    if (!codes?.length) return []

    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const res = await this.client(credentials).postFacility<GatepassGetResponse>(
      '/purchase/gatepass/get',
      { gatePassCodes: codes.slice(0, limit) },
    )
    return (res.elements ?? [])
      .filter((g) => g.type === 'STOCK_TRANSFER')
      .map((g) => transformStockTransfer({ ...g, fromFacilityCode: facilityCode }))
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const facilityCode = String(credentials.extra?.['facility'] ?? '')
    const res = await this.client(credentials).postFacility<GatepassGetResponse>(
      '/purchase/gatepass/get',
      { gatePassCodes: [id] },
    )
    const gp = res.elements?.[0]
    if (!gp) throw new Error(`unicommerce: gatepass ${id} not found`)
    return transformStockTransfer({ ...gp, fromFacilityCode: facilityCode })
  }
}
