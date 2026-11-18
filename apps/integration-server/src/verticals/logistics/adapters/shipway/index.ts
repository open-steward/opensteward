// ── Resource coverage ──────────────────────────────────────────────────────
// Available:   carrier    — GET /api/carriers (shipway.in)
// Available:   order      — POST /api/pushOrderData + /api/getOrderShipmentDetails (shipway.in)
// Available:   shipment   — POST /api/shipments (app.shipway.com)
// Available:   trackingevent — GET /api/tracking/:number (app.shipway.com)
// Available:   rate       — POST /api/rates (app.shipway.com)
// Unavailable: label      — Shipway is a tracking aggregator; no label generation endpoint exists
// Unavailable: manifest   — No manifest endpoint in Shipway API
// Unavailable: warehouse  — No warehouse management endpoint in Shipway API

import { pageLocally, simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Carrier } from '../../schema/carrier'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ShipwayClient } from './client'

import { transformTracking, type ShipwayTrackingResponse } from './transform/tracking'
import { transformShipment, type ShipwayShipmentRaw } from './transform/shipment'
import { transformCarrier, type ShipwayCarriersResponse } from './transform/carrier'
import { transformOrder, type ShipwayOrderRaw } from './transform/order'

interface ShipwayAdapterConfig { sandbox?: boolean }
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ShipwayAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'shipway'
  readonly version = '1'

  constructor(config: ShipwayAdapterConfig = {}) {

    void config
  }

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

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new ShipwayClient(credentials)
    const raw = await client.get<ShipwayTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking({ ...raw, tracking_number: raw.tracking_number ?? trackingNumber })
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ShipwayClient(credentials)
    const raw = await client.post<ShipwayShipmentRaw>('shipments', {
      reference: data.reference,
      service_code: data.serviceCode,
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            street1: data.originAddress.street1,
            street2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postal_code: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      recipient: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            street1: data.destinationAddress.street1,
            street2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
    })
    return transformShipment(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ShipwayClient(credentials)
    const pkg = params.packages[0]
    const res = await client.post<{ rates?: Array<Record<string, unknown>> }>('rates', {
      origin: {
        city: params.originAddress.city,
        postal_code: params.originAddress.postalCode,
        country: params.originAddress.country,
      },
      destination: {
        city: params.destinationAddress.city,
        postal_code: params.destinationAddress.postalCode,
        country: params.destinationAddress.country,
      },
      weight: pkg?.weight?.value,
      weight_unit: pkg?.weight?.unit ?? 'kg',
    })
    const list = res.rates ?? []
    return list.map((r) => ({
      carrierId: 'shipway',
      serviceCode: (r.service_code as string | undefined) ?? (r.code as string | undefined),
      serviceName: (r.service_name as string | undefined) ?? (r.name as string | undefined),
      currency: (r.currency as string | undefined) ?? 'USD',
      totalAmount: typeof r.total === 'number' ? r.total : typeof r.amount === 'number' ? r.amount : undefined,
      transitDays: typeof r.transit_days === 'number' ? r.transit_days : undefined,
      metadata: r as Record<string, unknown>,
    }))
  }

  // ── Carriers ───────────────────────────────────────────────────────────────
  // Endpoint: GET https://shipway.in/api/carriers
  // Returns { status, couriers: [{ id, courier_name, image }] }
  // Unpaginated: https://apidocs.shipway.in/ "Carriers list with ID" — "you will get the
  // complete list of all the integrated and available carriers". Sliced locally.

  async listCarriers(_credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    // The carriers endpoint is public; no auth needed.
    const axios = (await import('axios')).default
    const res = await axios.get<ShipwayCarriersResponse>('https://shipway.in/api/carriers', {
      headers: { Accept: 'application/json' },
    })
    const data = res.data
    return pageLocally((data.couriers ?? []).map(transformCarrier), params)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────
  // Endpoint: POST https://shipway.in/api/getOrderShipmentDetails (get by order_id)
  // Endpoint: POST https://shipway.in/api/pushOrderData (create/push order)

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const axios = (await import('axios')).default
    const apiKey = credentials.accessToken
    const res = await axios.post<ShipwayOrderRaw>(
      'https://shipway.in/api/getOrderShipmentDetails',
      { username: apiKey.split(':')[0] ?? apiKey, password: apiKey.split(':')[1] ?? apiKey, order_id: id },
      { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } },
    )
    return transformOrder(res.data)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const axios = (await import('axios')).default
    const apiKey = credentials.accessToken
    const destAddr = data.destinationAddress
    const res = await axios.post<ShipwayOrderRaw>(
      'https://shipway.in/api/pushOrderData',
      {
        username: apiKey.split(':')[0] ?? apiKey,
        password: apiKey.split(':')[1] ?? apiKey,
        order_id: data.orderNumber ?? data.id,
        first_name: destAddr?.name?.split(' ')[0],
        last_name: destAddr?.name?.split(' ').slice(1).join(' ') || undefined,
        email: destAddr?.email,
        phone: destAddr?.phone,
        city: destAddr?.city,
        state: destAddr?.state,
        pincode: destAddr?.postalCode,
        country: destAddr?.country,
        products: data.notes,
      },
      { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } },
    )
    return transformOrder({ ...res.data, order_id: (data.orderNumber ?? data.id) ?? res.data.order_id })
  }
}
