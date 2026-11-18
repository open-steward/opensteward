import { pageLocally, simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Carrier } from '../../schema/carrier'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { DelivereeClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformDelivery, type DelivereeDelivery } from './transform/shipment'
import { transformDeliveryTracking } from './transform/tracking'
import { transformQuoteItem, type DelivereeQuoteItem } from './transform/rate'
import { transformVehicleType, type DelivereeVehicleType } from './transform/carrier'
import { verifyWebhook as doVerifyWebhook, parseWebhookEvents as doParseWebhookEvents } from './webhook'

// ── Resource coverage ──────────────────────────────────────────────
// Available:   rate, shipment, trackingevent, carrier
// Unavailable: label — Deliveree is an on-demand delivery platform with no label printing concept
// Unavailable: manifest — no manifest endpoint exists in the Deliveree API
// Unavailable: order — no order management concept; only delivery bookings (use shipments)
// Unavailable: warehouse — no warehouse endpoint exists in the Deliveree API

interface DelivereeAdapterConfig {
  sandbox?: boolean
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

interface DelivereeDeliveryList {
  deliveries?: DelivereeDelivery[]
  data?: DelivereeDelivery[]
  [key: string]: unknown
}

interface DelivereeQuoteResponse {
  data?: DelivereeQuoteItem[]
  [key: string]: unknown
}

interface DelivereeVehicleTypeList {
  vehicle_types?: DelivereeVehicleType[]
  data?: DelivereeVehicleType[]
  [key: string]: unknown
}

export class DelivereeAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'deliveree'
  readonly version = '1'

  constructor(_config: DelivereeAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Deliveree the "code" is the API key itself.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return doVerifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return doParseWebhookEvents(payload)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new DelivereeClient(credentials)
    const res = await client.get<DelivereeDeliveryList>('deliveries', {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    })
    const deliveries = res.deliveries ?? res.data ?? []
    return deliveries.map(transformDelivery)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new DelivereeClient(credentials)
    const raw = await client.get<DelivereeDelivery>(`deliveries/${id}`)
    return transformDelivery(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new DelivereeClient(credentials)
    const locations: Array<Record<string, unknown>> = []

    if (data.originAddress) {
      locations.push({
        address: data.originAddress.street1,
        recipient_name: data.originAddress.name,
        recipient_phone: data.originAddress.phone,
      })
    }

    if (data.destinationAddress) {
      locations.push({
        address: data.destinationAddress.street1,
        recipient_name: data.destinationAddress.name,
        recipient_phone: data.destinationAddress.phone,
      })
    }

    const raw = await client.post<DelivereeDelivery>('deliveries', {
      time_type: 'now',
      locations: locations.length >= 2 ? locations : undefined,
      job_order_number: data.reference,
    })
    return transformDelivery(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new DelivereeClient(credentials)
    await client.post<unknown>(`deliveries/${id}/cancel`, {})
  }

  // ── Carriers (vehicle types) ───────────────────────────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new DelivereeClient(credentials)
    const res = await client.get<DelivereeVehicleTypeList | DelivereeVehicleType[]>('vehicle_types')
    const items: DelivereeVehicleType[] = Array.isArray(res)
      ? (res as DelivereeVehicleType[])
      : (res as DelivereeVehicleTypeList).vehicle_types ?? (res as DelivereeVehicleTypeList).data ?? []
    // GET /vehicle_types takes only `pickup_location` and returns every vehicle type
    // of the area in one response, with no pagination block — slice the caller's page.
    return pageLocally(items.map(transformVehicleType), params)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new DelivereeClient(credentials)
    const raw = await client.get<DelivereeVehicleType>(`vehicle_types/${id}`)
    return transformVehicleType(raw)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, id: string): Promise<TrackingEvent[]> {
    const client = new DelivereeClient(credentials)
    const raw = await client.get<DelivereeDelivery>(`deliveries/${id}`)
    return transformDeliveryTracking(raw)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new DelivereeClient(credentials)
    const res = await client.get<DelivereeDeliveryList>('deliveries', {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    })
    const deliveries = res.deliveries ?? res.data ?? []
    return deliveries.flatMap(transformDeliveryTracking)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new DelivereeClient(credentials)
    const res = await client.post<DelivereeQuoteResponse>('deliveries/get_quote', {
      time_type: 'now',
      locations: [
        {
          address: params.originAddress.street1,
          recipient_name: params.originAddress.name,
          recipient_phone: params.originAddress.phone,
        },
        {
          address: params.destinationAddress.street1,
          recipient_name: params.destinationAddress.name,
          recipient_phone: params.destinationAddress.phone,
        },
      ],
    })
    const items: DelivereeQuoteItem[] = Array.isArray(res.data)
      ? res.data
      : Array.isArray(res)
        ? (res as DelivereeQuoteItem[])
        : []
    return items.map(transformQuoteItem)
  }
}
