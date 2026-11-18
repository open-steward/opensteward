// ── Resource coverage ──────────────────────────────────────────────
// Available:   shipment — /loads + /loads/:id
// Available:   trackingevent — /loads/:id/tracking
// Unverified:  carrier — platform has a truck/carrier search feature but developer portal requires auth; endpoint path unconfirmed
// Unverified:  rate — platform documents a "Rate Check" feature but developer portal requires auth; endpoint path unconfirmed
// Unavailable: order — freight-matching load board; no order management concept separate from loads/shipments
// Unavailable: label — freight-matching marketplace; does not generate shipping labels
// Unavailable: manifest — freight-matching marketplace; no manifest or pickup-closeout concept
// Unavailable: warehouse — freight-matching marketplace; no warehouse management concept

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { LoadboardClient } from './client'
import { transformTrackingEvents, type LoadboardLoad } from './transform/tracking'
import { LOAD_STATUS_MAP } from './constants'
import type { ShipmentStatus } from '../../schema/shipment'

const SIMPLE_API_KEY_FORM = simpleApiKey()

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  return (LOAD_STATUS_MAP[status.toUpperCase()] as ShipmentStatus) ?? 'UNKNOWN'
}

function transformLoad(raw: LoadboardLoad): Shipment {
  return {
    id: raw.loadId ?? undefined,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.loadId ?? raw.referenceNumber ?? undefined,
    carrierId: '123loadboard',
    serviceCode: 'ftl',
    originAddress: raw.origin
      ? {
          city: raw.origin.city ?? undefined,
          state: raw.origin.state ?? undefined,
          postalCode: raw.origin.postalCode ?? undefined,
          country: raw.origin.country ?? 'US',
        }
      : undefined,
    destinationAddress: raw.destination
      ? {
          city: raw.destination.city ?? undefined,
          state: raw.destination.state ?? undefined,
          postalCode: raw.destination.postalCode ?? undefined,
          country: raw.destination.country ?? 'US',
        }
      : undefined,
    estimatedDeliveryAt: raw.deliveryDate ? new Date(raw.deliveryDate) : undefined,
    reference: raw.referenceNumber ?? undefined,
    mode: 'ftl',
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export interface LoadboardAdapterConfig {
  sandbox?: boolean
}

export class _123LoadboardAdapter implements LogisticsAdapter {
  readonly platform = '123loadboard'
  readonly version = '1'

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  constructor(_config: LoadboardAdapterConfig = {}) {}

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

  // ── Shipments (Loads) ──────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new LoadboardClient(credentials)
    const res = await client.get<{ loads?: LoadboardLoad[]; data?: LoadboardLoad[] }>(
      '/loads',
      {
        page: params.page ?? 1,
        limit: params.limit ?? 50,
        ...(params.filter ? { status: params.filter } : {}),
      },
    )
    const items = res.loads ?? res.data ?? []
    return items.map(transformLoad)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new LoadboardClient(credentials)
    const raw = await client.get<LoadboardLoad>(`/loads/${encodeURIComponent(id)}`)
    return transformLoad(raw)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new LoadboardClient(credentials)
    const raw = await client.get<LoadboardLoad>(
      `/loads/${encodeURIComponent(trackingNumber)}/tracking`,
    )
    return transformTrackingEvents(raw)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return false
  }
}
