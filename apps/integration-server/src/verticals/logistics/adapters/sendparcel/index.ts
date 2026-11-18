// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: manifest — SendParcel REST API (SP-API-EN.pdf) has no manifest concept or endpoint.
// Unavailable: warehouse — SendParcel REST API (SP-API-EN.pdf) has no warehouse concept or endpoint.
//
// Source for every read method below: the OpenAPI spec embedded in
// https://api.sendparcel.com/rest-api/doc (<script id="swagger-data">). Its
// complete set of /rest-api/ operations is POST orders/creates, orders/infos,
// orders/cancels, orders/documents, returns/postboxes, quotes and tracks, plus
// GET services. None is a shipments, orders, tracking or labels collection.

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
import type { Carrier } from '../../schema/carrier'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { SendParcelClient } from './client'

import { transformShipment, type SendParcelShipment } from './transform/shipment'
import { transformRate, type SendParcelRate } from './transform/rate'
import { transformLabel, type SendParcelLabel } from './transform/label'
import { transformOrder, type SendParcelOrder } from './transform/order'
import { transformOrderInfo, type SendParcelOrderInfo } from './transform/order-info'
import { transformOrderDocument, type SendParcelOrderDocument } from './transform/order-document'
import { listCarriers, getCarrier } from './transform/carrier'

interface SendParcelAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

const DOC_URL = 'https://api.sendparcel.com/rest-api/doc'

function notSupported(message: string): Error {
  return Object.assign(new Error(`${message} (${DOC_URL})`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

/** The spec types every order id it accepts as `"type":"integer"`. */
function orderIdBody(id: string): number {
  // A digit string past 2^53 would round in Number() and could address a
  // different order, so it is refused like any other non-integer id.
  const n = /^\d+$/.test(id) ? Number(id) : NaN
  if (!Number.isSafeInteger(n)) {
    throw Object.assign(new Error(`SendParcel order ids are integers; got '${id}'`), {
      statusCode: 400,
      code: 'INVALID_ID',
    })
  }
  return n
}

export class SendParcelAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'sendparcel'
  readonly version = '1'

  constructor(_config: SendParcelAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For SendParcel the "code" is the API key itself.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(_credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    throw notSupported(
      'SendParcel cannot list shipments: its REST API has no shipments resource, only POST /rest-api/orders/{creates,infos,cancels,documents}, /rest-api/quotes, /rest-api/returns/postboxes, /rest-api/tracks and GET /rest-api/services',
    )
  }

  async getShipment(_credentials: Credentials, _id: string): Promise<Shipment> {
    throw notSupported(
      'SendParcel cannot read a shipment: its REST API has no shipments resource; an order is read with POST /rest-api/orders/infos',
    )
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new SendParcelClient(credentials)
    const raw = await client.post<SendParcelShipment>('shipments', {
      reference: data.reference ?? undefined,
      carrier: data.carrierId ?? undefined,
      service: data.serviceCode ?? undefined,
      senderAddress: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            street: data.originAddress.street1,
            street2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postalCode: data.originAddress.postalCode,
            countryCode: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      receiverAddress: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            street: data.destinationAddress.street1,
            street2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postalCode: data.destinationAddress.postalCode,
            countryCode: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      parcel: data.totalWeight
        ? {
            weight: data.totalWeight.value,
          }
        : undefined,
      notes: data.notes ?? undefined,
    })
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new SendParcelClient(credentials)
    await client.post<unknown>(`shipments/${id}/cancel`, {})
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    throw notSupported(
      'SendParcel cannot list orders: POST /rest-api/orders/infos reads one order by "orderInfo":{"required":["id"]} and the API has no order collection',
    )
  }

  /** POST /rest-api/orders/infos, body `{"orderInfo":{"id":<integer>}}`. */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const orderId = orderIdBody(id)
    const client = new SendParcelClient(credentials)
    const raw = await client.post<SendParcelOrderInfo>('orders/infos', {
      orderInfo: { id: orderId },
    })
    return transformOrderInfo(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new SendParcelClient(credentials)
    const raw = await client.post<SendParcelOrder>('orders', {
      reference: data.orderNumber ?? undefined,
      senderAddress: data.originAddress
        ? {
            name: data.originAddress.name,
            street: data.originAddress.street1,
            street2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postalCode: data.originAddress.postalCode,
            countryCode: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      receiverAddress: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            street: data.destinationAddress.street1,
            street2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postalCode: data.destinationAddress.postalCode,
            countryCode: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      notes: data.notes ?? undefined,
    })
    return transformOrder(raw)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    _credentials: Credentials,
    _trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    throw notSupported(
      'SendParcel cannot look up tracking by tracking number: POST /rest-api/tracks is keyed by "orderTrack":{"id":{"description":"Order ID","type":"integer"}}',
    )
  }

  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    throw notSupported(
      'SendParcel cannot list tracking events: POST /rest-api/tracks returns one order\'s tracking by "orderTrack":{"required":["id"]} and the API has no tracking collection',
    )
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new SendParcelClient(credentials)
    const res = await client.post<
      { data?: SendParcelRate[]; services?: SendParcelRate[] } | SendParcelRate[]
    >('rates', {
      senderAddress: {
        name: params.originAddress.name,
        street: params.originAddress.street1,
        street2: params.originAddress.street2,
        city: params.originAddress.city,
        state: params.originAddress.state,
        postalCode: params.originAddress.postalCode,
        countryCode: params.originAddress.country,
      },
      receiverAddress: {
        name: params.destinationAddress.name,
        street: params.destinationAddress.street1,
        street2: params.destinationAddress.street2,
        city: params.destinationAddress.city,
        state: params.destinationAddress.state,
        postalCode: params.destinationAddress.postalCode,
        countryCode: params.destinationAddress.country,
      },
      parcel: params.packages[0]?.weight ? { weight: params.packages[0].weight.value } : undefined,
    })
    const items = Array.isArray(res) ? res : (res.data ?? res.services ?? [])
    return items.map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async listLabels(_credentials: Credentials, _params: QueryParams): Promise<Label[]> {
    throw notSupported(
      'SendParcel cannot list labels: labels come from POST /rest-api/orders/documents ("Get shipping labels (PDF)"), one order at a time by "orderFiles":{"required":["id"]}',
    )
  }

  /**
   * POST /rest-api/orders/documents, body `{"orderFiles":{"id":<integer>}}`,
   * read back by the order id. The response is an array of files; the Label
   * schema holds one, so an order with several documents is refused rather
   * than silently truncated.
   */
  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const orderId = orderIdBody(id)
    const client = new SendParcelClient(credentials)
    const files = await client.post<SendParcelOrderDocument[]>('orders/documents', {
      orderFiles: { id: orderId },
    })
    if (files.length === 0) {
      throw Object.assign(new Error(`SendParcel returned no documents for order ${id}`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    if (files.length > 1) {
      throw Object.assign(
        new Error(
          `SendParcel returned ${files.length} documents for order ${id} (${files.map((f) => f.file_name).join(', ')}); a Label holds one`,
        ),
        { statusCode: 409, code: 'MULTIPLE_DOCUMENTS' },
      )
    }
    return transformOrderDocument(id, files[0]!)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('shipmentId is required to create a label')
    const client = new SendParcelClient(credentials)
    const raw = await client.post<SendParcelLabel>('labels', {
      shipmentId: data.shipmentId,
      format: data.format ?? 'PDF',
    })
    return transformLabel(raw)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new SendParcelClient(credentials)
    await client.post<unknown>(`labels/${id}/void`, {})
  }

  // ── Carriers ───────────────────────────────────────────────────────────────
  // SendParcel exposes no live /carriers endpoint. The complete carrier/service
  // list is documented statically in SP-API-EN.pdf §9. We return that table.

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return listCarriers()
  }

  async getCarrier(_credentials: Credentials, id: string): Promise<Carrier> {
    const carrier = getCarrier(id)
    if (!carrier) throw new Error(`Carrier '${id}' not found in SendParcel static carrier list`)
    return carrier
  }
}
