import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { SingaporePostClient } from './client'

import { transformTracking, type SingaporePostTrackingResponse } from './transform/tracking'
import { transformShipment, type SingaporePostShipment } from './transform/shipment'
import { transformRate, type SingaporePostRate } from './transform/rate'
import { transformLabel } from './transform/label'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unverified: carrier   — API docs are behind login at developer.singpost.com; no public endpoint confirmed
// Unverified: manifest  — API docs are behind login at developer.singpost.com; no public endpoint confirmed
// Unverified: order     — API docs are behind login at developer.singpost.com; no public endpoint confirmed
// Unverified: warehouse — API docs are behind login at developer.singpost.com; no public endpoint confirmed

interface SingaporePostAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SingaporePostAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'singapore-post'
  readonly version = '1'

  constructor(_config: SingaporePostAdapterConfig = {}) {}

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
    const client = new SingaporePostClient(credentials)
    const raw = await client.get<SingaporePostTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new SingaporePostClient(credentials)
    const raw = await client.post<SingaporePostShipment>('shipments', {
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address_line1: data.originAddress.street1,
            address_line2: data.originAddress.street2,
            city: data.originAddress.city,
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
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight?.value,
      weight_unit: data.totalWeight?.unit ?? 'kg',
      service_code: data.serviceCode,
      reference: data.reference,
    })
    return transformShipment(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new SingaporePostClient(credentials)
    const pkg = params.packages[0]
    const res = await client.post<SingaporePostRate[]>('rates', {
      origin_country: params.originAddress.country,
      origin_postal_code: params.originAddress.postalCode,
      destination_country: params.destinationAddress.country,
      destination_postal_code: params.destinationAddress.postalCode,
      weight: pkg?.weight?.value,
      weight_unit: pkg?.weight?.unit ?? 'kg',
    })
    return (res ?? []).map(transformRate)
  }

  // ── Labels (derived from shipment creation) ────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new SingaporePostClient(credentials)
    const raw = await client.post<SingaporePostShipment>('shipments', {
      service_code: data.serviceCode,
    })
    return transformLabel(raw)
  }
}
