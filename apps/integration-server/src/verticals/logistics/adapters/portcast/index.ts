// ── Resource coverage ──────────────────────────────────────────────
// Available:   trackingevent, shipment
// Unverified:  carrier — docs reference a supported-carrier SCAC list but the exact REST
//              endpoint path and response schema are behind authentication on Stoplight;
//              cannot confirm field names without access.
// Unavailable: label    — visibility-only platform; does not generate shipping labels
// Unavailable: manifest — no manifest creation or submission concept
// Unavailable: order    — not an order-management system; no order endpoints
// Unavailable: rate     — does not provide freight rate shopping or quote endpoints
// Unavailable: warehouse — no warehouse management concept or endpoints

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Shipment } from '../../schema/shipment'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { PortcastClient } from './client'
import {
  transformTracking,
  transformShipment,
  type PortcastContainer,
  type PortcastListResponse,
} from './transform/tracking'

interface PortcastAdapterConfig {
  sandbox?: boolean
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class PortcastAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'portcast'
  readonly version = '1'

  constructor(_config: PortcastAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  /**
   * Fetch tracking events for a specific container number.
   * Calls GET /containers/{containerNumber} and maps each milestone event.
   */
  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new PortcastClient(credentials)
    const raw = await client.get<PortcastContainer>(`containers/${trackingNumber}`)
    return transformTracking(raw)
  }

  /**
   * List tracking events across all tracked containers.
   * Calls GET /containers with pagination params.
   */
  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new PortcastClient(credentials)
    const raw = await client.get<PortcastListResponse>('containers', params)
    const list = raw.data ?? []
    return list.flatMap((r) => transformTracking(r))
  }

  /**
   * Retrieve a single container/shipment by container number or internal ID.
   * Calls GET /containers/{id} and maps to the canonical Shipment shape.
   */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new PortcastClient(credentials)
    const raw = await client.get<PortcastContainer>(`containers/${id}`)
    return transformShipment(raw)
  }

  /**
   * List all tracked container shipments for the organisation.
   * Calls GET /containers with optional pagination/filter params.
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new PortcastClient(credentials)
    const raw = await client.get<PortcastListResponse>('containers', params)
    const list = raw.data ?? []
    return list.map((r) => transformShipment(r))
  }

  /**
   * Portcast does not publish a webhook signature scheme.
   * Always return false so invalid/unsigned payloads are rejected.
   */
  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return false
  }
}
