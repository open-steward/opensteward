// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Ninja Van is itself the single carrier; no /carriers endpoint exists
// Unavailable: manifest  — No manifest/bulk-closeout endpoint in the public Ninja Van API
// Unavailable: warehouse — No warehouse management endpoint in the public Ninja Van API

import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Order } from '../../schema/order'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { NinjaVanClient } from './client'

import { transformTrackingEvents, type NinjaVanTrackingResponse } from './transform/tracking'
import { transformShipment, type NinjaVanShipmentResponse } from './transform/shipment'
import { transformRate, type NinjaVanRatesResponse } from './transform/rate'
import { transformOrder, type NinjaVanOrderResponse } from './transform/order'
import { transformLabel, type NinjaVanWaybillResponse } from './transform/label'

export interface NinjaVanAdapterConfig {
  clientId?: string
  clientSecret?: string
}

export class NinjaVanAdapter implements LogisticsAdapter {
  readonly platform = 'ninja-van'
  readonly version = '1'

  private config: NinjaVanAdapterConfig

  constructor(config: NinjaVanAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('ninja-van: clientId and clientSecret are required')
    }
    return exchangeCredentials({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new NinjaVanClient(credentials)
    const res = await client.get<NinjaVanRatesResponse>('/rates', {
      originPostcode: params.originAddress.postalCode,
      originCountry: params.originAddress.country,
      destinationPostcode: params.destinationAddress.postalCode,
      destinationCountry: params.destinationAddress.country,
      weight: params.packages[0]?.weight?.value,
      weightUnit: params.packages[0]?.weight?.unit,
    })
    return (res.rates ?? []).map(transformRate)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new NinjaVanClient(credentials)
    const res = await client.get<NinjaVanTrackingResponse>(`/orders/${trackingNumber}/tracking`)
    return transformTrackingEvents(res)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new NinjaVanClient(credentials)

    const body = {
      serviceType: data.serviceCode,
      from: {
        name: data.originAddress?.name,
        company: data.originAddress?.company,
        address1: data.originAddress?.street1,
        address2: data.originAddress?.street2,
        city: data.originAddress?.city,
        state: data.originAddress?.state,
        postcode: data.originAddress?.postalCode,
        country: data.originAddress?.country,
        phone: data.originAddress?.phone,
        email: data.originAddress?.email,
      },
      to: {
        name: data.destinationAddress?.name,
        company: data.destinationAddress?.company,
        address1: data.destinationAddress?.street1,
        address2: data.destinationAddress?.street2,
        city: data.destinationAddress?.city,
        state: data.destinationAddress?.state,
        postcode: data.destinationAddress?.postalCode,
        country: data.destinationAddress?.country,
        phone: data.destinationAddress?.phone,
        email: data.destinationAddress?.email,
      },
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
    }

    const res = await client.post<NinjaVanShipmentResponse>('/orders', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new NinjaVanClient(credentials)
    await client.delete(`/orders/${id}`)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new NinjaVanClient(credentials)

    const body = {
      service_type: data.requestedServiceCode,
      from: data.originAddress
        ? {
            name: data.originAddress.name,
            phone_number: data.originAddress.phone,
            email: data.originAddress.email,
            address: {
              address1: data.originAddress.street1,
              address2: data.originAddress.street2,
              city: data.originAddress.city,
              state: data.originAddress.state,
              postcode: data.originAddress.postalCode,
              country: data.originAddress.country,
            },
          }
        : undefined,
      to: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            phone_number: data.destinationAddress.phone,
            email: data.destinationAddress.email,
            address: {
              address1: data.destinationAddress.street1,
              address2: data.destinationAddress.street2,
              city: data.destinationAddress.city,
              state: data.destinationAddress.state,
              postcode: data.destinationAddress.postalCode,
              country: data.destinationAddress.country,
            },
          }
        : undefined,
    }

    const res = await client.post<NinjaVanOrderResponse>('/orders', body)
    return transformOrder(res)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new NinjaVanClient(credentials)
    await client.delete(`/orders/${id}`)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  // Ninja Van waybill endpoint: GET /{countryCode}/2.0/reports/waybill
  // Returns PDF; modelled here as a Label with a tracking ID key.

  async getLabel(credentials: Credentials, trackingNumber: string): Promise<Label> {
    const client = new NinjaVanClient(credentials)
    const res = await client.get<NinjaVanWaybillResponse>('/reports/waybill', {
      tracking_number: trackingNumber,
    })
    return transformLabel(res, trackingNumber)
  }
}
