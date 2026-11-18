import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ChazkiClient } from './client'

import { transformShipment, type ChazkiShipment } from './transform/shipment'
import { transformTracking, type ChazkiTrackingResponse } from './transform/tracking'
import { transformOrder, type ChazkiOrder } from './transform/order'
import { transformRate, type ChazkiRate } from './transform/rate'
import { transformLabel, type ChazkiLabel } from './transform/label'

interface ChazkiAdapterConfig {
  /**
   * Reserved for future use; Chazki uses a single enterprise-key header
   * rather than OAuth2 client credentials.
   */
  enterpriseKey?: string
}

/**
 * Generic paginated response envelope that Chazki may wrap list results in.
 */
interface ChazkiPaginatedResponse<T> {
  data?: T[]
  items?: T[]
  results?: T[]
  total?: number
  page?: number
  limit?: number
  [key: string]: unknown
}

/**
 * Shape returned by POST /create/delivery-service (order creation).
 * Chazki wraps the created order(s) in a `data` array.
 */
interface ChazkiCreateOrderResponse {
  success?: boolean
  data?: ChazkiOrder | ChazkiOrder[]
  ordersWithErrors?: number
  ordersWithoutErrors?: number
  [key: string]: unknown
}

/**
 * Shape returned by GET /tracking/select/delivery-code.
 */
interface ChazkiTrackingWrapper {
  response?: number
  data?: ChazkiTrackingResponse | ChazkiTrackingResponse[]
  [key: string]: unknown
}

/**
 * Shape returned by GET /tracking/label or POST /tracking/label/all.
 * `base64Content` holds the base64-encoded label PDF/ZPL.
 */
interface ChazkiLabelResponse {
  base64Content?: string | null
  format?: string | null
  trackCode?: string | null
  code?: string | null
  [key: string]: unknown
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

/**
 * The Peru Legacy spec documents no collection endpoint. Its ten paths are
 * create, cancel, per-delivery status/tracking/image/label lookups and two
 * coverage checks; none takes a page, limit, offset, cursor or date filter,
 * and every lookup needs one delivery's track code.
 * https://raw.githubusercontent.com/Chazki-Archive/chazki-api-bucket/HEAD/src/components/constans/yaml/peru-legacy.yaml
 */
const PER_DELIVERY_ONLY =
  'the Peru Legacy API documents no list endpoint; /status/record and /status/record/all ' +
  'return one delivery and require `code` (queryCode: "description: Delivery track code." / ' +
  '"required: true")'

function notSupported(resource: string): Error {
  return Object.assign(new Error(`Chazki cannot list ${resource}: ${PER_DELIVERY_ONLY}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Chazki is a single-carrier platform; the Peru Legacy API exposes no carrier directory endpoint.
// Unavailable: manifest  — No manifest creation or retrieval endpoint exists in any Chazki API variant.
// Unavailable: warehouse — The deprecated Maximo Chile API has a /cloud/warehouses/ endpoint but it uses a different base URL and auth scheme incompatible with this adapter; the Peru Legacy API has no warehouse endpoint.

/**
 * LogisticsAdapter for Chazki — Latin American last-mile courier.
 *
 * API:  https://us-central1-chazki-link.cloudfunctions.net/cf-custom-integrations/api/legacy/peru
 * Auth: `enterprise-key` header (UUID provisioned by Chazki)
 * Docs: https://github.com/Chazki-Archive/chazki-api-bucket
 *
 * Endpoints implemented:
 *   - POST /create/delivery-service        → createOrder / createShipment
 *   - PUT  /cancel/order                   → cancelOrder / cancelShipment
 *   - GET  /status/record                  → getOrder / getShipment
 *   - GET  /tracking/select/delivery-code  → getTrackingEvents
 *   - GET  /tracking/label                 → getLabel
 *   - POST /tracking/label/all             → createLabel (batch label fetch)
 *   - GET  /coverage/distance              → getRates (distance/cost estimate)
 *
 * listShipments, listOrders and listTrackingEvents refuse with 501: the spec
 * has no collection endpoint (see PER_DELIVERY_ONLY).
 */
export class ChazkiAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'chazki'
  readonly version = '1'

  constructor(_config: ChazkiAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Chazki the "code" is the enterprise API key itself.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────
  // Chazki's primary resource is an "order" which maps to both Order and
  // Shipment depending on context. We expose shipment operations via the
  // same delivery-service endpoints, treating each created order as a shipment.

  async listShipments(_credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    throw notSupported('shipments')
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ChazkiClient(credentials)
    const res = await client.get<ChazkiPaginatedResponse<ChazkiShipment>>('/status/record', {
      code: id,
    })
    const items = res.data ?? res.items ?? res.results ?? []
    const raw = items[0] ?? ({ code: id } as ChazkiShipment)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ChazkiClient(credentials)
    // Chazki models a shipment as a delivery-service order; map fields accordingly.
    const res = await client.post<ChazkiCreateOrderResponse>('/create/delivery-service', {
      orders: [
        {
          trackCode: data.reference ?? undefined,
          serviceID: data.serviceCode ?? undefined,
          packageWeight: data.totalWeight?.value ?? undefined,
          productDescription: data.notes ?? undefined,
          pickUpAddress: data.originAddress?.street1 ?? undefined,
          pickUpPostalCode: data.originAddress?.postalCode ?? undefined,
          pickUpContactName: data.originAddress?.name ?? undefined,
          pickUpContactPhone: data.originAddress?.phone ?? undefined,
          pickUpContactEmail: data.originAddress?.email ?? undefined,
          dropAddress: data.destinationAddress?.street1 ?? undefined,
          dropPostalCode: data.destinationAddress?.postalCode ?? undefined,
          dropContactName: data.destinationAddress?.name ?? undefined,
          dropContactPhone: data.destinationAddress?.phone ?? undefined,
          dropContactEmail: data.destinationAddress?.email ?? undefined,
        },
      ],
    })
    const created = Array.isArray(res.data) ? res.data[0] : res.data
    return transformShipment((created ?? {}) as ChazkiShipment)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new ChazkiClient(credentials)
    // PUT /cancel/order accepts trackCode as a query param.
    await client.put<unknown>(`/cancel/order?trackCode=${encodeURIComponent(id)}`, {})
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    throw notSupported('orders')
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ChazkiClient(credentials)
    const res = await client.get<ChazkiPaginatedResponse<ChazkiOrder>>('/status/record', {
      code: id,
    })
    const items = res.data ?? res.items ?? res.results ?? []
    const raw = items[0] ?? ({ code: id } as ChazkiOrder)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ChazkiClient(credentials)
    const res = await client.post<ChazkiCreateOrderResponse>('/create/delivery-service', {
      orders: [
        {
          trackCode: data.orderNumber ?? undefined,
          serviceID: data.requestedServiceCode ?? undefined,
          currency: data.currency ?? undefined,
          pickUpAddress: data.originAddress?.street1 ?? undefined,
          pickUpPostalCode: data.originAddress?.postalCode ?? undefined,
          pickUpContactName: data.originAddress?.name ?? undefined,
          pickUpContactPhone: data.originAddress?.phone ?? undefined,
          pickUpContactEmail: data.originAddress?.email ?? undefined,
          dropAddress: data.destinationAddress?.street1 ?? undefined,
          dropPostalCode: data.destinationAddress?.postalCode ?? undefined,
          dropContactName: data.destinationAddress?.name ?? undefined,
          dropContactPhone: data.destinationAddress?.phone ?? undefined,
          dropContactEmail: data.destinationAddress?.email ?? undefined,
          productDescription: data.notes ?? undefined,
        },
      ],
    })
    const created = Array.isArray(res.data) ? res.data[0] : res.data
    return transformOrder((created ?? {}) as ChazkiOrder)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new ChazkiClient(credentials)
    // Chazki uses PUT /cancel/order with trackCode as a query param.
    await client.put<unknown>(`/cancel/order?trackCode=${encodeURIComponent(id)}`, {})
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new ChazkiClient(credentials)
    // GET /tracking/select/delivery-code?code=<trackingNumber>
    const res = await client.get<ChazkiTrackingWrapper>('/tracking/select/delivery-code', {
      code: trackingNumber,
    })
    const rawData = res.data
    if (!rawData) {
      return transformTracking({ code: trackingNumber } as ChazkiTrackingResponse)
    }
    if (Array.isArray(rawData)) {
      return rawData.flatMap(transformTracking)
    }
    return transformTracking(rawData)
  }

  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    throw notSupported('tracking events')
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ChazkiClient(credentials)
    // Chazki exposes a coverage/distance endpoint that returns cost estimates.
    // GET /coverage/distance?originLat=...&originLng=...&destLat=...&destLng=...
    const res = await client.get<ChazkiPaginatedResponse<ChazkiRate> | ChazkiRate[]>(
      '/coverage/distance',
      {
        originCity: params.originAddress.city ?? undefined,
        originPostalCode: params.originAddress.postalCode ?? undefined,
        destCity: params.destinationAddress.city ?? undefined,
        destPostalCode: params.destinationAddress.postalCode ?? undefined,
        weight: params.packages[0]?.weight?.value ?? undefined,
        serviceCodes: params.serviceCodes?.join(',') ?? undefined,
      },
    )
    const rates = Array.isArray(res) ? res : (res.data ?? res.items ?? res.results ?? [])
    return rates.map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new ChazkiClient(credentials)
    // GET /tracking/label?code=<trackCode> returns base64-encoded label.
    const res = await client.get<ChazkiLabelResponse>('/tracking/label', { code: id })
    return transformLabel({
      id,
      tracking_code: res.trackCode ?? res.code ?? id,
      content: res.base64Content ?? undefined,
      format: res.format ?? 'PDF',
      status: 'created',
    } as ChazkiLabel)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId && !data.trackingNumber) {
      throw new Error('shipmentId or trackingNumber is required to fetch a Chazki label')
    }
    const client = new ChazkiClient(credentials)
    // POST /tracking/label/all accepts an array of track codes.
    const trackCode = data.trackingNumber ?? data.shipmentId!
    const res = await client.post<ChazkiLabelResponse[] | ChazkiLabelResponse>(
      '/tracking/label/all',
      { trackCodes: [trackCode] },
    )
    const first = Array.isArray(res) ? res[0] : res
    return transformLabel({
      id: first?.trackCode ?? first?.code ?? trackCode,
      shipment_id: data.shipmentId ?? undefined,
      tracking_code: first?.trackCode ?? first?.code ?? trackCode,
      content: first?.base64Content ?? undefined,
      format: first?.format ?? data.format ?? 'PDF',
      status: 'created',
    } as ChazkiLabel)
  }

  async voidLabel(_credentials: Credentials, _id: string): Promise<void> {
    // Chazki does not expose a dedicated label-void endpoint.
    // Cancelling the underlying order via cancelOrder is the closest equivalent.
    throw new Error(
      'Chazki does not support voiding labels independently — cancel the order instead.',
    )
  }
}
