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
import { OutvioClient } from './client'

import { transformShipment, type OutvioShipment } from './transform/shipment'
import { transformRate, type OutvioRate } from './transform/rate'
import { transformLabel, type OutvioLabel } from './transform/label'
import { transformOrder, type OutvioOrder } from './transform/order'

/**
 * Outvio's first-party OpenAPI (https://developers.outvio.com/openapi.json,
 * "title": "Outvio API", server https://api.outvio.com) has no shipment,
 * order, tracking or label collection and no read of one by id. Its only
 * GET operations are /v1/order/batch/{batchId}, /v1/order/labels/{orderOrOtn},
 * /courier/list, /v1/courier/services/warehouse/{warehouseName}, /v1/courier,
 * /v1/courier/{warehouseId}, /v1/warehouse, /v1/shipping-list and
 * /v1/shipping-list/history. These reads refuse before sending anything.
 */
const OUTVIO_GET_OPERATIONS =
  'the Outvio API (https://developers.outvio.com/openapi.json) documents GET only for ' +
  '/v1/order/batch/{batchId}, /v1/order/labels/{orderOrOtn}, /courier/list, ' +
  '/v1/courier/services/warehouse/{warehouseName}, /v1/courier, /v1/courier/{warehouseId}, ' +
  '/v1/warehouse, /v1/shipping-list and /v1/shipping-list/history'

function notSupported(what: string, reason: string): Error {
  return Object.assign(new Error(`Outvio cannot ${what}: ${reason}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

interface OutvioAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

/**
 * Outvio logistics adapter.
 *
 * Outvio is a post-checkout operations platform for eCommerce that provides
 * shipping, tracking, and returns management through a single API. This
 * adapter integrates with the Outvio REST API v1, covering shipments, orders,
 * tracking events, rates, and labels.
 *
 * Base URL: https://api.outvio.com/v1/
 *
 * References:
 * - https://outvio.com/developers/
 * - https://developers.outvio.com/openapi.json (first-party OpenAPI 3.1, "Outvio API" 1.6)
 *
 * Shipment, order, tracking and label reads refuse with 501: the spec has no
 * collection or by-id read for any of them (see OUTVIO_GET_OPERATIONS).
 */
// ── Resource coverage ──────────────────────────────────────────────
// Not implemented: carrier   — spec documents GET /v1/courier ("Retrieve Couriers")
// Not implemented: warehouse — spec documents GET /v1/warehouse ("Retrieve Warehouses")
// Not implemented: manifest  — spec documents GET /v1/shipping-list/history

export class OutvioAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'outvio'
  readonly version = '1'

  constructor(_config: OutvioAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Outvio the "code" is the API key itself.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(_credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    throw notSupported(
      'list shipments',
      `${OUTVIO_GET_OPERATIONS}; there is no shipment collection`,
    )
  }

  async getShipment(_credentials: Credentials, _id: string): Promise<Shipment> {
    throw notSupported(
      'read shipments',
      `${OUTVIO_GET_OPERATIONS}; there is no shipment read by id`,
    )
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new OutvioClient(credentials)
    const raw = await client.post<OutvioShipment>('shipments', {
      reference: data.reference ?? undefined,
      serviceCode: data.serviceCode ?? undefined,
      carrierId: data.carrierId ?? undefined,
      originAddress: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address1: data.originAddress.street1,
            address2: data.originAddress.street2,
            city: data.originAddress.city,
            province: data.originAddress.state,
            zip: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      destinationAddress: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            address1: data.destinationAddress.street1,
            address2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            province: data.destinationAddress.state,
            zip: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight?.value ?? undefined,
      weightUnit: data.totalWeight?.unit ?? undefined,
      length: data.dimensions?.length ?? undefined,
      width: data.dimensions?.width ?? undefined,
      height: data.dimensions?.height ?? undefined,
      dimensionUnit: data.dimensions?.unit ?? undefined,
    })
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new OutvioClient(credentials)
    await client.post<unknown>(`shipments/${id}/cancel`, {})
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    throw notSupported('list orders', `${OUTVIO_GET_OPERATIONS}; there is no order collection`)
  }

  async getOrder(_credentials: Credentials, _id: string): Promise<Order> {
    throw notSupported('read orders', `${OUTVIO_GET_OPERATIONS}; there is no order read by id`)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new OutvioClient(credentials)
    const raw = await client.post<OutvioOrder>('orders', {
      orderNumber: data.orderNumber ?? undefined,
      currency: data.currency ?? undefined,
      notes: data.notes ?? undefined,
      requestedServiceCode: data.requestedServiceCode ?? undefined,
      destinationAddress: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            address1: data.destinationAddress.street1,
            address2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            province: data.destinationAddress.state,
            zip: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      lineItems: (data.lineItems ?? []).map((li) => ({
        id: li.id,
        sku: li.sku,
        name: li.name,
        description: li.description,
        quantity: li.quantity,
        price: li.unitAmount,
        total: li.totalAmount,
      })),
    })
    return transformOrder(raw)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = new OutvioClient(credentials)
    const raw = await client.put<OutvioOrder>(`orders/${id}`, {
      status: data.status ?? undefined,
      notes: data.notes ?? undefined,
    })
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new OutvioClient(credentials)
    await client.post<unknown>(`orders/${id}/cancel`, {})
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    _credentials: Credentials,
    _trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    throw notSupported(
      'read tracking events',
      `${OUTVIO_GET_OPERATIONS}; there is no tracking history read`,
    )
  }

  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    throw notSupported(
      'list tracking events',
      `${OUTVIO_GET_OPERATIONS}; there is no tracking collection`,
    )
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new OutvioClient(credentials)
    const res = await client.post<{ data: OutvioRate[]; rates?: OutvioRate[] }>('rates', {
      originAddress: {
        address1: params.originAddress.street1,
        address2: params.originAddress.street2,
        city: params.originAddress.city,
        province: params.originAddress.state,
        zip: params.originAddress.postalCode,
        country: params.originAddress.country,
      },
      destinationAddress: {
        address1: params.destinationAddress.street1,
        address2: params.destinationAddress.street2,
        city: params.destinationAddress.city,
        province: params.destinationAddress.state,
        zip: params.destinationAddress.postalCode,
        country: params.destinationAddress.country,
      },
      packages: params.packages.map((pkg) => ({
        weight: pkg.weight?.value,
        weightUnit: pkg.weight?.unit,
        length: pkg.dimensions?.length,
        width: pkg.dimensions?.width,
        height: pkg.dimensions?.height,
        dimensionUnit: pkg.dimensions?.unit,
      })),
      serviceCodes: params.serviceCodes ?? undefined,
    })
    const items = res.data ?? res.rates ?? []
    return items.map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async listLabels(_credentials: Credentials, _params: QueryParams): Promise<Label[]> {
    throw notSupported(
      'list labels',
      'labels are documented only per order, as GET /v1/order/labels/{orderOrOtn} ' +
        '("labels": "List of URLs of labels."), and there is no label collection',
    )
  }

  async getLabel(_credentials: Credentials, _id: string): Promise<Label> {
    throw notSupported(
      'read labels by id',
      'GET /v1/order/labels/{orderOrOtn} takes an order ID or OTN and returns ' +
        '"List of URLs of labels." with no label id',
    )
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('shipmentId is required to create a label')
    const client = new OutvioClient(credentials)
    const raw = await client.post<OutvioLabel>('labels', {
      shipmentId: data.shipmentId,
      format: data.format ?? 'PDF',
      serviceCode: data.serviceCode ?? undefined,
      carrierId: data.carrierId ?? undefined,
    })
    return transformLabel(raw)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new OutvioClient(credentials)
    await client.post<unknown>(`labels/${id}/void`, {})
  }
}
