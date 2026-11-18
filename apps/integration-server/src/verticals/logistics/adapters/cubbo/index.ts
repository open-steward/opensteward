import { reportUpstreamPage, type CredentialField } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Warehouse } from '../../schema/warehouse'

import {
  credentialFields as cubboCredentialFields,
  exchangeCredentials as cubboExchangeCredentials,
  refreshCredentials as doRefresh,
} from './auth'
import { CubboClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformOrder, type CubboOrder } from './transform/order'

interface CubboAdapterConfig {
  sandbox?: boolean
}

/** The documented GET /v1/orders body: `{ orders: [...], meta: { next_page, total_count, ... } }`. */
interface CubboOrdersResponse {
  orders?: CubboOrder[]
  meta?: { next_page?: number | null; total_count?: number }
}

/**
 * A 501 for a read Cubbo's published API cannot serve, thrown before any
 * request is sent.
 */
function refuse(what: string): Error {
  return Object.assign(new Error(`Cubbo cannot ${what}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

// ── Resource coverage ──────────────────────────────────────────────
// Source: the public Postman collection behind https://developers.cubbo.com/
// (50 requests). Orders are listed through GET /v1/orders. Shipments, tracking
// events and warehouses have no endpoint in it, so those reads refuse with 501.
// Carrier, label, manifest and rate are not implemented by this adapter.

/**
 * Cubbo 3PL fulfillment adapter.
 *
 * Cubbo is a Latin-American fulfilment platform (Mexico, Brazil, Colombia, etc.)
 * providing warehousing, pick-pack, and last-mile delivery for e-commerce merchants.
 *
 * Auth: OAuth2 client_credentials — POST client_id + client_secret to the token
 *       endpoint; all API requests carry an `Authorization: Bearer <token>` header.
 * Docs: https://developers.cubbo.com/
 */
export class CubboAdapter implements LogisticsAdapter {
  readonly platform = 'cubbo'
  readonly version = '1'
  /** GET /v1/orders, the one list this adapter serves, takes per_page up to 100. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config: CubboAdapterConfig = {}) {}

  // ── Auth ─────────────────────────────────────────────────────────────────────

  credentialFields(): CredentialField[] {
    return cubboCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return cubboExchangeCredentials(fields)
  }

  getAuthUrl(_state: string): string {
    throw new Error(
      'Cubbo uses OAuth2 client_credentials; use credentialFields() instead of getAuthUrl()',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'Cubbo uses OAuth2 client_credentials; use exchangeCredentials() instead of exchangeCode()',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Orders ───────────────────────────────────────────────────────────────────

  /**
   * GET /v1/orders (developers.cubbo.com, "Get Orders"). The request
   * description: "page (default 1) and per_page (default 10, max 100 — a
   * larger value is silently clamped to 100). The response carries a meta
   * object"; the collection overview: "Detecting the last page: use
   * next_page == null. Do not rely on last_page". Rows are under `orders`.
   *
   * store_id is not sent: the Get Orders docs do not mark it required (unlike
   * GET /orders/with-fields, "store_id (required)"), and the connection holds
   * no store id. The documented query has no updated-since filter, so
   * `updatedAfter` is not forwarded and the caller gets the unfiltered pages.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const p = Number(params.page)
    const n = Number(params.limit)
    const page = Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1
    const perPage =
      Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE
    const client = new CubboClient(credentials)
    const res = await client.get<CubboOrdersResponse>('orders', { page, per_page: perPage })
    if (!Array.isArray(res?.orders)) {
      throw new Error('Cubbo GET /orders response carried no orders array')
    }
    const meta = res.meta
    reportUpstreamPage(params, {
      pageSize: perPage,
      ...(meta && 'next_page' in meta ? { hasMore: meta.next_page != null } : {}),
      ...(typeof meta?.total_count === 'number' ? { totalCount: meta.total_count } : {}),
    })
    return res.orders.map(transformOrder)
  }

  /** Cubbo documents no single-order read: see {@link refuse}. */
  async getOrder(_credentials: Credentials, _id: string): Promise<Order> {
    throw refuse(
      'read one order: the published API has no GET /v1/orders/:id; orders are read only through the GET /v1/orders list',
    )
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new CubboClient(credentials)
    const res = await client.post<{ data: CubboOrder }>('orders', {
      order_number: data.orderNumber,
      customer_id: data.customerId,
      warehouse_id: data.warehouseId,
      destination_address: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            address_line_1: data.destinationAddress.street1,
            address_line_2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      origin_address: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address_line_1: data.originAddress.street1,
            address_line_2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postal_code: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      items: data.lineItems?.map((li) => ({
        sku: li.sku,
        name: li.name,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unitAmount,
      })),
      currency: data.currency,
      notes: data.notes,
      requested_service_code: data.requestedServiceCode,
    })
    return transformOrder(res.data)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new CubboClient(credentials)
    await client.patch<unknown>(`orders/${encodeURIComponent(id)}/cancel`, {})
  }

  // ── Shipments, tracking, warehouses ─────────────────────────────────────────
  //
  // None of these has an endpoint among the 50 requests of Cubbo's published
  // collection (folders: Authentication, Shipping Methods, Orders, Inventory,
  // Replenishments, Webhooks, Stores, Pick-up Locations - Click and Collect,
  // Returns, Shipping Labels). Tracking exists only per order: "Each order
  // includes a delivery_tracking array with one entry per package", carrying a
  // current shipping_status and no event history or timestamps.

  async listShipments(_credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    throw refuse('list shipments: the published API has no shipments endpoint')
  }

  async getShipment(_credentials: Credentials, _id: string): Promise<Shipment> {
    throw refuse('read a shipment: the published API has no shipments endpoint')
  }

  async getTrackingEvents(
    _credentials: Credentials,
    _trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    throw refuse(
      'read tracking events: the published API has no tracking endpoint, and an order’s delivery_tracking holds only a current shipping_status per package',
    )
  }

  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    throw refuse(
      'list tracking events: the published API has no tracking endpoint, and an order’s delivery_tracking holds only a current shipping_status per package',
    )
  }

  async listWarehouses(_credentials: Credentials, _params: QueryParams): Promise<Warehouse[]> {
    throw refuse('list warehouses: the published API has no warehouses endpoint')
  }

  async getWarehouse(_credentials: Credentials, _id: string): Promise<Warehouse> {
    throw refuse('read a warehouse: the published API has no warehouses endpoint')
  }
}
