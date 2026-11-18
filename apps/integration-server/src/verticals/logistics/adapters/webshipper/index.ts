import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { Carrier } from '../../schema/carrier'
import type { Warehouse } from '../../schema/warehouse'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'

import { connectionScope, cursorPagerKey, pageByRows } from '@opensteward/shared'

import { buildAuthUrl, exchangeCode, refreshCredentials as doRefresh } from './auth'
import { WebshipperClient } from './client'
import { PAGE_SIZE } from './constants'

import {
  transformShipment,
  type WebshipperShipment,
  type WebshipperShipmentResponse,
} from './transform/shipment'
import { transformOrder, type WebshipperOrder } from './transform/order'
import { transformCarrier, type WebshipperCarrier } from './transform/carrier'
import { transformWarehouse, type WebshipperShippingAddress } from './transform/warehouse'
import {
  transformTrackingEvents,
  type WebshipperTrackingListResponse,
  type WebshipperTrackingEvent,
} from './transform/tracking'
import { transformRate, type WebshipperRate } from './transform/rate'
import { transformLabel, type WebshipperLabel } from './transform/label'
import { transformManifest, type WebshipperManifest } from './transform/manifest'

/** JSON:API list response wrapper */
interface JsonApiList<T> {
  data?: T[]
  [key: string]: unknown
}

/** JSON:API single response wrapper */
interface JsonApiSingle<T> {
  data?: T
  [key: string]: unknown
}

/**
 * Upstream pages one list call may walk. At Webshipper's fixed 30 records a
 * page this covers the router's largest caller page many times over.
 */
const MAX_LIST_PAGES = 200

/**
 * One caller page of a Webshipper collection.
 *
 * Webshipper documents "a fixed page limit of 30 records. To fetch more
 * records use the query parameter page[number]" (docs.webshipper.io, 1.1
 * Conventions). No page size, next link or total is documented, so walk
 * `page[number]` 1, 2, 3… and treat a page shorter than 30 as the last;
 * pageByRows cuts the caller's `{ page, limit }` out of those.
 */
async function listCollection<Raw, T>(
  credentials: Credentials,
  params: QueryParams,
  path: string,
  filters: Record<string, string>,
  transform: (rows: Raw[]) => T[],
): Promise<T[]> {
  const client = new WebshipperClient(credentials)
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const account = `webshipper:${String(extra.accountSlug ?? '')}`
  const key = cursorPagerKey(connectionScope(account, credentials), path, {
    ...filters,
    pageSize: PAGE_SIZE,
  })
  const { items } = await pageByRows<T, number>(
    key,
    params,
    async (cursor) => {
      const page = cursor ?? 1
      const res = await client.get<JsonApiList<Raw>>(path, { ...filters, 'page[number]': page })
      const rows = res.data ?? []
      return { items: transform(rows), next: rows.length >= PAGE_SIZE ? page + 1 : null }
    },
    { maxUpstreamPages: MAX_LIST_PAGES },
  )
  return items
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

interface WebshipperAdapterConfig {
  sandbox?: boolean
}

export class WebshipperAdapter implements LogisticsAdapter {
  readonly platform = 'webshipper'
  readonly version = '1'

  constructor(_config: WebshipperAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    return listCollection<WebshipperShipment, Shipment>(credentials, params, 'shipments', {}, (rows) =>
      rows.map(transformShipment),
    )
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new WebshipperClient(credentials)
    const res = await client.get<JsonApiSingle<WebshipperShipment>>(`shipments/${encodeURIComponent(id)}`)
    return transformShipment(res.data ?? {})
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new WebshipperClient(credentials)
    const body = {
      data: {
        type: 'shipments',
        attributes: {
          reference: data.reference,
          service_code: data.serviceCode,
          delivery_address: data.destinationAddress
            ? {
                att_contact: data.destinationAddress.name,
                company_name: data.destinationAddress.company,
                address_1: data.destinationAddress.street1,
                address_2: data.destinationAddress.street2,
                city: data.destinationAddress.city,
                state: data.destinationAddress.state,
                zip: data.destinationAddress.postalCode,
                country_code: data.destinationAddress.country,
                phone: data.destinationAddress.phone,
                email: data.destinationAddress.email,
              }
            : undefined,
          sender_address: data.originAddress
            ? {
                att_contact: data.originAddress.name,
                company_name: data.originAddress.company,
                address_1: data.originAddress.street1,
                address_2: data.originAddress.street2,
                city: data.originAddress.city,
                state: data.originAddress.state,
                zip: data.originAddress.postalCode,
                country_code: data.originAddress.country,
                phone: data.originAddress.phone,
                email: data.originAddress.email,
              }
            : undefined,
          packages:
            data.packages && data.packages.length > 0
              ? data.packages.map((pkg) => ({
                  weight: pkg.weight?.value,
                  weight_unit: pkg.weight?.unit,
                  length: pkg.dimensions?.length,
                  width: pkg.dimensions?.width,
                  height: pkg.dimensions?.height,
                  dimension_unit: pkg.dimensions?.unit,
                }))
              : data.totalWeight
                ? [{ weight: data.totalWeight.value, weight_unit: data.totalWeight.unit }]
                : undefined,
        },
      },
    }
    const res = await client.post<WebshipperShipmentResponse>('shipments', body)
    const shipmentData = Array.isArray(res.data) ? res.data[0] : res.data
    return transformShipment(shipmentData ?? {})
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new WebshipperClient(credentials)
    await client.delete(`shipments/${encodeURIComponent(id)}`)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    return listCollection<WebshipperOrder, Order>(credentials, params, 'orders', {}, (rows) =>
      rows.map(transformOrder),
    )
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new WebshipperClient(credentials)
    const res = await client.get<JsonApiSingle<WebshipperOrder>>(`orders/${encodeURIComponent(id)}`)
    return transformOrder(res.data ?? {})
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new WebshipperClient(credentials)
    const body = {
      data: {
        type: 'orders',
        attributes: {
          visible_ref: data.orderNumber,
          currency: data.currency,
          delivery_address: data.destinationAddress
            ? {
                att_contact: data.destinationAddress.name,
                company_name: data.destinationAddress.company,
                address_1: data.destinationAddress.street1,
                address_2: data.destinationAddress.street2,
                city: data.destinationAddress.city,
                state: data.destinationAddress.state,
                zip: data.destinationAddress.postalCode,
                country_code: data.destinationAddress.country,
                phone: data.destinationAddress.phone,
                email: data.destinationAddress.email,
              }
            : undefined,
          order_lines:
            data.lineItems && data.lineItems.length > 0
              ? data.lineItems.map((li) => ({
                  sku: li.sku,
                  description: li.description ?? li.name,
                  quantity: li.quantity,
                  unit_price: li.unitAmount,
                  total_price: li.totalAmount,
                }))
              : undefined,
        },
      },
    }
    const res = await client.post<JsonApiSingle<WebshipperOrder>>('orders', body)
    return transformOrder(res.data ?? {})
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = new WebshipperClient(credentials)
    const body = {
      data: {
        type: 'orders',
        id,
        attributes: {
          visible_ref: data.orderNumber,
          currency: data.currency,
        },
      },
    }
    const res = await client.patch<JsonApiSingle<WebshipperOrder>>(`orders/${encodeURIComponent(id)}`, body)
    return transformOrder(res.data ?? {})
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new WebshipperClient(credentials)
    await client.patch<JsonApiSingle<WebshipperOrder>>(`orders/${encodeURIComponent(id)}`, {
      data: {
        type: 'orders',
        id,
        attributes: { status: 'cancelled' },
      },
    })
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    return listCollection<WebshipperCarrier, Carrier>(credentials, params, 'carriers', {}, (rows) =>
      rows.map(transformCarrier),
    )
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new WebshipperClient(credentials)
    const res = await client.get<JsonApiSingle<WebshipperCarrier>>(`carriers/${encodeURIComponent(id)}`)
    return transformCarrier(res.data ?? {})
  }

  // ── Warehouses (sender Shipping Addresses) ─────────────────────────────────

  /**
   * The account's ship-from addresses. Webshipper documents no sender_addresses
   * resource; the address resource is "Shipping Address
   * https://<account name>.api.webshipper.io/v2/shipping_addresses", with the
   * filter `address_type` ("recipient, sender, sold_from, pickup, return,
   * order_address"). Send `filter[address_type]=sender` (5 Sorting and
   * Filtering: "Simple filtering with strict equality ('=') can by done with
   * the filter[name]=Webshipper") and page like every other collection.
   */
  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    return listCollection<WebshipperShippingAddress, Warehouse>(
      credentials,
      params,
      'shipping_addresses',
      { 'filter[address_type]': 'sender' },
      (rows) => rows.map(transformWarehouse),
    )
  }

  /** Documented route: GET /v2/shipping_addresses/{id}. */
  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new WebshipperClient(credentials)
    const res = await client.get<JsonApiSingle<WebshipperShippingAddress>>(
      `shipping_addresses/${encodeURIComponent(id)}`,
    )
    return transformWarehouse(res.data ?? {})
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const filters: Record<string, string> = {}
    const filterShipmentId = (params['filter[shipment_id]'] ?? params.shipmentId) as string | undefined
    if (filterShipmentId) filters['filter[shipment_id]'] = filterShipmentId
    return listCollection<WebshipperTrackingEvent, TrackingEvent>(
      credentials,
      params,
      'tracking_events',
      filters,
      (rows) => transformTrackingEvents({ data: rows }),
    )
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new WebshipperClient(credentials)
    const res = await client.get<WebshipperTrackingListResponse>('tracking_events', {
      'filter[tracking_number]': trackingNumber,
    })
    return transformTrackingEvents(res)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new WebshipperClient(credentials)
    const firstPkg = params.packages[0]
    const body = {
      data: {
        type: 'service_quotes',
        attributes: {
          delivery_address: {
            zip: params.destinationAddress.postalCode,
            country_code: params.destinationAddress.country,
            city: params.destinationAddress.city,
          },
          sender_address: {
            zip: params.originAddress.postalCode,
            country_code: params.originAddress.country,
            city: params.originAddress.city,
          },
          packages: firstPkg
            ? [
                {
                  weight: firstPkg.weight?.value,
                  weight_unit: firstPkg.weight?.unit,
                  length: firstPkg.dimensions?.length,
                  width: firstPkg.dimensions?.width,
                  height: firstPkg.dimensions?.height,
                },
              ]
            : undefined,
        },
      },
    }
    const res = await client.post<JsonApiList<WebshipperRate>>('service_quotes', body)
    return (res.data ?? []).map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async listLabels(credentials: Credentials, params: QueryParams): Promise<Label[]> {
    return listCollection<WebshipperLabel, Label>(credentials, params, 'labels', {}, (rows) =>
      rows.map(transformLabel),
    )
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new WebshipperClient(credentials)
    const res = await client.get<JsonApiSingle<WebshipperLabel>>(`labels/${encodeURIComponent(id)}`)
    return transformLabel(res.data ?? {})
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  /**
   * Webshipper documents no manifests resource: its resource index
   * (https://docs.webshipper.io/ and its OpenAPI download) has no
   * `/manifests` path, and the word "manifest" does not occur in either.
   */
  async listManifests(_credentials: Credentials, _params: QueryParams): Promise<Manifest[]> {
    throw notSupported('Webshipper cannot list manifests: its API documents no manifests resource')
  }

  async getManifest(_credentials: Credentials, _id: string): Promise<Manifest> {
    throw notSupported('Webshipper cannot read a manifest: its API documents no manifests resource')
  }

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new WebshipperClient(credentials)
    const body = {
      data: {
        type: 'manifests',
        attributes: {
          ...(data.carrierId ? { carrier_id: Number(data.carrierId) || data.carrierId } : {}),
          ...(data.shipmentIds && data.shipmentIds.length > 0
            ? { shipment_ids: data.shipmentIds.map(Number) }
            : {}),
        },
      },
    }
    const res = await client.post<JsonApiSingle<WebshipperManifest>>('manifests', body)
    return transformManifest(res.data ?? {})
  }

}
