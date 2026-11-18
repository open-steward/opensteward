// ── Resource coverage ──────────────────────────────────────────────
// Unverified: carrier  — LaserShip v2 API docs are behind authentication; no publicly documented /v2/carriers endpoint found.
// Unverified: label    — Label void/reprint exists in v1 API (Pitney Bowes docs), but no /v2/labels endpoint is publicly documented.
// Unverified: manifest — No manifest endpoint found in any public LaserShip API reference; EasyPost notes manifests are not required for OnTrac/LaserShip.
// Unverified: order    — No separate order resource in v2; order placement maps to shipment/package creation (already implemented as createShipment).
// Unverified: rate     — Rating endpoint exists in v1 API (Pitney Bowes docs: POST /api/v1/rates), but no /v2/rates endpoint is publicly documented.
// Unverified: warehouse — No warehouse/facility listing endpoint found in any public LaserShip API reference.

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { LaserShipClient } from './client'

import { transformTracking, type LaserShipTrackingResponse } from './transform/tracking'
import { transformShipment, type LaserShipShipmentResponse } from './transform/shipment'

interface LaserShipAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class LaserShipAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'lasership'
  readonly version = '1'

  constructor(_config: LaserShipAdapterConfig = {}) {}

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
    const client = new LaserShipClient(credentials)
    const raw = await client.get<LaserShipTrackingResponse>(`packages/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new LaserShipClient(credentials)
    const raw = await client.post<LaserShipShipmentResponse>('packages', {
      origin: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            street1: data.originAddress.street1,
            street2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postalCode: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      destination: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            street1: data.destinationAddress.street1,
            street2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postalCode: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      packages: (data.packages ?? []).map((pkg) => ({
        weight: pkg.weight?.value ?? data.totalWeight?.value ?? 1,
        length: pkg.dimensions?.length,
        width: pkg.dimensions?.width,
        height: pkg.dimensions?.height,
      })),
      serviceCode: data.serviceCode,
      reference: data.reference,
    })
    return transformShipment(raw)
  }
}
