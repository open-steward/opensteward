// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: manifest — GoSend is an on-demand courier with no manifest concept
// Unavailable: warehouse — GoSend is an on-demand courier with no warehouse concept
// Unverified:  order — booking/order list endpoint not confirmed from public docs (NDA-gated API)

import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Carrier } from '../../schema/carrier'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh, type GojekSendAdapterAuthConfig } from './auth'
import { GojekSendClient } from './client'

import { transformTracking, type GojekSendTrackingResponse } from './transform/tracking'
import { transformShipment, type GojekSendShipmentRaw } from './transform/shipment'
import { getGojekSendCarrier } from './transform/carrier'
import { transformLabelFromShipment } from './transform/label'

interface GojekSendAdapterConfig { clientId?: string; clientSecret?: string; sandbox?: boolean }

export class GojekSendAdapter implements LogisticsAdapter {
  readonly platform = 'gojek-send'
  readonly version = '1'

  private authConfig: GojekSendAdapterAuthConfig
  constructor(config: GojekSendAdapterConfig = {}) {
    this.authConfig = { clientId: config.clientId ?? '', clientSecret: config.clientSecret ?? '' }
    void config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCredentials({ clientId: this.authConfig.clientId, clientSecret: this.authConfig.clientSecret })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new GojekSendClient(credentials)
    const raw = await client.get<GojekSendTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking({ ...raw, tracking_number: raw.tracking_number ?? trackingNumber })
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new GojekSendClient(credentials)
    const raw = await client.post<GojekSendShipmentRaw>('shipments', {
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

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(_credentials: Credentials): Promise<Carrier[]> {
    return [getGojekSendCarrier()]
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    return getGojekSendCarrier()
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  // GoSend has no dedicated /labels endpoint; label data is embedded in the
  // shipment response via label_url. Label is derived from the shipment.

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new GojekSendClient(credentials)
    const raw = await client.get<GojekSendShipmentRaw>(`shipments/${id}`)
    return transformLabelFromShipment(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new GojekSendClient(credentials)
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
      carrierId: 'gojek-send',
      serviceCode: (r.service_code as string | undefined) ?? (r.code as string | undefined),
      serviceName: (r.service_name as string | undefined) ?? (r.name as string | undefined),
      currency: (r.currency as string | undefined) ?? 'USD',
      totalAmount: typeof r.total === 'number' ? r.total : typeof r.amount === 'number' ? r.amount : undefined,
      transitDays: typeof r.transit_days === 'number' ? r.transit_days : undefined,
      metadata: r as Record<string, unknown>,
    }))
  }
}
