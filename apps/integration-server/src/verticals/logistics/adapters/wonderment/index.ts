// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   shipment, trackingevent
// Unavailable: carrier   — Wonderment's public API has no carrier management endpoints
// Unavailable: label     — Wonderment does not generate or manage shipping labels
// Unavailable: manifest  — Wonderment has no manifest/end-of-day close-out endpoint
// Unavailable: order     — Wonderment ingests orders from external platforms; no order CRUD API
// Unavailable: rate      — No rate-shopping endpoint; delivery-promise predictions ≠ carrier rates
// Unavailable: warehouse — Wonderment has no warehouse management API endpoint

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Shipment } from '../../schema/shipment'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { WondermentClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformShipmentToTrackingEvents,
  type WondermentShipment,
} from './transform/tracking'
import { transformShipment } from './transform/shipment'

interface WondermentAdapterConfig {
  // Reserved for future config options (e.g. custom base URL overrides).
  [key: string]: unknown
}

interface WondermentSearchResponse {
  shipments?: WondermentShipment[]
  [key: string]: unknown
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class WondermentAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'wonderment'
  readonly version = '1'

  constructor(_config: WondermentAdapterConfig = {}) {}

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

  // ── Shipments ──────────────────────────────────────────────────────────────

  /**
   * Search shipments by order ID or tracking number.
   * Wonderment's primary endpoint: GET /shipments/search/{searchTerm}
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new WondermentClient(credentials)
    const searchTerm = (params as Record<string, unknown>).searchTerm as string | undefined
    if (!searchTerm) return []
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<WondermentSearchResponse>(
      `shipments/search/${encodeURIComponent(searchTerm)}`,
      { limit },
    )
    return (res.shipments ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new WondermentClient(credentials)
    const res = await client.get<WondermentSearchResponse>(
      `shipments/search/${encodeURIComponent(id)}`,
    )
    const shipment = (res.shipments ?? [])[0]
    if (!shipment) throw new Error(`Wonderment: shipment not found for id: ${id}`)
    return transformShipment(shipment)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * Look up all tracking events for a single tracking number or order ID.
   */
  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new WondermentClient(credentials)
    const res = await client.get<WondermentSearchResponse>(
      `shipments/search/${encodeURIComponent(trackingNumber)}`,
    )
    return (res.shipments ?? []).flatMap(transformShipmentToTrackingEvents)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new WondermentClient(credentials)
    const searchTerm = (params as Record<string, unknown>).searchTerm as string | undefined
    if (!searchTerm) return []
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<WondermentSearchResponse>(
      `shipments/search/${encodeURIComponent(searchTerm)}`,
      { limit },
    )
    return (res.shipments ?? []).flatMap(transformShipmentToTrackingEvents)
  }
}
