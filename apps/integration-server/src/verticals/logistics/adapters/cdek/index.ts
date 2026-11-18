/**
 * CDEK adapter — logistics vertical.
 *
 * Auth: OAuth 2.0 client_credentials.
 *   POST https://api.cdek.ru/v2/oauth/token
 *   Tokens expire in 3600 s; refreshCredentials re-runs the grant automatically.
 *
 * Supported resources:
 *   Shipments (Orders)  — POST /orders, GET /orders/{uuid}, DELETE /orders/{uuid}
 *   Orders              — same as shipments (CDEK term: "order")
 *   Tracking Events     — GET /orders?cdek_number= (statuses array)
 *   listShipments / listOrders / listTrackingEvents refuse with 501: CDEK
 *   documents no order list (GET /orders is a lookup by cdek_number/im_number).
 *   Rates               — POST /calculator/tarifflist
 *   Labels              — POST /print/orders, GET /print/orders/{uuid}
 *   Warehouses          — GET /deliverypoints (CDEK pickup-point network)
 *
 * Webhooks:
 *   CDEK does not publish a documented signing scheme (no HMAC header), so
 *   webhook.ts is intentionally omitted. parseWebhookEvents parses the raw
 *   payload by event type.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: carrier   — CDEK is the sole carrier; no multi-carrier carrier list endpoint exists in v2 API.
 * Unavailable: manifest  — No manifest endpoint in the public CDEK v2 API.
 */
import { reportUpstreamPage } from '@opensteward/shared'
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Warehouse } from '../../schema/warehouse'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as cdekCredentialFields,
  exchangeCredentials as cdekExchangeCredentials,
  refreshCredentials as cdekRefreshCredentials,
} from './auth'
import { CdekClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformShipment, type CdekOrder } from './transform/shipment'
import { transformOrder } from './transform/order'
import { transformTrackingEvents, type CdekTrackingResponse } from './transform/tracking'
import { transformTariff, type CdekTariff } from './transform/rate'
import { transformLabel, type CdekPrintResponse } from './transform/label'
import { transformDeliveryPoint, type CdekDeliveryPoint } from './transform/warehouse'

// ── API response envelopes ──────────────────────────────────────────────────

interface CdekOrdersListResponse {
  entity?: CdekOrder | null
  requests?: Array<{ state?: string; [key: string]: unknown }> | null
  [key: string]: unknown
}

interface CdekTariffListResponse {
  tariff_codes?: CdekTariff[] | null
  [key: string]: unknown
}

// ── Unsupported lists ────────────────────────────────────────────────────────

/**
 * CDEK has no order list. Its OpenAPI document
 * (https://gateway.cdek.ru/api-cdek-docs/web/docs/merged?sectionId=api_v2_integration)
 * defines GET /v2/orders as a single-order lookup, "Получение информации о
 * заказе по номеру СДЭК/ИМ", whose only parameters are cdek_number and
 * im_number; no other GET there enumerates orders. Shipments, orders and
 * their tracking events therefore cannot be listed, only read by id.
 */
function noOrderList(resource: string): Error {
  return Object.assign(
    new Error(
      `CDEK cannot list ${resource}: GET /v2/orders is "Получение информации о заказе по номеру СДЭК/ИМ" (a lookup by cdek_number or im_number), and the API documents no order list`,
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

// ── Adapter config ───────────────────────────────────────────────────────────

export interface CdekAdapterConfig {
  /** Reserved for future use (e.g. sandbox mode). */
  sandbox?: boolean
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class CdekAdapter implements LogisticsAdapter {
  readonly platform = 'cdek'
  readonly version = '1'

  credentialFields(): CredentialField[] {
    return cdekCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return cdekExchangeCredentials(fields)
  }

  constructor(_config: CdekAdapterConfig = {}) {}

  // ── Auth ────────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // CDEK uses client_credentials — there is no OAuth redirect URL.
    return 'https://www.cdek.ru/ru/integration/'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('CDEK uses client_credentials flow — use exchangeCredentials() instead.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return cdekRefreshCredentials(credentials)
  }

  // ── Webhooks ────────────────────────────────────────────────────────────────

  /**
   * CDEK does not document a webhook signing scheme, so verifyWebhook is not
   * implemented. parseWebhookEvents maps the payload to canonical events.
   *
   * Payload shape (ORDER_STATUS):
   *   { type: "ORDER_STATUS", date_time: "...", uuid: "...", attributes: { cdek_number: "...", status_code: "..." } }
   *
   * Payload shape (PRINT_FORM):
   *   { type: "PRINT_FORM", date_time: "...", uuid: "..." }
   */
  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const type = String(payload['type'] ?? '')
    const uuid = String(payload['uuid'] ?? '')
    const attributes = (payload['attributes'] ?? {}) as Record<string, unknown>
    const cdekNumber = String(attributes['cdek_number'] ?? uuid)

    type CanonicalAction = WebhookEvent['action']
    type CanonicalResourceType = WebhookEvent['resourceType']

    let resourceType: CanonicalResourceType = 'shipment'
    let action: CanonicalAction = 'updated'

    switch (type) {
      case 'ORDER_STATUS': {
        resourceType = 'shipment'
        const statusCode = String(attributes['status_code'] ?? '')
        if (/^CANCEL/i.test(statusCode)) {
          action = 'cancelled'
        } else if (/^CREATED$/i.test(statusCode)) {
          action = 'created'
        } else {
          action = 'updated'
        }
        break
      }
      case 'PRINT_FORM':
        resourceType = 'label'
        action = 'created'
        break
      case 'DOWNLOAD_PHOTO':
        resourceType = 'shipment'
        action = 'updated'
        break
      default:
        return []
    }

    return [
      {
        platform: 'cdek',
        type,
        resourceType,
        action,
        resourceId: cdekNumber || undefined,
        payload,
      },
    ]
  }

  // ── Shipments ───────────────────────────────────────────────────────────────

  async listShipments(_credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    throw noOrderList('shipments')
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new CdekClient(credentials)
    const res = await client.get<CdekOrdersListResponse>(`/orders/${id}`)
    const raw = (res.entity ?? res) as CdekOrder
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new CdekClient(credentials)
    const body: Record<string, unknown> = {
      tariff_code: data.serviceCode != null ? Number(data.serviceCode) : 139,
      number: data.reference,
    }

    if (data.originAddress) {
      body['from_location'] = {
        address: data.originAddress.street1,
        city: data.originAddress.city,
        country_code: data.originAddress.country ?? 'RU',
        postal_code: data.originAddress.postalCode,
      }
      body['sender'] = {
        name: data.originAddress.name,
        company: data.originAddress.company,
        phones: data.originAddress.phone ? [{ number: data.originAddress.phone }] : undefined,
        email: data.originAddress.email,
      }
    }

    if (data.destinationAddress) {
      body['to_location'] = {
        address: data.destinationAddress.street1,
        city: data.destinationAddress.city,
        country_code: data.destinationAddress.country ?? 'RU',
        postal_code: data.destinationAddress.postalCode,
      }
      body['recipient'] = {
        name: data.destinationAddress.name,
        company: data.destinationAddress.company,
        phones: data.destinationAddress.phone
          ? [{ number: data.destinationAddress.phone }]
          : undefined,
        email: data.destinationAddress.email,
      }
    }

    if (data.totalWeight) {
      const weightGrams =
        data.totalWeight.unit === 'kg'
          ? data.totalWeight.value * 1000
          : data.totalWeight.unit === 'lb'
            ? data.totalWeight.value * 453.592
            : data.totalWeight.unit === 'oz'
              ? data.totalWeight.value * 28.3495
              : data.totalWeight.value
      body['packages'] = [
        {
          number: '1',
          weight: Math.round(weightGrams),
          length: data.dimensions?.length ?? 1,
          width: data.dimensions?.width ?? 1,
          height: data.dimensions?.height ?? 1,
        },
      ]
    }

    const res = await client.post<CdekOrdersListResponse>('/orders', body)
    const raw = (res.entity ?? res) as CdekOrder
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new CdekClient(credentials)
    await client.delete(`/orders/${id}`)
  }

  // ── Orders ──────────────────────────────────────────────────────────────────

  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    throw noOrderList('orders')
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new CdekClient(credentials)
    const res = await client.get<CdekOrdersListResponse>(`/orders/${id}`)
    const raw = (res.entity ?? res) as CdekOrder
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const shipmentData: Partial<Shipment> = {
      reference: data.orderNumber,
      originAddress: data.originAddress,
      destinationAddress: data.destinationAddress,
      serviceCode: data.requestedServiceCode,
    }
    const shipment = await this.createShipment(credentials, shipmentData)
    return transformOrder({
      uuid: shipment.id,
      cdek_number: shipment.trackingNumber,
      number: shipment.reference,
      from_location: null,
      to_location: null,
      date_created: shipment.createdAt?.toISOString(),
      date_updated: shipment.updatedAt?.toISOString(),
      metadata: shipment.metadata,
    } as CdekOrder)
  }

  // ── Tracking Events ─────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new CdekClient(credentials)
    // CDEK: can look up by cdek_number via GET /orders?cdek_number=...
    const res = await client.get<CdekTrackingResponse | CdekOrdersListResponse>(
      `/orders`,
      { cdek_number: trackingNumber },
    )
    const raw = ((res as CdekOrdersListResponse).entity ?? res) as CdekTrackingResponse
    return transformTrackingEvents(raw)
  }

  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    throw noOrderList('tracking events')
  }

  // ── Rates ────────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new CdekClient(credentials)

    const pkg = params.packages[0]
    const weightGrams = pkg?.weight
      ? pkg.weight.unit === 'kg'
        ? pkg.weight.value * 1000
        : pkg.weight.unit === 'lb'
          ? pkg.weight.value * 453.592
          : pkg.weight.unit === 'oz'
            ? pkg.weight.value * 28.3495
            : pkg.weight.value
      : 1000

    const body: Record<string, unknown> = {
      from_location: {
        address: params.originAddress.street1,
        city: params.originAddress.city,
        country_code: params.originAddress.country ?? 'RU',
        postal_code: params.originAddress.postalCode,
      },
      to_location: {
        address: params.destinationAddress.street1,
        city: params.destinationAddress.city,
        country_code: params.destinationAddress.country ?? 'RU',
        postal_code: params.destinationAddress.postalCode,
      },
      packages: [
        {
          weight: Math.round(weightGrams),
          length: pkg?.dimensions?.length ?? 10,
          width: pkg?.dimensions?.width ?? 10,
          height: pkg?.dimensions?.height ?? 10,
        },
      ],
    }

    const res = await client.post<CdekTariffListResponse>('/calculator/tarifflist', body)
    return (res.tariff_codes ?? []).map(transformTariff)
  }

  // ── Labels ────────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new CdekClient(credentials)
    const res = await client.get<CdekPrintResponse>(`/print/orders/${id}`)
    return transformLabel(res, id)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('CDEK createLabel: shipmentId is required')
    const client = new CdekClient(credentials)

    // Request print generation for the order.
    const createRes = await client.post<CdekPrintResponse>('/print/orders', {
      orders: [{ order_uuid: data.shipmentId }],
    })

    // The entity UUID returned here is the print task UUID.
    const printUuid = createRes.entity?.uuid ?? data.shipmentId
    return transformLabel(createRes, printUuid)
  }

  // ── Warehouses (Delivery Points) ──────────────────────────────────────────────
  //
  // CDEK does not expose customer-owned warehouse management. Instead, we surface
  // CDEK's own pickup-point network (GET /deliverypoints) as canonical Warehouse
  // records. These are the offices and parcel lockers from which recipients can
  // collect parcels.

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new CdekClient(credentials)
    // GET /v2/deliverypoints pages by `size` and a 0-based `page`, and reports
    // X-Total-Pages / X-Total-Elements as response headers.
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const size = Math.min(limit, MAX_PAGE_SIZE)
    const page = Math.max(1, Math.floor(params.page ?? 1))
    const { data, headers } = await client.getWithHeaders<CdekDeliveryPoint[]>('/deliverypoints', {
      size,
      page: page - 1,
    })
    const points = Array.isArray(data) ? data : []
    const totalPages = Number(headers['x-total-pages'])
    const totalCount = Number(headers['x-total-elements'])
    const hasTotalPages = headers['x-total-pages'] != null && Number.isFinite(totalPages)
    const hasTotalCount = headers['x-total-elements'] != null && Number.isFinite(totalCount)
    reportUpstreamPage(params, {
      ...(hasTotalCount ? { totalCount } : {}),
      ...(hasTotalPages
        ? { hasMore: page < totalPages }
        : hasTotalCount
          ? { hasMore: page * size < totalCount }
          : {}),
      ...(size < limit ? { pageSize: size } : {}),
    })
    return points.map(transformDeliveryPoint)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new CdekClient(credentials)
    // The deliverypoints endpoint accepts a ?code= filter.
    const res = await client.get<CdekDeliveryPoint[]>('/deliverypoints', { code: id })
    const points = Array.isArray(res) ? res : []
    const point = points[0]
    if (!point) throw new Error(`CDEK delivery point not found: ${id}`)
    return transformDeliveryPoint(point)
  }
}
