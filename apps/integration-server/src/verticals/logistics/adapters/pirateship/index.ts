// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: carrier   — no dedicated endpoint; carrier info (USPS/UPS) is embedded in rate responses only
// Unavailable: manifest  — PirateShip has no end-of-day manifest concept
// Unavailable: warehouse — PirateShip has no warehouse concept; sender address only

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { PirateShipClient } from './client'

import { transformTracking, type PirateShipTrackingResponse } from './transform/tracking'
import { transformShipment, type PirateShipShipment } from './transform/shipment'
import { transformRate, type PirateShipRate } from './transform/rate'
import { transformLabel, type PirateShipLabel } from './transform/label'
import { transformOrder, type PirateShipOrder } from './transform/order'

interface PirateShipAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class PirateShipAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'pirateship'
  readonly version = '1'

  constructor(_config: PirateShipAdapterConfig = {}) {}

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

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new PirateShipClient(credentials)
    const res = await client.get<{ shipments?: PirateShipOrder[] } | PirateShipOrder[]>(
      'shipments',
      {
        limit: params.limit ?? 50,
        page: params.cursor ?? 1,
      },
    )
    const items = Array.isArray(res) ? res : (res as { shipments?: PirateShipOrder[] }).shipments ?? []
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new PirateShipClient(credentials)
    const raw = await client.get<PirateShipOrder>(`shipments/${id}`)
    return transformOrder(raw)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const trackingNumber =
      typeof params.trackingNumber === 'string'
        ? params.trackingNumber
        : undefined
    if (!trackingNumber) return []
    return this.getTrackingEvents(credentials, trackingNumber)
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new PirateShipClient(credentials)
    const raw = await client.get<PirateShipTrackingResponse>(`shipments/${trackingNumber}/tracking`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new PirateShipClient(credentials)
    const raw = await client.post<PirateShipShipment>('shipments', {
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address_line1: data.originAddress.street1,
            address_line2: data.originAddress.street2,
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
            address_line1: data.destinationAddress.street1,
            address_line2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight?.value,
      weight_unit: data.totalWeight?.unit ?? 'oz',
      service_code: data.serviceCode,
      reference: data.reference,
    })
    return transformShipment(raw)
  }

  // ── Rates ─────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new PirateShipClient(credentials)
    const raw = await client.post<{ rates: PirateShipRate[] }>('rates', {
      origin: params.originAddress,
      destination: params.destinationAddress,
      packages: params.packages,
      service_codes: params.serviceCodes,
    })
    return (raw.rates ?? []).map(transformRate)
  }

  // ── Labels ────────────────────────────────────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new PirateShipClient(credentials)
    const raw = await client.post<PirateShipLabel>(`shipments/${data.shipmentId}/labels`, {
      format: data.format ?? 'PDF',
    })
    return transformLabel(raw)
  }
}
