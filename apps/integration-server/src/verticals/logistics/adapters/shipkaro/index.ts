import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { Carrier } from '../../schema/carrier'
import type { Warehouse } from '../../schema/warehouse'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ShipKaroClient } from './client'

import { transformOrder, type ShipKaroOrder } from './transform/order'
import { transformShipment, type ShipKaroShipment } from './transform/shipment'
import { transformTracking, type ShipKaroTrackingData } from './transform/tracking'
import { transformRate, type ShipKaroRateResponse } from './transform/rate'
import { transformLabel, type ShipKaroLabel } from './transform/label'
import { transformManifest, type ShipKaroManifest } from './transform/manifest'

// ── Unsupported reads ──────────────────────────────────────────────────────

/**
 * ShipKaro's first-party API collection (the Postman documenter at
 * https://api.shipkaro.com/, collection 405770/77o314N) holds exactly five
 * requests, all POST to https://{{url}}/api/1/entity/…, where {{url}} is
 * documented as "the predefined url prefix for shipkaro APIs i.e
 * "www.shipkaro.com"":
 *
 *   ms.fulfillment/_/getRates, ms.fulfillment/_/createPickup,
 *   ms.fulfillment/_/trackShipment, ms.fulfillment/_/checkDeliveryAvailability,
 *   ms.plans_and_billing/_/createSubAccount
 *
 * None lists or reads back orders, shipments, carriers, pickup addresses,
 * labels or manifests, so those methods refuse before sending anything.
 */
const DOCUMENTED_CALLS =
  '"Get Rates", "Create Pickup", "Track Shipment", "Check Delivery Availability", "Create Sub Account"'

function notSupported(what: string): Error {
  return Object.assign(
    new Error(
      `ShipKaro cannot ${what}: its API collection (https://api.shipkaro.com/) documents only ${DOCUMENTED_CALLS}, all POST calls, and none of them returns this resource`,
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

// ── Adapter config ─────────────────────────────────────────────────────────

interface ShipKaroAdapterConfig {
  // Reserved for future use (e.g. multi-account routing)
  accountId?: string
}

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'Access key',
  helpText: 'Found in your ShipKaro dashboard under Plans & Billings → access_keys.',
})

/**
 * ShipKaroAdapter implements LogisticsAdapter against the ShipKaro REST API.
 *
 * Authentication: API key sent in the `access-key` request header.
 * Base URL: https://api.shipkaro.com/
 *
 * The list and get-by-id methods refuse with 501 NOT_SUPPORTED: the documented
 * API has no read endpoint for those resources (see notSupported above). The
 * write methods, getRates and getTrackingEvents still call REST paths on
 * api.shipkaro.com that the first-party collection does not document; its
 * calls are POSTs to www.shipkaro.com/api/1/entity/ms.fulfillment/_/<action>.
 *
 * ShipKaro is a StoreHippo initiative — an Indian shipping aggregator that
 * consolidates domestic and international courier partners.
 *
 * No webhook signing scheme is documented; webhook.ts is omitted.
 */
export class ShipKaroAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'shipkaro'
  readonly version = '1'

  constructor(_config: ShipKaroAdapterConfig = {}) {}

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

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    throw notSupported('list orders')
  }

  async getOrder(_credentials: Credentials, _id: string): Promise<Order> {
    throw notSupported('read an order by id')
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ShipKaroClient(credentials)
    const raw = await client.post<ShipKaroOrder>('/orders/create', {
      order_id: data.orderNumber ?? `order-${Date.now()}`,
      order_date: data.orderAt?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      pickup_location: data.notes ?? 'Primary',
      billing_customer_name: data.originAddress?.name ?? data.destinationAddress?.name ?? '',
      billing_address: data.originAddress?.street1 ?? '',
      billing_address_2: data.originAddress?.street2 ?? '',
      billing_city: data.originAddress?.city ?? '',
      billing_state: data.originAddress?.state ?? '',
      billing_pincode: data.originAddress?.postalCode ?? '',
      billing_country: data.originAddress?.country ?? 'India',
      billing_phone: data.originAddress?.phone ?? '',
      billing_email: data.originAddress?.email ?? '',
      shipping_is_billing: !data.destinationAddress,
      shipping_customer_name: data.destinationAddress?.name ?? '',
      shipping_address: data.destinationAddress?.street1 ?? '',
      shipping_address_2: data.destinationAddress?.street2 ?? '',
      shipping_city: data.destinationAddress?.city ?? '',
      shipping_state: data.destinationAddress?.state ?? '',
      shipping_pincode: data.destinationAddress?.postalCode ?? '',
      shipping_country: data.destinationAddress?.country ?? 'India',
      shipping_phone: data.destinationAddress?.phone ?? '',
      shipping_email: data.destinationAddress?.email ?? '',
      order_items: (data.lineItems ?? []).map((li) => ({
        name: li.name ?? '',
        sku: li.sku ?? '',
        units: li.quantity ?? 1,
        selling_price: li.unitAmount ?? 0,
      })),
      sub_total: data.subtotalAmount ?? data.totalAmount ?? 0,
      payment_method: 'Prepaid',
      length: 10,
      breadth: 10,
      height: 10,
      weight: 0.5,
    })
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new ShipKaroClient(credentials)
    await client.post<unknown>('/orders/cancel', { ids: [id] })
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(_credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    throw notSupported('list shipments')
  }

  async getShipment(_credentials: Credentials, _id: string): Promise<Shipment> {
    throw notSupported('read a shipment by id')
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ShipKaroClient(credentials)
    const raw = await client.post<ShipKaroShipment>('/shipments/create', {
      order_id: data.reference,
      courier_id: data.carrierId,
      service_code: data.serviceCode,
      weight: data.totalWeight?.value ?? 0.5,
      length: 10,
      breadth: 10,
      height: 10,
    })
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new ShipKaroClient(credentials)
    await client.post<unknown>('/shipments/cancel', { shipment_id: id })
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    throw notSupported('list carriers')
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    throw notSupported('read a carrier by id')
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────

  async listWarehouses(_credentials: Credentials, _params: QueryParams): Promise<Warehouse[]> {
    throw notSupported('list warehouses')
  }

  async getWarehouse(_credentials: Credentials, _id: string): Promise<Warehouse> {
    throw notSupported('read a warehouse by id')
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new ShipKaroClient(credentials)
    const raw = await client.get<ShipKaroTrackingData>(`/tracking/shipment/${trackingNumber}`)
    return transformTracking(raw, trackingNumber)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ShipKaroClient(credentials)
    const pkg = params.packages[0]
    const res = await client.get<ShipKaroRateResponse>('/courier/serviceability', {
      pickup_pincode: params.originAddress.postalCode,
      delivery_pincode: params.destinationAddress.postalCode,
      weight: pkg?.weight?.value ?? 0.5,
      cod: 0,
    })
    const companies = res.data?.available_courier_companies ?? res.available_courier_companies ?? []
    return companies.map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async listLabels(_credentials: Credentials, _params: QueryParams): Promise<Label[]> {
    throw notSupported('list labels')
  }

  async getLabel(_credentials: Credentials, _id: string): Promise<Label> {
    throw notSupported('read a label by id')
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new ShipKaroClient(credentials)
    const raw = await client.post<ShipKaroLabel>('/labels/generate', {
      shipment_id: data.shipmentId,
      label_type: data.format?.toLowerCase() ?? 'pdf',
    })
    return transformLabel(raw)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new ShipKaroClient(credentials)
    await client.post<unknown>('/labels/void', { label_id: id })
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async listManifests(_credentials: Credentials, _params: QueryParams): Promise<Manifest[]> {
    throw notSupported('list manifests')
  }

  async getManifest(_credentials: Credentials, _id: string): Promise<Manifest> {
    throw notSupported('read a manifest by id')
  }

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new ShipKaroClient(credentials)
    const raw = await client.post<ShipKaroManifest>('/manifests/generate', {
      carrier_id: data.carrierId,
      pickup_address_id: data.warehouseId,
      shipment_ids: data.shipmentIds,
    })
    return transformManifest(raw)
  }
}
