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
import type { Warehouse } from '../../schema/warehouse'
import type { Carrier } from '../../schema/carrier'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: manifest — Vamaship public API (Air Domestic, Surface Domestic,
//   and Miscellaneous APIs) exposes no manifest or pickup-schedule endpoint;
//   only quote, book, track, label, NDR, and webhook routes are documented.

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { VamashipClient } from './client'

import { transformShipment, type VamashipShipment } from './transform/shipment'
import { transformOrder, type VamashipOrder } from './transform/order'
import { transformTracking, type VamashipTrackingResponse } from './transform/tracking'
import { transformRate, type VamashipRateResponse } from './transform/rate'
import { transformLabel, type VamashipLabel } from './transform/label'

/**
 * Vamaship's first-party API Blueprints (the docs behind
 * https://vamaship.docs.apiary.io/):
 *   https://jsapi.apiary.io/apis/vamaship.source        (Air Domestic API)
 *   https://jsapi.apiary.io/apis/vamashipsurface.source (Surface Domestic API)
 * document only POST /dom/coverage, /dom/quote, /dom/quote-reverse, /dom/book,
 * /dom/book-reverse and /cancel (plus the /surface/* equivalents), and the
 * by-id lookups GET /details/{reference_id}, /track/{order_ids},
 * /trackawb/{awbs}, /track/withReferenceNumbers/{references} and /download/...
 * Neither blueprint has a collection of couriers, shipments, orders, labels
 * or warehouses, so those reads refuse before sending anything.
 */
const DOCUMENTED_ROUTES =
  'the Air Domestic and Surface Domestic API Blueprints document only coverage, quote, book, cancel, ' +
  'GET /details/{reference_id}, GET /track/{order_ids}, GET /trackawb/{awbs} and ' +
  'GET /track/withReferenceNumbers/{references}'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class VamashipAdapter implements LogisticsAdapter {
  readonly platform = 'vamaship'
  readonly version = '1'

  constructor(_config: Record<string, unknown> = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // code is the raw API key
    return exchangeCredentials(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(_credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    throw notSupported(
      `Vamaship cannot list shipments: no shipment collection is documented; ${DOCUMENTED_ROUTES}.`,
    )
  }

  async getShipment(_credentials: Credentials, _id: string): Promise<Shipment> {
    throw notSupported(
      `Vamaship cannot read shipments by id: GET dom/shipments/{id} is not documented; ${DOCUMENTED_ROUTES}.`,
    )
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new VamashipClient(credentials)
    const raw = await client.post<VamashipShipment>('dom/book', {
      consignee_name: data.destinationAddress?.name ?? '',
      consignee_address1: data.destinationAddress?.street1 ?? '',
      consignee_address2: data.destinationAddress?.street2 ?? '',
      consignee_city: data.destinationAddress?.city ?? '',
      consignee_state: data.destinationAddress?.state ?? '',
      consignee_pincode: data.destinationAddress?.postalCode ?? '',
      consignee_country: data.destinationAddress?.country ?? 'India',
      consignee_phone: data.destinationAddress?.phone ?? '',
      consignee_email: data.destinationAddress?.email ?? '',
      shipper_name: data.originAddress?.name ?? '',
      shipper_address1: data.originAddress?.street1 ?? '',
      shipper_address2: data.originAddress?.street2 ?? '',
      shipper_city: data.originAddress?.city ?? '',
      shipper_state: data.originAddress?.state ?? '',
      shipper_pincode: data.originAddress?.postalCode ?? '',
      shipper_country: data.originAddress?.country ?? 'India',
      weight: data.totalWeight?.value ?? 0.5,
      service_type: data.serviceCode ?? 'express',
      reference: data.reference ?? undefined,
    })
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new VamashipClient(credentials)
    await client.post<unknown>(`dom/shipments/${id}/cancel`, {})
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    throw notSupported(
      `Vamaship cannot list orders: no order collection is documented; ${DOCUMENTED_ROUTES}.`,
    )
  }

  async getOrder(_credentials: Credentials, _id: string): Promise<Order> {
    throw notSupported(
      `Vamaship cannot read orders by id: GET dom/orders/{id} is not documented; ${DOCUMENTED_ROUTES}.`,
    )
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new VamashipClient(credentials)
    const raw = await client.post<VamashipOrder>('dom/orders', {
      order_number: data.orderNumber ?? `order-${Date.now()}`,
      order_date: data.orderAt?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      consignee_name: data.destinationAddress?.name ?? '',
      consignee_address1: data.destinationAddress?.street1 ?? '',
      consignee_address2: data.destinationAddress?.street2 ?? '',
      consignee_city: data.destinationAddress?.city ?? '',
      consignee_state: data.destinationAddress?.state ?? '',
      consignee_pincode: data.destinationAddress?.postalCode ?? '',
      consignee_country: data.destinationAddress?.country ?? 'India',
      consignee_phone: data.destinationAddress?.phone ?? '',
      consignee_email: data.destinationAddress?.email ?? '',
      shipper_name: data.originAddress?.name ?? '',
      shipper_address1: data.originAddress?.street1 ?? '',
      shipper_city: data.originAddress?.city ?? '',
      shipper_state: data.originAddress?.state ?? '',
      shipper_pincode: data.originAddress?.postalCode ?? '',
      shipper_country: data.originAddress?.country ?? 'India',
      items: (data.lineItems ?? []).map((li) => ({
        name: li.name ?? '',
        sku: li.sku ?? '',
        quantity: li.quantity ?? 1,
        unit_price: li.unitAmount ?? 0,
      })),
      invoice_amount: data.subtotalAmount ?? data.totalAmount ?? 0,
      payment_mode: 'prepaid',
    })
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new VamashipClient(credentials)
    await client.post<unknown>(`dom/orders/${id}/cancel`, {})
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new VamashipClient(credentials)
    const raw = await client.get<VamashipTrackingResponse>(`dom/tracking/${trackingNumber}`)
    return transformTracking(raw, trackingNumber)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new VamashipClient(credentials)
    const pkg = params.packages[0]
    const res = await client.post<VamashipRateResponse>('dom/quote', {
      origin_pincode: params.originAddress.postalCode,
      destination_pincode: params.destinationAddress.postalCode,
      weight: pkg?.weight?.value ?? 0.5,
      length: pkg?.dimensions?.length ?? 10,
      breadth: pkg?.dimensions?.width ?? 10,
      height: pkg?.dimensions?.height ?? 10,
      payment_mode: 'prepaid',
    })
    return (res.results ?? []).map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async listLabels(_credentials: Credentials, _params: QueryParams): Promise<Label[]> {
    throw notSupported(
      `Vamaship cannot list labels: no label collection is documented (label URLs arrive only in a booking's "documents"); ${DOCUMENTED_ROUTES}.`,
    )
  }

  async getLabel(_credentials: Credentials, _id: string): Promise<Label> {
    throw notSupported(
      `Vamaship cannot read labels by id: GET dom/labels/{id} is not documented; ${DOCUMENTED_ROUTES}.`,
    )
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new VamashipClient(credentials)
    const raw = await client.post<VamashipLabel>('dom/labels', {
      shipment_id: data.shipmentId ?? undefined,
      awb_number: data.trackingNumber ?? undefined,
    })
    return transformLabel(raw)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new VamashipClient(credentials)
    await client.post<unknown>(`dom/labels/${id}/void`, {})
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────

  async listWarehouses(_credentials: Credentials, _params: QueryParams): Promise<Warehouse[]> {
    throw notSupported(
      `Vamaship cannot list warehouses: "warehouse" appears in neither API Blueprint; ${DOCUMENTED_ROUTES}.`,
    )
  }

  async getWarehouse(_credentials: Credentials, _id: string): Promise<Warehouse> {
    throw notSupported(
      `Vamaship cannot read warehouses: "warehouse" appears in neither API Blueprint; ${DOCUMENTED_ROUTES}.`,
    )
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    throw notSupported(
      `Vamaship cannot list carriers: the only supplier list is POST /dom/coverage, a lookup that requires an origin pickup pincode this connection does not hold, and its documented response carries only origin, status, success and destinations; ${DOCUMENTED_ROUTES}.`,
    )
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    throw notSupported(
      `Vamaship cannot read carriers: "courier" appears in neither API Blueprint; ${DOCUMENTED_ROUTES}.`,
    )
  }
}
