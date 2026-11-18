import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { WebhookEvent } from '../../schema/webhook'
import type { Order } from '../../schema/order'
import type { Label } from '../../schema/label'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { IntelipostClient } from './client'

import { transformShipment, type IntelipostShipmentOrderRaw } from './transform/shipment'
import { transformVolumeToTrackingEvents } from './transform/tracking'
import { transformOrder } from './transform/order'
import { transformLabel, type IntelipostLabelRaw } from './transform/label'
import {
  transformDeliveryOptionToRate,
  type IntelipostQuoteResponse,
} from './transform/rate'

// ── Resource coverage ──────────────────────────────────────────────
// Source: the TMS Embarcador OpenAPI export (Swagger 2.0, host api.intelipost.com.br,
// basePath /api/v1, auth header `api-key`):
// https://stoplight.io/api/v1/projects/intelipost/tms-embarcador/nodes/reference/openapi.json?fromExportButton=true&snapshotType=http_service
// Refused (501): listShipments, listOrders, listTrackingEvents, listLabels — no list
//   endpoint for shipment orders; each read takes one identifier.
// Not implemented: warehouse — GET /warehouse ("Consultar centros de distribuição
//   disponíveis") is documented but this adapter has no warehouse methods.
// Unverified: carrier, manifest — no read endpoint in the export.

// ─── Intelipost API envelope ─────────────────────────────────────────────────
// Documented 200 responses wrap the payload as {"status", "messages", "content", ...}.

interface IntelipostResponse<T> {
  status?: string
  content?: T
  [key: string]: unknown
}

const SHIPMENT_ORDER_HAS_NO_LIST =
  'the API documents /shipment_order only as POST "Criar pedido de entrega"; every GET under /shipment_order/ takes one order number, sales order number, invoice or tracking code in the path'

function notSupported(resource: string, reason: string): Error {
  return Object.assign(new Error(`Intelipost cannot list ${resource}: ${reason}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

// ─── Config ──────────────────────────────────────────────────────────────────

interface IntelipostAdapterConfig {
  clientId?: string
  clientSecret?: string
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class IntelipostAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'intelipost'
  readonly version = '1'

  constructor(_config: IntelipostAdapterConfig = {}) {}

  // ── Auth ─────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // The "code" is the API key itself for API-key auth.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhooks ─────────────────────────────────────────────────────────────

  /**
   * Intelipost does not publish a documented webhook signature scheme.
   * Always return false until a real signature check is implemented.
   */
  verifyWebhook(
    _payload: Buffer,
    _headers: Record<string, string>,
    _secret: string,
  ): boolean {
    return false
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    // Intelipost webhook payloads contain a shipment_order_volume_state field
    // indicating the new status, plus order_number identifying the resource.
    const orderNumber = String(payload['order_number'] ?? payload['sales_order_number'] ?? '')
    const state = String(payload['shipment_order_volume_state'] ?? '')

    if (!orderNumber || !state) return []

    // Map Intelipost event states to canonical actions
    type CanonicalAction = WebhookEvent['action']
    const cancelledStates = new Set(['CANCELLED', 'RETURN_TO_SENDER', 'RETURNED'])
    const action: CanonicalAction = cancelledStates.has(state.toUpperCase())
      ? 'cancelled'
      : 'updated'

    return [
      {
        platform: 'intelipost',
        type: `shipment.${state.toLowerCase()}`,
        resourceType: 'tracking_event',
        action,
        resourceId: orderNumber,
        payload,
      },
    ]
  }

  // ── Shipments ────────────────────────────────────────────────────────────
  // Spec: https://stoplight.io/api/v1/projects/intelipost/tms-embarcador/nodes/reference/openapi.json?fromExportButton=true&snapshotType=http_service
  // "/shipment_order" documents only "post" ("Criar pedido de entrega"). Every
  // GET under /shipment_order/ takes one identifier in the path.

  async listShipments(_credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    throw notSupported('shipments', SHIPMENT_ORDER_HAS_NO_LIST)
  }

  // GET /shipment_order/{pedido_de_entrega} — "Consultar pedido de entrega"
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    return transformShipment(await this.readShipmentOrder(credentials, id, 'shipment'))
  }

  // ── Tracking Events ──────────────────────────────────────────────────────

  /**
   * GET /shipment_order/tracking_code/{codigo_rastreamento} — "Consultar pedido
   * utilizando o código de rastreamento". Its documented `content` is an array
   * of shipment orders; the events are the history of each volume whose
   * `tracking_code` is the one asked for.
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new IntelipostClient(credentials)
    const res = await client.get<IntelipostResponse<IntelipostShipmentOrderRaw[]>>(
      `/shipment_order/tracking_code/${encodeURIComponent(trackingNumber)}`,
    )
    return (res.content ?? []).flatMap((order) =>
      (order.shipment_order_volume_array ?? [])
        .filter((vol) => vol.tracking_code === trackingNumber)
        .flatMap((vol) => transformVolumeToTrackingEvents(order, vol)),
    )
  }

  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    throw notSupported(
      'tracking events',
      `tracking history is documented only inside one shipment order (shipment_order_volume_state_history_array), and ${SHIPMENT_ORDER_HAS_NO_LIST}`,
    )
  }

  // ── Orders ───────────────────────────────────────────────────────────────
  // Intelipost has no separate order resource — a shipment order is the order.

  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    throw notSupported('orders', SHIPMENT_ORDER_HAS_NO_LIST)
  }

  // GET /shipment_order/{pedido_de_entrega} — "Consultar pedido de entrega"
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    return transformOrder(await this.readShipmentOrder(credentials, id, 'order'))
  }

  // ── Labels ───────────────────────────────────────────────────────────────

  /**
   * GET /shipment_order/get_label/{pedido_envio}/{numero_volume} — "Essa API
   * permite buscar a etiqueta de postagem correspondente a um pedido e volume."
   * The id is `{order_number}:{volume_number}`, as transformLabel builds it;
   * both parts are required path parameters.
   */
  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const sep = id.lastIndexOf(':')
    const orderNumber = sep > 0 ? id.slice(0, sep) : ''
    const volumeNumber = sep > 0 ? id.slice(sep + 1) : ''
    if (!orderNumber || !volumeNumber) {
      throw Object.assign(
        new Error(
          `Intelipost label id must be "{order_number}:{volume_number}" (get_label needs both), got "${id}"`,
        ),
        { statusCode: 400, code: 'INVALID_ID' },
      )
    }
    const client = new IntelipostClient(credentials)
    const res = await client.get<IntelipostResponse<IntelipostLabelRaw>>(
      `/shipment_order/get_label/${encodeURIComponent(orderNumber)}/${encodeURIComponent(volumeNumber)}`,
    )
    if (!res.content) {
      throw new Error(`Intelipost: no content in response for label ${id}`)
    }
    return transformLabel(res.content)
  }

  async listLabels(_credentials: Credentials, _params: QueryParams): Promise<Label[]> {
    throw notSupported(
      'labels',
      `the only label read is GET /shipment_order/get_label/{pedido_envio}/{numero_volume} ("buscar a etiqueta de postagem correspondente a um pedido e volume"), and ${SHIPMENT_ORDER_HAS_NO_LIST}`,
    )
  }

  private async readShipmentOrder(
    credentials: Credentials,
    id: string,
    what: string,
  ): Promise<IntelipostShipmentOrderRaw> {
    const client = new IntelipostClient(credentials)
    const res = await client.get<IntelipostResponse<IntelipostShipmentOrderRaw>>(
      `/shipment_order/${encodeURIComponent(id)}`,
    )
    if (!res.content) {
      throw new Error(`Intelipost: no content in response for ${what} ${id}`)
    }
    return res.content
  }

  // ── Rates ────────────────────────────────────────────────────────────────
  // Endpoint: POST /quote

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new IntelipostClient(credentials)

    const originZip = params.originAddress?.postalCode ?? ''
    const destinationZip = params.destinationAddress?.postalCode ?? ''

    const volumes = params.packages.map((pkg) => ({
      weight: pkg.weight?.value ?? 0,
      volume_type: 'BOX',
      cost_of_goods: 0,
      width: pkg.dimensions?.width ?? 0,
      height: pkg.dimensions?.height ?? 0,
      length: pkg.dimensions?.length ?? 0,
    }))

    const body = {
      origin_zip_code: originZip,
      destination_zip_code: destinationZip,
      volumes,
    }

    const res = await client.post<IntelipostQuoteResponse>('/quote', body)
    const deliveryOptions = res.content?.delivery_options ?? []
    return deliveryOptions.map(transformDeliveryOptionToRate)
  }
}
