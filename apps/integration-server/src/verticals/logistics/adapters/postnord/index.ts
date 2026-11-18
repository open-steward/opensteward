// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: order    — PostNord is a carrier, not an OMS; no order management API exists
// Unavailable: manifest — No manifest submission API in PostNord's public REST API
// Unavailable: warehouse — No warehouse management API; service points are pickup locations only
// Unverified:  rate     — Pricing endpoint confirmed on Norway portal (POST /rest/transport-booking/v2/booking/products) but request/response schema for main api2.postnord.com base URL is behind login and not publicly documented

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Carrier } from '../../schema/carrier'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { PostNordClient } from './client'

import { transformTracking, type PostNordTrackingResponse } from './transform/tracking'
import { transformShipment, type PostNordShipment } from './transform/shipment'
import { transformCarrier } from './transform/carrier'
import { transformLabel } from './transform/label'

interface PostNordAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class PostNordAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'postnord'
  readonly version = '1'

  constructor(_config: PostNordAdapterConfig = {}) {}

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
    const client = new PostNordClient(credentials)
    const raw = await client.get<PostNordTrackingResponse>(
      'shipment/v5/trackandtrace/findByIdentifier.json',
      { id: trackingNumber },
    )
    return transformTracking(raw)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────
  // PostNord is the single carrier. No /carriers endpoint exists in their API;
  // we return the static platform identity derived from known constants.

  async listCarriers(_credentials: Credentials, _params: unknown): Promise<Carrier[]> {
    return [transformCarrier()]
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    return transformCarrier()
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  // PostNord embeds label URLs in shipment booking responses. There is no
  // standalone label list/get/void endpoint. We create a label by booking a
  // shipment and extracting the labelUrl from the response.

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new PostNordClient(credentials)
    const raw = await client.post<PostNordShipment>('shipment/v1/shipments', {
      reference: data.shipmentId,
      serviceCode: data.serviceCode,
    })
    const label = transformLabel(raw)
    if (!label) throw new Error('PostNord booking response did not include a labelUrl')
    return label
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new PostNordClient(credentials)
    const raw = await client.post<PostNordShipment>('shipment/v1/shipments', {
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            street1: data.originAddress.street1,
            street2: data.originAddress.street2,
            city: data.originAddress.city,
            postalCode: data.originAddress.postalCode,
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
            postalCode: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
      reference: data.reference,
      serviceCode: data.serviceCode,
    })
    return transformShipment(raw)
  }
}
