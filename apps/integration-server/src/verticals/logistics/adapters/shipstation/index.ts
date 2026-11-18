import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'
import type { Warehouse } from '../../schema/warehouse'
import type { Rate } from '../../schema/rate'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ShipStationClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformShipment, type SSShipment } from './transform/shipment'
import { transformOrder, type SSOrder } from './transform/order'
import { transformLabel } from './transform/label'
import { transformCarrier, type SSCarrier, type SSCarrierService } from './transform/carrier'
import { transformWarehouse, type SSWarehouse } from './transform/warehouse'
import { transformRate, type SSRate } from './transform/rate'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: manifest — ShipStation API v1 (ssapi.shipstation.com) has no
//   manifest operation; the V1 OpenAPI's /shipments family is getrates,
//   createlabel, voidlabel and the list. Manifests are a v2-only surface
//   (POST /v2/manifests). See the Manifests block below for the spec URL and
//   the 2026-09-13 probe.
// Unavailable: trackingevent — ShipStation API v1 (ssapi.shipstation.com) has no
//   tracking-events endpoint; /shipments returns only a trackingNumber string.

interface ShipStationAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ShipStationAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'shipstation'
  readonly version = '1'

  constructor(_config: ShipStationAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const resourceType = String(payload['resource_type'] ?? '')

    type CanonicalResource = WebhookEvent['resourceType']
    const map: Record<string, { resource: CanonicalResource; action: WebhookEvent['action'] }> = {
      ORDER_NOTIFY: { resource: 'order', action: 'updated' },
      ITEM_ORDER_NOTIFY: { resource: 'order', action: 'updated' },
      SHIP_NOTIFY: { resource: 'shipment', action: 'created' },
      ITEM_SHIP_NOTIFY: { resource: 'shipment', action: 'created' },
      FULFILLMENT_SHIPPED: { resource: 'shipment', action: 'created' },
      FULFILLMENT_REJECTED: { resource: 'order', action: 'cancelled' },
    }

    const mapped = map[resourceType]
    if (!mapped) return []

    return [
      {
        platform: 'shipstation',
        type: resourceType,
        resourceType: mapped.resource,
        action: mapped.action,
        payload,
      },
    ]
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new ShipStationClient(credentials)
    const res = await client.get<{ shipments: SSShipment[] }>('shipments', {
      page: params.page ?? 1,
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return (res.shipments ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ShipStationClient(credentials)
    const res = await client.get<{ shipments: SSShipment[] }>('shipments', {
      shipmentId: id,
    })
    // `shipmentId` is not a documented `list_shipments` query param (v1
    // OpenAPI), so it may be ignored by the platform — `[0]` would then be an
    // arbitrary shipment from the account. Require the row we get back to
    // actually be the one that was requested.
    const raw = (res.shipments ?? []).find((s) => String(s.shipmentId) === id)
    if (!raw) {
      throw Object.assign(new Error(`ShipStation: shipment ${id} not found`), { statusCode: 404 })
    }
    return transformShipment(raw)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ShipStationClient(credentials)
    const res = await client.get<{ orders: SSOrder[] }>('orders', {
      page: params.page ?? 1,
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return (res.orders ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ShipStationClient(credentials)
    const raw = await client.get<SSOrder>(`orders/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ShipStationClient(credentials)
    const raw = await client.post<SSOrder>('orders/createorder', {
      orderNumber: data.orderNumber,
      orderDate: data.orderAt ? data.orderAt.toISOString() : new Date().toISOString(),
      orderStatus: 'awaiting_shipment',
      billTo: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            street1: data.destinationAddress.street1,
            street2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postalCode: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
          }
        : undefined,
      shipTo: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            street1: data.destinationAddress.street1,
            street2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postalCode: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
          }
        : undefined,
      items: data.lineItems?.map((item) => ({
        sku: item.sku ?? '',
        name: item.name ?? '',
        quantity: item.quantity ?? 1,
        unitPrice: item.unitAmount ?? 0,
      })),
    })
    return transformOrder(raw)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = new ShipStationClient(credentials)
    const raw = await client.post<SSOrder>('orders/createorder', {
      orderId: Number(id),
      orderNumber: data.orderNumber,
      orderStatus: data.status?.toLowerCase(),
    })
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new ShipStationClient(credentials)
    await client.post<unknown>('orders/markcancelled', { orderId: Number(id) })
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new ShipStationClient(credentials)
    const raw = await client.post<SSShipment>('shipments/createlabel', {
      carrierCode: data.carrierId,
      serviceCode: data.serviceCode,
      packageCode: 'package',
      shipDate: new Date().toISOString().slice(0, 10),
      testLabel: false,
      weight: { value: 1, units: 'ounces' },
    })
    return transformLabel(raw)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new ShipStationClient(credentials)
    await client.post<unknown>('shipments/voidlabel', { shipmentId: Number(id) })
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    const client = new ShipStationClient(credentials)
    const carriers = await client.get<SSCarrier[]>('carriers')
    return (carriers ?? []).map((c) => transformCarrier(c))
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new ShipStationClient(credentials)
    const raw = await client.get<SSCarrier>(`carriers/getcarrier?carrierCode=${id}`)
    const services = await client.get<SSCarrierService[]>(`carriers/listservices?carrierCode=${id}`)
    return transformCarrier(raw, services)
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────

  async listWarehouses(credentials: Credentials, _params: QueryParams): Promise<Warehouse[]> {
    const client = new ShipStationClient(credentials)
    const warehouses = await client.get<SSWarehouse[]>('warehouses')
    return (warehouses ?? []).map(transformWarehouse)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new ShipStationClient(credentials)
    const raw = await client.get<SSWarehouse>(`warehouses/${id}`)
    return transformWarehouse(raw)
  }

  // ── Manifests: NOT IMPLEMENTED, on purpose ─────────────────────────────────
  //
  // This adapter speaks ShipStation API v1 (ssapi.shipstation.com, Basic
  // key:secret), and v1 has no manifest operation. The V1 OpenAPI —
  // "ShipStation V1 API (Legacy)", published at
  //   https://docs.shipstation.com/apis/shipstation-v1/openapi
  // (Redocly definition `apis/@shipstation-v1/openapi.yaml`) — declares 47
  // operations across 43 paths, and its entire /shipments family is
  // `getrates`, `createlabel`, `voidlabel` and the `/shipments` list. There is
  // no createmanifest, scan-form or end-of-day route anywhere in it. The
  // `POST shipments/createmanifest` that used to live here appears in no
  // ShipStation spec, and the doc page its transform cited
  // (www.shipstation.com/docs/api/shipments/create-manifest/) is a 404.
  //
  // Live probe, 2026-09-13T04:25Z, with this account's v2-style single API key:
  //
  //   GET  api.shipstation.com/v2/carriers                        200  carriers[]
  //   GET  api.shipstation.com/v2/manifests?page_size=1           200  {"manifests":[],"total":0}
  //   POST api.shipstation.com/v2/manifests  {}                   400  field_value_required:
  //                                                                    carrier_id, warehouse_id, ship_date
  //   GET  ssapi.shipstation.com/carriers             Basic key:  401
  //   POST ssapi.shipstation.com/shipments/createmanifest  Basic:  401
  //   POST ssapi.shipstation.com/shipments/createmanifest  no auth 401
  //   POST ssapi.shipstation.com/shipments/doesnotexist    no auth 401
  //
  // v1 authenticates before it routes — a path that cannot exist answers
  // exactly like the one this method called — so a v2 key cannot tell a real
  // v1 route from a missing one, and the verdict rests on the spec above.
  //
  // Manifests DO exist on v2: `POST /v2/manifests` (API-Key header) takes
  // carrier_id + warehouse_id + ship_date, or label_ids, and the probe shows
  // that surface is live for this account. It needs a v2 client this v1
  // adapter does not have. Until one exists, leaving the method off is what
  // makes the router answer 501 NOT_IMPLEMENTED (router/manifests.ts) instead
  // of relaying an unexplained 401 from a route that was never there.
  //
  // transform/manifest.ts and its test are kept: they are correct against the
  // canonical schema, and cost nothing.

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ShipStationClient(credentials)
    // ShipStation requires carrierCode + a shipment body to quote rates
    const body: Record<string, unknown> = {
      carrierCode: params.serviceCodes?.[0] ?? undefined,
      fromPostalCode: params.originAddress.postalCode,
      toPostalCode: params.destinationAddress.postalCode,
      toState: params.destinationAddress.state,
      toCountry: params.destinationAddress.country ?? 'US',
      toCity: params.destinationAddress.city,
      weight: params.packages.length > 0
        ? {
            value: params.packages[0]?.weight?.value ?? 1,
            units: params.packages[0]?.weight?.unit === 'kg' ? 'grams'
              : params.packages[0]?.weight?.unit === 'lb' ? 'pounds'
              : 'ounces',
          }
        : { value: 1, units: 'ounces' },
      confirmation: 'none',
      residential: false,
    }
    const res = await client.post<SSRate[]>('shipments/getrates', body)
    return (res ?? []).map(transformRate)
  }
}
