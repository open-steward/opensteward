// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: carrier   — SMSA is itself the single carrier; no carrier-list endpoint exists
// Unavailable: manifest  — No manifest endpoint documented in the SMSA API
// Unavailable: order     — SMSA is a carrier, not an OMS; no order endpoint exists
// Unavailable: warehouse — SMSA is a carrier, not a WMS; no warehouse endpoint exists
// ──────────────────────────────────────────────────────────────────────────

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
import { SmsaClient } from './client'

import { transformTracking, type SmsaTracking } from './transform/tracking'
import { transformShipment, type SmsaShipment } from './transform/shipment'
import { transformRate, type SmsaRate } from './transform/rate'
import { transformLabel, type SmsaLabelSource } from './transform/label'

interface SmsaAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SmsaAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'smsa'
  readonly version = '1'

  constructor(_config: SmsaAdapterConfig = {}) {}

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
    const client = new SmsaClient(credentials)
    const raw = await client.get<SmsaTracking>('shipment', {
      awbno: trackingNumber,
    })
    return transformTracking(raw, trackingNumber)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new SmsaClient(credentials)
    const raw = await client.post<SmsaShipment>('shipment', {
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

  // ── Labels ────────────────────────────────────────────────────────────────
  // Labels are derived from the shipment endpoint (GET shipment?awbno={id}).
  // SMSA returns label_url inline on the shipment record — no separate label
  // resource exists in the API.

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new SmsaClient(credentials)
    const raw = await client.get<SmsaLabelSource>('shipment', { awbno: id })
    return transformLabel(raw)
  }

  // ── Rates ─────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new SmsaClient(credentials)
    const pkg = params.packages[0]
    const res = await client.post<SmsaRate[]>('retprice', {
      origin_city: params.originAddress.city,
      origin_country: params.originAddress.country,
      destination_city: params.destinationAddress.city,
      destination_country: params.destinationAddress.country,
      weight: pkg?.weight?.value,
      weight_unit: pkg?.weight?.unit ?? 'kg',
    })
    return (res ?? []).map(transformRate)
  }
}
