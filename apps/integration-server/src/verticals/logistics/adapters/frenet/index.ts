import { simpleApiKey, reportUpstreamPage } from '@opensteward/shared'
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
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { apiClient, whitelabelClient, type FrenetClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformShipment, type FrenetShipment } from './transform/shipment'
import { transformRate, type FrenetShippingService } from './transform/rate'
import { transformLabel, type FrenetLabel } from './transform/label'
import { transformTrackingResponse, type FrenetTrackingResponse } from './transform/tracking'
import { transformOrder, type FrenetOrder } from './transform/order'
import {
  transformWhitelabelShipment,
  transformWhitelabelOrder,
  transformWhitelabelLabel,
  type FrenetWhitelabelPage,
  type FrenetWhitelabelShipment,
  type FrenetWhitelabelLabel,
} from './transform/whitelabel'

interface FrenetAdapterConfig {
  /** The integrator's `x-partner-token`, issued by Frenet's partnerships team. */
  partnerToken?: string
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

// ── Resource coverage ──────────────────────────────────────────────────────
// Reads follow https://docs.frenet.com.br/reference (index: /llms.txt):
//   GET  whitelabel.frenet.com.br/v1/shipments?page&per_page   getShipmentsAsync
//   GET  whitelabel.frenet.com.br/v1/shipments/{shipmentId}    getShipmentAsync
//   GET  whitelabel.frenet.com.br/v1/shipments/{shipmentId}/label  getShipmentLabelAsync
//   GET  whitelabel.frenet.com.br/v1/orders?page&per_page      getOrdersAsync
//   GET  whitelabel.frenet.com.br/v1/orders/{shipmentId}       getOrderAsync
//   POST api.frenet.com.br/tracking/trackinginfo               trackOrder
// Unavailable: tracking-event list — trackinginfo is a per-object lookup.
// Unavailable: manifest, warehouse — no REST endpoint.
// ───────────────────────────────────────────────────────────────────────────

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function upstreamPaging(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 502, code: 'UPSTREAM_PAGING' })
}

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400, code: 'VALIDATION' })
}

/** `shipmentId` is a path integer: `{"in": "path", "schema": {"type": "integer", "format": "int64"}}`. */
function shipmentIdPath(id: string): string {
  const trimmed = String(id ?? '').trim()
  if (!/^\d+$/.test(trimmed)) {
    throw badRequest(`Frenet shipmentId must be an integer, got "${id}"`)
  }
  return trimmed
}

/**
 * One caller page of `GET /shipments` or `GET /orders`: `page` ("página") and
 * `per_page` ("total de registros por página") as the caller asked, and the
 * end taken from `Total` ("Total de envios"). Frenet documents no maximum
 * for `per_page`, so the caller's limit is sent as is.
 */
async function listWhitelabelPage(
  client: FrenetClient,
  path: '/shipments' | '/orders',
  params: QueryParams,
): Promise<FrenetWhitelabelShipment[]> {
  const page =
    typeof params.page === 'number' && Number.isInteger(params.page) && params.page >= 1
      ? params.page
      : 1
  const perPage =
    typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
      ? Math.floor(params.limit)
      : DEFAULT_PAGE_SIZE
  const res = await client.get<FrenetWhitelabelPage>(path, { page, per_page: perPage })
  const rows = Array.isArray(res?.shipments) ? res.shipments : []
  const total =
    typeof res?.total === 'number' && Number.isInteger(res.total) && res.total >= 0
      ? res.total
      : undefined
  if (total !== undefined) {
    const offset = (page - 1) * perPage
    // The end is computed from the page size sent. A page larger than that,
    // or a short page that stops before `total`, means Frenet did not honour
    // `per_page` (no maximum is documented), so the offset arithmetic no
    // longer holds. Fail loudly rather than end the walk early and let the
    // sync treat a partial collection as complete.
    if (rows.length > perPage || (rows.length < perPage && offset + rows.length < total)) {
      throw upstreamPaging(
        `Frenet ${path} page ${page} returned ${rows.length} rows for per_page=${perPage} with total=${total}`,
      )
    }
    reportUpstreamPage(params, {
      totalCount: total,
      hasMore: offset + rows.length < total,
    })
  }
  return rows
}

/**
 * FrenetAdapter — OpenSteward logistics adapter for Frenet (frenet.com.br).
 *
 * Frenet is a Brazilian multi-carrier shipping platform: quotes, labels and
 * tracking over the carriers on the merchant's Frenet contract.
 *
 * Auth: the merchant's token in a `token` header on every route; the
 * WhiteLabel routes also need the integrator's `x-partner-token`, taken from
 * the adapter config.
 */
export class FrenetAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'frenet'
  readonly version = '1'

  private partnerToken?: string

  constructor(config: FrenetAdapterConfig = {}) {
    this.partnerToken = config.partnerToken
  }

  private whitelabel(credentials: Credentials): FrenetClient {
    return whitelabelClient(credentials, this.partnerToken)
  }

  // ── Auth ─────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhook ───────────────────────────────────────────────────────────────
  //
  // Frenet webhooks do not have a standard signing scheme — security relies on
  // optional custom TOKEN_NAME/TOKEN_VALUE headers configured out-of-band.
  // We therefore do not implement verifyWebhook and only provide parseWebhookEvents.

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    // Frenet sends two webhook types: order data updates and tracking updates.
    // Both share a similar top-level structure.
    const trackingPayload = payload as FrenetTrackingResponse
    const hasTrackingEvents = Array.isArray(trackingPayload.TrackingEvents)

    if (hasTrackingEvents) {
      // Tracking update webhook
      const trackingEvents = transformTrackingResponse(trackingPayload)
      return trackingEvents.map((te): WebhookEvent => ({
        platform: 'frenet',
        type: 'tracking.updated',
        resourceType: 'tracking_event',
        action: 'updated',
        resourceId: te.trackingNumber ?? undefined,
        payload,
      }))
    }

    // Order/shipment data update webhook
    const orderId = payload['OrderId'] != null ? String(payload['OrderId']) : undefined
    return [
      {
        platform: 'frenet',
        type: 'order.updated',
        resourceType: 'order',
        action: 'updated',
        resourceId: orderId,
        payload,
      },
    ]
  }

  // ── Shipments ─────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const rows = await listWhitelabelPage(this.whitelabel(credentials), '/shipments', params)
    return rows.map(transformWhitelabelShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const shipmentId = shipmentIdPath(id)
    const raw = await this.whitelabel(credentials).get<FrenetWhitelabelShipment>(
      `/shipments/${shipmentId}`,
    )
    return transformWhitelabelShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = this.whitelabel(credentials)
    const raw = await client.post<FrenetShipment>('/shipments', {
      ShipmentInvoiceValue: data.cost?.amount ?? 0,
      Weight: data.totalWeight?.value ?? undefined,
      Height: data.dimensions?.height ?? undefined,
      Width: data.dimensions?.width ?? undefined,
      Length: data.dimensions?.length ?? undefined,
      RecipientName: data.destinationAddress?.name ?? undefined,
      RecipientPostcode: data.destinationAddress?.postalCode ?? undefined,
      SenderPostcode: data.originAddress?.postalCode ?? undefined,
      OrderNumber: data.reference ?? undefined,
    })
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = this.whitelabel(credentials)
    await client.post<unknown>('/shipments/batch/cancel', { ShipmentIds: [id] })
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const rows = await listWhitelabelPage(this.whitelabel(credentials), '/orders', params)
    return rows.map(transformWhitelabelOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const shipmentId = shipmentIdPath(id)
    const raw = await this.whitelabel(credentials).get<FrenetWhitelabelShipment>(
      `/orders/${shipmentId}`,
    )
    return transformWhitelabelOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = this.whitelabel(credentials)
    const raw = await client.post<FrenetOrder>('/orders', {
      OrderNumber: data.orderNumber ?? undefined,
      RecipientName: data.destinationAddress?.name ?? undefined,
      RecipientPostcode: data.destinationAddress?.postalCode ?? undefined,
      RecipientEmail: data.destinationAddress?.email ?? undefined,
      RecipientPhone: data.destinationAddress?.phone ?? undefined,
      RecipientAddress: data.destinationAddress?.street1 ?? undefined,
      RecipientCity: data.destinationAddress?.city ?? undefined,
      RecipientUF: data.destinationAddress?.state ?? undefined,
      SenderPostcode: data.originAddress?.postalCode ?? undefined,
      Currency: data.currency ?? 'BRL',
      InvoiceValue: data.totalAmount ?? 0,
    })
    return transformOrder(raw)
  }

  // ── Tracking Events ───────────────────────────────────────────────────────

  /**
   * POST /tracking/trackinginfo. `TrackingRequest` declares
   * `"required": ["ShippingServiceCode", "TrackingNumber"]`, with
   * ShippingServiceCode "Código do serviço de entrega" (the Apiary blueprint:
   * "obtido no resultado da cotação"). The router's `?carrier=` hint carries
   * it; without one the call is refused before anything is sent.
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
    carrier?: string,
  ): Promise<TrackingEvent[]> {
    const serviceCode = carrier?.trim()
    if (!serviceCode) {
      throw badRequest(
        'Frenet tracking needs the shipping service code ("ShippingServiceCode", required): ' +
          'pass it as ?carrier=<ShippingServiceCode>',
      )
    }
    const raw = await apiClient(credentials).post<FrenetTrackingResponse>(
      '/tracking/trackinginfo',
      {
        ShippingServiceCode: serviceCode,
        TrackingNumber: trackingNumber,
      },
    )
    const error = typeof raw?.ErrorMessage === 'string' ? raw.ErrorMessage.trim() : ''
    if (error) {
      throw Object.assign(new Error(`Frenet tracking failed: ${error}`), {
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
      })
    }
    return transformTrackingResponse(raw)
  }

  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    throw notSupported(
      'Frenet cannot list tracking events: POST /tracking/trackinginfo tracks one object and requires ' +
        '"ShippingServiceCode" and "TrackingNumber"; no route lists tracking events',
    )
  }

  // ── Rates ─────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = apiClient(credentials)
    const now = new Date()
    const body = {
      SellerCEP: params.originAddress.postalCode ?? '',
      RecipientCEP: params.destinationAddress.postalCode ?? '',
      ShipmentInvoiceValue: 0,
      ShippingServiceCode: params.serviceCodes?.[0] ?? null,
      ShippingItemArray: params.packages.map((pkg) => ({
        Weight: pkg.weight?.value ?? 0.3,
        Length: pkg.dimensions?.length ?? 16,
        Height: pkg.dimensions?.height ?? 5,
        Width: pkg.dimensions?.width ?? 11,
        Quantity: 1,
      })),
    }

    const res = await client.post<
      { ShippingServices: FrenetShippingService[] } | FrenetShippingService[]
    >('/shipping/quote', body)

    const services: FrenetShippingService[] = Array.isArray(res)
      ? res
      : ((res as { ShippingServices: FrenetShippingService[] }).ShippingServices ?? [])

    return services.filter((s) => !s.HasError).map((s) => transformRate(s, now))
  }

  // ── Labels ────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const shipmentId = shipmentIdPath(id)
    const raw = await this.whitelabel(credentials).get<FrenetWhitelabelLabel>(
      `/shipments/${shipmentId}/label`,
    )
    return transformWhitelabelLabel(raw)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('shipmentId is required to generate a Frenet label')
    const client = this.whitelabel(credentials)
    // Frenet POST /shipments triggers label generation; fetch the label from the result
    const raw = await client.post<FrenetLabel>('/shipments/checkout', {
      ShipmentIds: [data.shipmentId],
    })
    return transformLabel(raw)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = this.whitelabel(credentials)
    await client.post<unknown>('/shipments/batch/cancel', { ShipmentIds: [id] })
  }
}
