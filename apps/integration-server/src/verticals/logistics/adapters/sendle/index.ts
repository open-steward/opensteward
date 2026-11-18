// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   label, rate, shipment, trackingevent
// Unavailable: carrier   — Sendle is itself the single carrier; no carrier-listing endpoint exists
// Unavailable: manifest  — POST /manifests and GET /manifests are documented but response field
//                          names are not accessible from public static docs (interactive-only
//                          examples); cannot confirm exact schema without fabrication risk
// Unavailable: order     — Sendle shipping orders are already mapped to Shipment; Sendle has no
//                          OMS-style order concept (no line items, customer IDs, or amounts)
// Unavailable: warehouse — Sendle has no warehouse management API

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
import { SendleClient } from './client'
import { SENDLE_API_BASE, SENDLE_SANDBOX_API_BASE } from './constants'

import { transformShipment, type SendleOrder } from './transform/shipment'
import { transformTracking, type SendleTracking } from './transform/tracking'
import { transformRate, type SendleProduct } from './transform/rate'
import { transformLabels } from './transform/label'

interface SendleAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SendleAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'sendle'
  readonly version = '1'
  private baseURL: string

  constructor(config: SendleAdapterConfig = {}) {
    this.baseURL = config.sandbox ? SENDLE_SANDBOX_API_BASE : SENDLE_API_BASE
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Sendle the "code" is the "sendle_id:api_key" pair.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments (Sendle "orders" map to canonical Shipments) ─────────────────

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new SendleClient(credentials, this.baseURL)
    const raw = await client.get<SendleOrder>(`orders/${id}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new SendleClient(credentials, this.baseURL)
    const raw = await client.post<SendleOrder>('orders', {
      description: data.reference ?? 'Shipment',
      customer_reference: data.reference,
      weight: data.totalWeight
        ? { value: data.totalWeight.value, units: data.totalWeight.unit }
        : undefined,
      dimensions: data.dimensions
        ? {
            length: data.dimensions.length,
            width: data.dimensions.width,
            height: data.dimensions.height,
            units: data.dimensions.unit,
          }
        : undefined,
      sender: data.originAddress
        ? {
            contact: {
              name: data.originAddress.name,
              phone: data.originAddress.phone,
              email: data.originAddress.email,
              company: data.originAddress.company,
            },
            address: {
              address_line1: data.originAddress.street1,
              address_line2: data.originAddress.street2,
              suburb: data.originAddress.city,
              state_name: data.originAddress.state,
              postcode: data.originAddress.postalCode,
              country: data.originAddress.country,
            },
          }
        : undefined,
      receiver: data.destinationAddress
        ? {
            contact: {
              name: data.destinationAddress.name,
              phone: data.destinationAddress.phone,
              email: data.destinationAddress.email,
              company: data.destinationAddress.company,
            },
            address: {
              address_line1: data.destinationAddress.street1,
              address_line2: data.destinationAddress.street2,
              suburb: data.destinationAddress.city,
              state_name: data.destinationAddress.state,
              postcode: data.destinationAddress.postalCode,
              country: data.destinationAddress.country,
            },
          }
        : undefined,
      metadata: data.metadata,
    })
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new SendleClient(credentials, this.baseURL)
    await client.delete(`orders/${id}`)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new SendleClient(credentials, this.baseURL)
    const raw = await client.get<SendleTracking>(`tracking/${trackingNumber}`)
    return transformTracking(raw, trackingNumber)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new SendleClient(credentials, this.baseURL)
    const pkg = params.packages[0]
    const res = await client.get<SendleProduct[]>('products', {
      sender_suburb: params.originAddress.city,
      sender_postcode: params.originAddress.postalCode,
      sender_country: params.originAddress.country,
      receiver_suburb: params.destinationAddress.city,
      receiver_postcode: params.destinationAddress.postalCode,
      receiver_country: params.destinationAddress.country,
      weight_value: pkg?.weight?.value,
      weight_units: pkg?.weight?.unit ?? 'kg',
    })
    return (res ?? []).map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new SendleClient(credentials, this.baseURL)
    const raw = await client.get<SendleOrder>(`orders/${id}`)
    const labels = transformLabels(raw)
    if (labels.length === 0) {
      throw new Error(`No labels found on order ${id}`)
    }
    return labels[0]
  }
}
