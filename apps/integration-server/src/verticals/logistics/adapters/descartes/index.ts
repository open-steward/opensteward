// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   trackingevent — logistics/v1/tracking/{trackingNumber}
// Available:   shipment      — logistics/v1/shipments (list + get)
// Unverified:  carrier       — Descartes API portal requires authentication; no public endpoint confirmed
// Unverified:  label         — Descartes API portal requires authentication; no public endpoint confirmed
// Unverified:  manifest      — Descartes API portal requires authentication; no public endpoint confirmed
// Unverified:  order         — Descartes API portal requires authentication; no public endpoint confirmed
// Unverified:  rate          — Descartes API portal requires authentication; no public endpoint confirmed
// Unverified:  warehouse     — Descartes API portal requires authentication; no public endpoint confirmed

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Shipment } from '../../schema/shipment'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { DescartesClient } from './client'
import { transformTrackingEvents, type DescartesTrackingResponse } from './transform/tracking'
import { toISODate } from '../shared/transform'

const SIMPLE_API_KEY_FORM = simpleApiKey()

interface DescartesShipmentResponse {
  id?: string | null
  trackingNumber?: string | null
  status?: string | null
  serviceType?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  originAddress?: Record<string, unknown> | null
  destinationAddress?: Record<string, unknown> | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): Shipment['status'] {
  if (!status) return 'UNKNOWN'
  const s = status.toUpperCase()
  if (s === 'PENDING' || s === 'CREATED') return 'PENDING'
  if (s === 'LABEL_CREATED') return 'LABEL_CREATED'
  if (s === 'IN_TRANSIT' || s === 'PICKED_UP') return 'IN_TRANSIT'
  if (s === 'OUT_FOR_DELIVERY') return 'OUT_FOR_DELIVERY'
  if (s === 'DELIVERED') return 'DELIVERED'
  if (s === 'EXCEPTION' || s === 'FAILED') return 'EXCEPTION'
  if (s === 'RETURNED') return 'RETURNED'
  if (s === 'CANCELLED') return 'CANCELLED'
  return 'UNKNOWN'
}

function transformShipment(raw: DescartesShipmentResponse): Shipment {
  return {
    id: raw.id ?? undefined,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: 'descartes',
    serviceCode: raw.serviceType ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}

export class DescartesAdapter implements LogisticsAdapter {
  readonly platform = 'descartes'
  readonly version = '1'

  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

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

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new DescartesClient(credentials)
    const raw = await client.get<DescartesTrackingResponse>(
      `logistics/v1/tracking/${trackingNumber}`,
    )
    return transformTrackingEvents(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new DescartesClient(credentials)
    const res = await client.get<{ shipments?: DescartesShipmentResponse[] }>(
      'logistics/v1/shipments',
      {
        page: params.page,
        limit: params.limit,
        ...(params.filter ?? {}),
      },
    )
    return (res.shipments ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new DescartesClient(credentials)
    const raw = await client.get<DescartesShipmentResponse>(`logistics/v1/shipments/${id}`)
    return transformShipment(raw)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    // Descartes does not document a public HMAC webhook signature scheme.
    // Return false until a real verification implementation is available.
    return false
  }
}
