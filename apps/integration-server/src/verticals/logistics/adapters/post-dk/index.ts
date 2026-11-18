// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — PostNord DK is a single-carrier service; no endpoint returns carrier records
// Unavailable: manifest  — No manifest/pickup-sheet endpoint in the PostNord DK REST API
// Unavailable: order     — PostNord DK is a carrier, not a WMS/OMS; no order management API
// Unavailable: rate      — PostNord DK has no native rate/pricing API (confirmed by Cargoson integration docs)
// Unavailable: warehouse — No warehouse management endpoint in the PostNord DK REST API
// Derived:     label     — Label URL is embedded in the booking (shipment) response via label_url

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { PostDkClient } from './client'

import { transformTracking, type PostDkTrackingResponse } from './transform/tracking'
import { transformShipment, type PostDkShipment } from './transform/shipment'
import { transformLabel } from './transform/label'

interface PostDkAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class PostDkAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'post-dk'
  readonly version = '1'

  constructor(_config: PostDkAdapterConfig = {}) {}

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
    const client = new PostDkClient(credentials)
    const raw = await client.get<PostDkTrackingResponse>(
      'trackandtrace/findByIdentifier.json',
      { id: trackingNumber },
    )
    return transformTracking(raw)
  }

  // ── Labels ────────────────────────────────────────────────────────────────
  // PostNord DK embeds the label URL in the booking response; there is no
  // dedicated label endpoint.  We retrieve the shipment and extract the label.

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new PostDkClient(credentials)
    const raw = await client.get<PostDkShipment>(`booking/shipments/${id}`)
    const label = transformLabel(raw)
    if (!label) throw new Error(`No label URL returned by PostNord DK for shipment ${id}`)
    return label
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new PostDkClient(credentials)
    const raw = await client.post<PostDkShipment>('booking/shipments', {
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            street1: data.originAddress.street1,
            street2: data.originAddress.street2,
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
            street1: data.destinationAddress.street1,
            street2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
      reference: data.reference,
      service_code: data.serviceCode,
    })
    return transformShipment(raw)
  }
}
