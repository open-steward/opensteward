import axios from 'axios'
import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Carrier } from '../../schema/carrier'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { Track17Client } from './client'
import { MAX_BATCH_SIZE } from './constants'
import {
  transformTrackingEvents,
  transformShipment,
  type Track17TrackItem,
} from './transform/tracking'
import { transformCarrier, type Track17CarrierRaw } from './transform/carrier'
import { verifyWebhook, parseWebhookEvents } from './webhook'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: label    — 17TRACK is a pure parcel-tracking API; it has no label generation endpoints
// Unavailable: manifest — 17TRACK has no manifest/end-of-day concept in its API
// Unavailable: order    — 17TRACK has no order management endpoints
// Unavailable: rate     — 17TRACK has no rate-shopping or rate-quote endpoints
// Unavailable: warehouse — 17TRACK has no warehouse management endpoints

// ── Types ─────────────────────────────────────────────────────────────────────

interface Track17AdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

interface Track17ApiResponse<T> {
  code: number
  data?: {
    accepted?: T[]
    rejected?: Array<{ number: string; error?: { code: number; message?: string } }>
  }
}

// ── Adapter ───────────────────────────────────────────────────────────────────

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class Track17Adapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = '17track'
  readonly version = '1'

  constructor(_config: Track17AdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For 17TRACK the "code" is the API key itself.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * Retrieve full tracking event history for a single tracking number.
   * Uses POST /gettrackinfo (register first to ensure the number is tracked).
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new Track17Client(credentials)

    // Ensure the number is registered (idempotent — error -18019901 means already registered)
    await client
      .post<Track17ApiResponse<Track17TrackItem>>('/register', [
        { number: trackingNumber },
      ])
      .catch(() => undefined)

    const res = await client.post<Track17ApiResponse<Track17TrackItem>>(
      '/gettrackinfo',
      [{ number: trackingNumber }],
    )

    const accepted = res.data?.accepted ?? []
    return accepted.flatMap(transformTrackingEvents)
  }

  /**
   * List recent tracking events across all registered tracking numbers.
   * Uses POST /gettracklist for pagination, then fetches full info.
   */
  async listTrackingEvents(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<TrackingEvent[]> {
    const client = new Track17Client(credentials)

    const extra = params as Record<string, unknown>

    const listRes = await client.post<
      Track17ApiResponse<{ number: string; carrier?: number | null }>
    >('/gettracklist', {
      page_no: extra['page'] ?? 1,
    })

    const listed = listRes.data?.accepted ?? []
    if (listed.length === 0) return []

    // Fetch full track info for the listed numbers (batch capped by API limit)
    const batch = listed.slice(0, MAX_BATCH_SIZE)
    const infoRes = await client.post<Track17ApiResponse<Track17TrackItem>>(
      '/gettrackinfo',
      batch.map((item) => ({ number: item.number, carrier: item.carrier ?? undefined })),
    )

    return (infoRes.data?.accepted ?? []).flatMap(transformTrackingEvents)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  /**
   * List shipments (tracked packages) registered with the account.
   * 17TRACK tracks parcels by tracking number — each becomes a Shipment.
   */
  async listShipments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Shipment[]> {
    const client = new Track17Client(credentials)

    const extra = params as Record<string, unknown>

    const listRes = await client.post<
      Track17ApiResponse<{ number: string; carrier?: number | null }>
    >('/gettracklist', {
      page_no: extra['page'] ?? 1,
    })

    const listed = listRes.data?.accepted ?? []
    if (listed.length === 0) return []

    // Batch capped by API limit
    const batch = listed.slice(0, MAX_BATCH_SIZE)
    const infoRes = await client.post<Track17ApiResponse<Track17TrackItem>>(
      '/gettrackinfo',
      batch.map((item) => ({ number: item.number, carrier: item.carrier ?? undefined })),
    )

    return (infoRes.data?.accepted ?? []).map(transformShipment)
  }

  /**
   * Get a single shipment by tracking number.
   */
  async getShipment(credentials: Credentials, trackingNumber: string): Promise<Shipment> {
    const client = new Track17Client(credentials)

    const res = await client.post<Track17ApiResponse<Track17TrackItem>>(
      '/gettrackinfo',
      [{ number: trackingNumber }],
    )

    const items = res.data?.accepted ?? []
    if (items.length === 0) {
      throw new Error(`17TRACK: no tracking info found for ${trackingNumber}`)
    }

    return transformShipment(items[0]!)
  }

  /**
   * Register a new tracking number for monitoring.
   * Maps Shipment.trackingNumber as the number to register.
   */
  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    if (!data.trackingNumber) {
      throw new Error('17TRACK: trackingNumber is required to register a shipment')
    }

    const client = new Track17Client(credentials)

    await client.post<Track17ApiResponse<Track17TrackItem>>('/register', [
      {
        number: data.trackingNumber,
        carrier: data.carrierId ? parseInt(data.carrierId, 10) || undefined : undefined,
        order_no: data.reference ?? undefined,
      },
    ])

    // Return the current tracking state
    return this.getShipment(credentials, data.trackingNumber)
  }

  /**
   * Stop tracking a shipment (halt automatic monitoring).
   */
  async cancelShipment(credentials: Credentials, trackingNumber: string): Promise<void> {
    const client = new Track17Client(credentials)
    await client.post<Track17ApiResponse<Track17TrackItem>>('/stoptrack', [
      { number: trackingNumber },
    ])
  }

  // ── Carriers ────────────────────────────────────────────────────────────────

  /**
   * List all carriers supported by 17TRACK.
   * Data is sourced from the publicly documented static JSON:
   * https://res.17track.net/asset/carrier/info/apicarrier.all.json
   */
  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    const { data } = await axios.get<Track17CarrierRaw[]>(
      'https://res.17track.net/asset/carrier/info/apicarrier.all.json',
    )
    return data.map(transformCarrier)
  }

  /**
   * Get a single carrier by its numeric key (as a string id).
   */
  async getCarrier(_credentials: Credentials, id: string): Promise<Carrier> {
    const carriers = await this.listCarriers(_credentials, {})
    const found = carriers.find((c) => c.id === id)
    if (!found) {
      throw new Error(`17TRACK: carrier ${id} not found`)
    }
    return found
  }
}
