// ── Resource coverage ──────────────────────────────────────────────
// Available:   carrier, shipment, trackingevent
// Unavailable: label     — Vizion is a container-tracking-only API; no label endpoints
// Unavailable: manifest  — Vizion is a container-tracking-only API; no manifest endpoints
// Unavailable: order     — Vizion is a container-tracking-only API; no order management endpoints
// Unavailable: rate      — Vizion is a container-tracking-only API; no rate-quoting endpoints
// Unavailable: warehouse — Vizion is a container-tracking-only API; no warehouse management endpoints

import { pageLocally, simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Carrier } from '../../schema/carrier'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { VizionApiClient } from './client'
import {
  transformReferenceToShipment,
  transformUpdateToShipment,
  type VizionReference,
  type VizionUpdateEvent,
} from './transform/shipment'
import { transformUpdateToTrackingEvents } from './transform/tracking'
import { transformCarrier, type VizionCarrier } from './transform/carrier'
import { verifyWebhook, parseWebhookEvents } from './webhook'

interface VizionApiAdapterConfig {
  sandbox?: boolean
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class VizionApiAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'vizion-api'
  readonly version = '1'

  constructor(_config: VizionApiAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ─── Webhook ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }

  // ─── Shipments ────────────────────────────────────────────────────────────

  /**
   * List all active tracking references (shipments).
   * GET /references returns an array of reference objects.
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new VizionApiClient(credentials)
    const raw = await client.get<VizionReference[] | { data: VizionReference[] }>('/references', params)
    const list: VizionReference[] = Array.isArray(raw) ? raw : (raw.data ?? [])
    return list.map((r) => transformReferenceToShipment(r))
  }

  /**
   * Get a specific reference and its latest update.
   * GET /references/{reference_id} returns the reference; we also fetch
   * /references/{reference_id}/updates to get the latest payload.
   */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new VizionApiClient(credentials)

    // Try to get the latest update (which has the full payload with milestones)
    const updatesRaw = await client.get<VizionUpdateEvent[] | { data: VizionUpdateEvent[] }>(
      `/references/${id}/updates`,
    )
    const updates: VizionUpdateEvent[] = Array.isArray(updatesRaw)
      ? updatesRaw
      : (updatesRaw.data ?? [])

    if (updates.length > 0) {
      const latest = updates[updates.length - 1]
      if (latest) return transformUpdateToShipment(latest)
    }

    // Fall back to the reference object if no updates
    const ref = await client.get<VizionReference>(`/references/${id}`)
    return transformReferenceToShipment(ref)
  }

  // ─── Tracking Events ──────────────────────────────────────────────────────

  /**
   * Get all tracking milestones for a reference.
   * GET /references/{reference_id}/updates returns all update events.
   */
  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new VizionApiClient(credentials)
    const raw = await client.get<VizionUpdateEvent[] | { data: VizionUpdateEvent[] }>(
      `/references/${trackingNumber}/updates`,
    )
    const updates: VizionUpdateEvent[] = Array.isArray(raw) ? raw : (raw.data ?? [])
    return updates.flatMap((u) => transformUpdateToTrackingEvents(u))
  }

  /**
   * List tracking events across all active references.
   */
  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new VizionApiClient(credentials)
    const raw = await client.get<VizionReference[] | { data: VizionReference[] }>('/references', params)
    const refs: VizionReference[] = Array.isArray(raw) ? raw : (raw.data ?? [])

    const results = await Promise.all(
      refs.map(async (ref) => {
        const refId = ref.id
        if (!refId) return []
        const updatesRaw = await client.get<VizionUpdateEvent[] | { data: VizionUpdateEvent[] }>(
          `/references/${refId}/updates`,
        )
        const updates: VizionUpdateEvent[] = Array.isArray(updatesRaw)
          ? updatesRaw
          : (updatesRaw.data ?? [])
        return updates.flatMap((u) => transformUpdateToTrackingEvents(u))
      }),
    )

    return results.flat()
  }

  // ─── Carriers ─────────────────────────────────────────────────────────────

  /**
   * List all supported carriers.
   * GET /carriers takes no parameters and returns every carrier in one bare
   * array ("Get all carriers." — docs.vizionapi.com/reference/carrier_list),
   * so the whole collection is paged locally.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new VizionApiClient(credentials)
    const raw = await client.get<VizionCarrier[] | { data: VizionCarrier[] }>('/carriers')
    const list: VizionCarrier[] = Array.isArray(raw) ? raw : (raw.data ?? [])
    return pageLocally(list.map((c) => transformCarrier(c)), params)
  }

  /**
   * Get a specific carrier by carrier_code.
   */
  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const carriers = await this.listCarriers(credentials, {})
    const found = carriers.find((c) => c.id === id || c.code === id)
    if (!found) throw new Error(`Carrier not found: ${id}`)
    return found
  }
}
