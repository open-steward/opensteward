import { pageLocally, simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Carrier } from '../../schema/carrier'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { SinayTrackingClient, SinayMgmtClient } from './client'
import {
  transformShipment,
  transformSearchResult,
  type SinayShipmentResponse,
  type SinaySearchResponse,
} from './transform/shipment'
import { transformTracking } from './transform/tracking'
import { transformCarrier, type SinalySealine } from './transform/carrier'
import { parseWebhookEvents } from './webhook'

interface SinayAdapterConfig {
  sandbox?: boolean
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: label     — Sinay is a maritime container-tracking platform only; no label generation API exists
// Unavailable: manifest  — no manifest concept or endpoint in the Sinay/SafeCube API
// Unavailable: order     — no order management concept or endpoint in the Sinay/SafeCube API
// Unavailable: rate      — no freight-rate quoting concept or endpoint in the Sinay/SafeCube API
// Unavailable: warehouse — no warehouse concept or endpoint in the Sinay/SafeCube API

/**
 * OpenSteward logistics adapter for Sinay (SafeCube).
 *
 * Sinay is a maritime container-tracking platform that provides:
 *   - Real-time container / shipment tracking via GET /shipment
 *   - Supported sealine listing via GET /sealines (mapped to Carrier)
 *   - Shipment portfolio management via POST /public/shipments
 *   - Webhook event delivery powered by Svix
 *
 * Auth: direct API key — no OAuth flow required.
 *
 * Docs: https://documentation.safecube.ai/
 */
export class SinayAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'sinay'
  readonly version = '1'

  constructor(_config: SinayAdapterConfig = {}) {}

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

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }

  // ─── Shipments ────────────────────────────────────────────────────────────

  /**
   * Retrieve full detail for a single shipment / container number.
   * Accepts container numbers (CT), booking numbers (BK), or bill-of-lading
   * numbers (BL) as the `id` argument.
   */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new SinayTrackingClient(credentials)
    const raw = await client.get<SinayShipmentResponse>('shipment', {
      shipmentNumber: id,
    })
    return transformShipment(raw)
  }

  /**
   * Search the caller's tracked-shipment portfolio.
   * `params.ids` — optional array of shipment numbers to filter by.
   * If omitted, all tracked shipments are returned (subject to API limits).
   *
   * Paging: the documented request body has one key, `shipmentNumbers`, and
   * the response is `{ results, notFoundResults }` with no page, limit or
   * next signal. One response is the whole collection, so it is paged locally.
   * https://documentation.safecube.ai/reference/post_public-shipments-search.md
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const mgmt = new SinayMgmtClient(credentials)

    const ids: string[] = Array.isArray(params['ids'])
      ? (params['ids'] as string[])
      : params['id']
        ? [String(params['id'])]
        : []

    if (ids.length > 0) {
      // Targeted search
      const raw = await mgmt.post<SinaySearchResponse>('public/shipments/search', {
        shipmentNumbers: ids,
      })
      return pageLocally(
        (raw?.results ?? []).map((r) => transformSearchResult(r)),
        params,
      )
    }

    // Broad search — use an empty body to retrieve all tracked shipments
    const raw = await mgmt.post<SinaySearchResponse>('public/shipments/search', {
      shipmentNumbers: [],
    })
    return pageLocally(
      (raw?.results ?? []).map((r) => transformSearchResult(r)),
      params,
    )
  }

  /**
   * Register one or more containers / shipments for tracking in the caller's
   * Sinay portfolio.  The `data.trackingNumber` field carries the shipment
   * number (CT, BL, or BK).
   *
   * The Sinay API accepts the creation request asynchronously (HTTP 202) and
   * notifies via webhook once initial data is available.  We return a stub
   * Shipment immediately.
   */
  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const mgmt = new SinayMgmtClient(credentials)
    const shipmentNumber = data.trackingNumber ?? data.id ?? data.ocean?.containerNumber
    await mgmt.post<unknown>('public/shipments', {
      shipments: [{ shipmentNumber }],
    })
    // Return a stub — full data arrives asynchronously via webhook
    return {
      id: shipmentNumber,
      trackingNumber: shipmentNumber,
      carrierId: 'sinay',
      status: 'PENDING',
      mode: 'ocean',
      metadata: data as Record<string, unknown>,
    }
  }

  /**
   * Remove a shipment from the caller's Sinay tracking portfolio.
   */
  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const mgmt = new SinayMgmtClient(credentials)
    await mgmt.delete<unknown>('public/shipments', {
      shipmentNumbers: [id],
    })
  }

  // ─── Carriers ─────────────────────────────────────────────────────────────

  /**
   * Return all sealines supported by the Sinay tracking network.
   * Each sealine is mapped to a canonical Carrier record.
   * Endpoint: GET /sealines (container-tracking/api/v2/sealines)
   */
  async listCarriers(credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    const client = new SinayTrackingClient(credentials)
    const raw = await client.get<SinalySealine[]>('sealines')
    return (raw ?? []).map((r) => transformCarrier(r))
  }

  // ─── Tracking Events ─────────────────────────────────────────────────────

  /**
   * Return all tracking events for a shipment / container number.
   */
  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new SinayTrackingClient(credentials)
    const raw = await client.get<SinayShipmentResponse>('shipment', {
      shipmentNumber: trackingNumber,
    })
    return transformTracking(raw)
  }

  /**
   * List tracking events for multiple shipments.
   * Accepts `params.ids` array of shipment numbers; falls back to a single
   * `params.id` string if present.
   */
  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const ids: string[] = Array.isArray(params['ids'])
      ? (params['ids'] as string[])
      : params['id']
        ? [String(params['id'])]
        : []

    if (ids.length === 0) return []

    const client = new SinayTrackingClient(credentials)
    const results = await Promise.all(
      ids.map(async (id) => {
        const raw = await client.get<SinayShipmentResponse>('shipment', {
          shipmentNumber: id,
        })
        return transformTracking(raw)
      }),
    )
    return results.flat()
  }
}
