// ── Resource coverage ──────────────────────────────────────────────
// Available:   shipment      — /packages endpoint maps to Shipment (list/get/create)
// Available:   trackingevent — /packages endpoint maps to TrackingEvent
// Unavailable: carrier       — carrier-agnostic locker platform; no carrier management API
// Unavailable: label         — locker operator, not a label provider; labels come from originating carrier
// Unavailable: manifest      — no manifest concept in a locker management system
// Unavailable: order         — no order management; platform tracks parcels in lockers, not orders
// Unavailable: rate          — locker platform does not quote shipping rates
// Unavailable: warehouse     — smart locker installations ≠ warehouses; no warehouse resource in API

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { QuadientClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { transformPackage, type QuadientPackage } from './transform/tracking'

interface QuadientAdapterConfig { sandbox?: boolean }
const SIMPLE_API_KEY_FORM = simpleApiKey()

interface QuadientPackagesResponse {
  packages?: QuadientPackage[]
  data?: QuadientPackage[]
  [key: string]: unknown
}

function extractPackages(res: QuadientPackagesResponse): QuadientPackage[] {
  return res.packages ?? res.data ?? []
}

export class QuadientAdapter implements LogisticsAdapter {
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'quadient'
  readonly version = '1'

  constructor(_config: QuadientAdapterConfig = {}) {}

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

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(
    _payload: Buffer,
    _headers: Record<string, string>,
    _secret: string,
  ): boolean {
    return false
  }

  // ── Shipments (packages) ───────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new QuadientClient(credentials)
    const res = await client.get<QuadientPackagesResponse>('/packages', {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    })
    return extractPackages(res).map((pkg) => {
      const event = transformPackage(pkg)
      return {
        id: pkg.packageId,
        trackingNumber: event.trackingNumber,
        carrierId: event.carrierId,
        status: 'UNKNOWN' as const,
        createdAt: event.createdAt,
        metadata: pkg as Record<string, unknown>,
      }
    })
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new QuadientClient(credentials)
    const raw = await client.get<QuadientPackage>(`/packages/${encodeURIComponent(id)}`)
    const event = transformPackage(raw)
    return {
      id: raw.packageId,
      trackingNumber: event.trackingNumber,
      carrierId: event.carrierId,
      status: 'UNKNOWN' as const,
      createdAt: event.createdAt,
      metadata: raw as Record<string, unknown>,
    }
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new QuadientClient(credentials)
    const raw = await client.post<QuadientPackage>('/packages', {
      trackingNumber: data.trackingNumber,
      carrier: data.carrierId,
      recipientEmail: data.destinationAddress?.email,
    })
    return {
      id: raw.packageId,
      trackingNumber: raw.trackingNumber ?? undefined,
      carrierId: raw.carrier ?? undefined,
      status: 'PENDING' as const,
      metadata: raw as Record<string, unknown>,
    }
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new QuadientClient(credentials)
    const res = await client.get<QuadientPackagesResponse>('/packages', {
      tracking_number: trackingNumber,
    })
    return extractPackages(res).map(transformPackage)
  }
}
