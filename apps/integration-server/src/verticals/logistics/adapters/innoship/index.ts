import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Carrier } from '../../schema/carrier'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'
import type { Order } from '../../schema/order'
import type { Rate } from '../../schema/rate'
import type { Warehouse } from '../../schema/warehouse'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { InnoshipClient } from './client'

import { transformShipment, type InnoshipOrder } from './transform/shipment'
import { transformTrackResult, type InnoshipTrackResult } from './transform/tracking'
import { transformLabel, type InnoshipLabelResponse } from './transform/label'
import { transformManifest, type InnoshipManifest } from './transform/manifest'
import { transformRate, type InnoshipRate, type InnoshipPriceResponse } from './transform/rate'

// ── Resource coverage ──────────────────────────────────────────────
// Read by id: shipment and tracking events (by AWB), label, manifest.
// Written: order (POST /api/Order), rate (POST /api/Price), manifest.
// Refused lists (501 before any request): shipments, orders, carriers,
// warehouses, tracking events.
//
// Innoship's docs are two OpenAPI specs served by https://api.innoship.io/index.html
// (index.js: "/swagger/v1/swagger.json" "API V1", "/swagger/v2/swagger.json"
// "API V2 - Beta - Work in progress"). Neither has a collection read for
// orders/shipments, carriers or tracking events, and the location lists,
// GET /api/ClientLocation and POST /api/ClientLocation/Summary, document only
// responses {"200": {"description": "OK"}}.
// NOTE: getShipment/getTrackingEvents read GET /api/v2/notifications/by-awb, whose
// 200 is NotificationHistoryResponse {notifications: [...]}, not a TrackResponse;
// the tracking read is POST /api/v2/shipments/track. Out of scope here (follow-up).

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface InnoshipAdapterConfig {
  // reserved for future configuration
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class InnoshipAdapter implements LogisticsAdapter {
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'innoship'
  readonly version = '1'

  constructor(_config: InnoshipAdapterConfig = {}) {}

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

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(_credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    throw notSupported(
      'Innoship cannot list shipments: the v1 and v2 specs (https://api.innoship.io/swagger/v1/swagger.json, ' +
        '/swagger/v2/swagger.json) have no shipment or order collection; tracking is a per-AWB lookup ' +
        '(POST /api/v2/shipments/track "Track Awb with return info")',
    )
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new InnoshipClient(credentials)
    // Use GET /api/v2/notifications/by-awb to retrieve shipment info by AWB.
    const res = await client.get<InnoshipTrackResult>('v2/notifications/by-awb', {
      ShipmentAwb: id,
    })
    if (!res) throw new Error(`Innoship: no shipment found for id ${id}`)
    const order: InnoshipOrder = {
      orderId: res.orderId,
      externalOrderId: res.externalOrderId,
      correlationId: res.correlationId,
      courierId: res.courier,
      shipmentAwb: res.shipmentAwb,
      trackingNumber: res.trackingNumber,
      currentStatus: res.currentStatus,
      currentStatusId: res.currentStatusId,
      trackUrl: res.trackUrl,
    }
    return transformShipment(order)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new InnoshipClient(credentials)
    const body = {
      serviceId: data.serviceCode != null ? Number(data.serviceCode) : undefined,
      courierId: data.carrierId != null ? Number(data.carrierId) : undefined,
      externalOrderId: data.reference,
      addressFrom: data.originAddress
        ? {
            name: data.originAddress.name,
            contactPerson: data.originAddress.name,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
            address1: data.originAddress.street1,
            address2: data.originAddress.street2,
            zipCode: data.originAddress.postalCode,
            city: data.originAddress.city,
            county: data.originAddress.state,
            countryCode: data.originAddress.country,
          }
        : undefined,
      addressTo: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            contactPerson: data.destinationAddress.name,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
            address1: data.destinationAddress.street1,
            address2: data.destinationAddress.street2,
            zipCode: data.destinationAddress.postalCode,
            city: data.destinationAddress.city,
            county: data.destinationAddress.state,
            countryCode: data.destinationAddress.country,
          }
        : undefined,
      content: {
        parcels: data.totalWeight ? [{ weight: data.totalWeight.value }] : [{ weight: 1 }],
      },
    }
    const raw = await client.post<InnoshipOrder>('Order', body)
    return transformShipment(raw)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    throw notSupported(
      'Innoship cannot list orders: the v1 spec (https://api.innoship.io/swagger/v1/swagger.json) has only ' +
        '"POST /api/Order" ("Creates a new order") and per-AWB reads (/api/Order/ReturnAwbInfo/{courierId}/{returnAwb}, ' +
        '/api/Order/DownloadDocument/courier/{courierId}/awb/{awb}); neither v1 nor v2 has an order collection',
    )
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    throw notSupported(
      'Innoship cannot list carriers: the spec\'s Courier paths are only "/api/Courier/RequestPickup" ' +
        '("Request pickup to courier") and /api/Courier/Location/{GenerateId,List,SetId}/{locationId}/{courierId}; ' +
        'there is no courier collection',
    )
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────

  async listWarehouses(_credentials: Credentials, _params: QueryParams): Promise<Warehouse[]> {
    throw notSupported(
      'Innoship cannot list warehouses: GET /api/ClientLocation documents no response body ' +
        '(responses {"200": {"description": "OK"}} in https://api.innoship.io/swagger/v1/swagger.json), ' +
        'and neither does POST /api/ClientLocation/Summary, so their rows cannot be mapped without guessing field names',
    )
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new InnoshipClient(credentials)
    const body = {
      serviceId: 0, // 0 = return all available services
      addressFrom: {
        address1: params.originAddress.street1,
        address2: params.originAddress.street2,
        zipCode: params.originAddress.postalCode,
        city: params.originAddress.city,
        county: params.originAddress.state,
        countryCode: params.originAddress.country,
      },
      addressTo: {
        address1: params.destinationAddress.street1,
        address2: params.destinationAddress.street2,
        zipCode: params.destinationAddress.postalCode,
        city: params.destinationAddress.city,
        county: params.destinationAddress.state,
        countryCode: params.destinationAddress.country,
      },
      content: {
        parcels: params.packages.map((pkg) => ({
          weight: pkg.weight?.value,
          width: pkg.dimensions?.width,
          height: pkg.dimensions?.height,
          length: pkg.dimensions?.length,
        })),
      },
    }
    const res = await client.post<InnoshipPriceResponse | InnoshipRate[]>('Price', body)
    const rates: InnoshipRate[] = Array.isArray(res)
      ? (res as InnoshipRate[])
      : ((res as InnoshipPriceResponse).rates ?? [])
    return rates.map(transformRate)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new InnoshipClient(credentials)
    // Use GET /api/v2/notifications/by-awb to retrieve tracking events by AWB.
    const res = await client.get<InnoshipTrackResult>('v2/notifications/by-awb', {
      ShipmentAwb: trackingNumber,
    })
    if (!res) return []
    return transformTrackResult(res)
  }

  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    throw notSupported(
      'Innoship cannot list tracking events: tracking is a per-AWB lookup (POST /api/v2/shipments/track ' +
        '"Track Awb with return info") and there is no shipment collection to walk; ' +
        'GET /api/v2/notifications/by-template (TemplateId, DateFrom, DateTo) lists sent notifications, not carrier events',
    )
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    // id format expected: "{courierId}:{awb}"
    const [courierPart, ...awbParts] = id.split(':')
    const awb = awbParts.join(':') || courierPart
    const courierId = awbParts.length > 0 ? courierPart : '0'
    const client = new InnoshipClient(credentials)
    const raw = await client.get<InnoshipLabelResponse>(
      `Label/by-courier/${courierId}/awb/${awb}`,
      { format: 'PDF', type: 'PDF', useFile: false },
    )
    return transformLabel(
      { ...raw, awb, courierId: courierId !== '0' ? Number(courierId) : null },
      id,
    )
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('Innoship: shipmentId is required to generate a label')
    // shipmentId expected as "{courierId}:{awb}"
    const [courierPart, ...awbParts] = data.shipmentId.split(':')
    const awb = awbParts.join(':') || courierPart
    const courierId = awbParts.length > 0 ? courierPart : '0'
    const client = new InnoshipClient(credentials)
    const raw = await client.get<InnoshipLabelResponse>(
      `Label/by-courier/${courierId}/awb/${awb}`,
      { format: 'PDF', type: 'PDF', useFile: false },
    )
    return transformLabel(
      { ...raw, awb, courierId: courierId !== '0' ? Number(courierId) : null },
      data.shipmentId,
    )
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new InnoshipClient(credentials)
    const body = {
      courierId: data.carrierId != null ? Number(data.carrierId) : undefined,
      awbs: data.shipmentIds ?? [],
    }
    const raw = await client.post<InnoshipManifest>('Manifest', body)
    return transformManifest(raw)
  }

  async getManifest(credentials: Credentials, id: string): Promise<Manifest> {
    const client = new InnoshipClient(credentials)
    // GET /api/Manifest returns a PDF; we return a minimal manifest object
    const raw = await client.get<InnoshipManifest>('Manifest', { manifestId: id })
    return transformManifest({ ...raw, manifestId: id })
  }
}
