import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { ShippeoClient } from './client'
import {
  transformTrackingEvents,
  type ShippeoTrackingResponse,
} from './transform/tracking'
import {
  transformShipment,
  extractShipments,
  type ShippeoShipmentResponse,
  type ShippeoShipmentsListResponse,
} from './transform/shipment'
import {
  transformTrackingEvent,
  type ShippeoMilestone,
} from './transform/trackingevent'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   shipment, trackingevent
// Unavailable: carrier    — no carrier-directory endpoint; carrier_code is a field on shipment/tracking responses only
// Unavailable: label      — Shippeo does not generate shipping labels; it tracks shipments created elsewhere
// Unavailable: manifest   — no manifest/end-of-day pickup concept; not a transactional shipping system
// Unavailable: order      — no order-management capability; platform is focused exclusively on visibility/tracking
// Unavailable: rate       — no rate-shopping or carrier-pricing; not a rating/quoting system
// Unavailable: warehouse  — no warehouse-management or location-directory endpoints; not a WMS

// ── Adapter config ────────────────────────────────────────────────────────────

export interface ShippeoAdapterConfig {
  clientId?: string
  clientSecret?: string
  sandbox?: boolean
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class ShippeoAdapter implements LogisticsAdapter {
  readonly platform = 'shippeo'
  readonly version = '1'

  private config: ShippeoAdapterConfig

  constructor(config: ShippeoAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('shippeo: clientId and clientSecret are required')
    }
    return exchangeCredentials({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      sandbox: this.config.sandbox,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * Retrieve all milestone tracking events for a given tracking number.
   *
   * GET /shipments/{trackingNumber}/tracking
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new ShippeoClient(credentials)
    const res = await client.get<ShippeoTrackingResponse>(
      `/shipments/${encodeURIComponent(trackingNumber)}/tracking`,
    )
    return transformTrackingEvents(res)
  }

  /**
   * List all tracking-event milestones for a given tracking number.
   *
   * GET /shipments/{trackingNumber}/tracking
   * Callers pass `params.trackingNumber` (or `params.id`) to identify the shipment.
   */
  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const trackingNumber = String(params['trackingNumber'] ?? params['id'] ?? '')
    if (!trackingNumber) return []
    const client = new ShippeoClient(credentials)
    const res = await client.get<ShippeoTrackingResponse>(
      `/shipments/${encodeURIComponent(trackingNumber)}/tracking`,
    )
    const milestones: ShippeoMilestone[] = res.milestones ?? []
    const tn = res.tracking_number ?? res.shipment_id ?? trackingNumber
    const sid = res.shipment_id ?? undefined
    const carrierId = res.carrier_code ?? 'shippeo'
    if (milestones.length > 0) {
      return milestones.map((m) => transformTrackingEvent(m, tn, sid, carrierId))
    }
    // No milestones — return single synthesised event from top-level status.
    return [
      transformTrackingEvent(
        { status: res.status ?? null } as ShippeoMilestone,
        tn,
        sid,
        carrierId,
      ),
    ]
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  /**
   * List shipments with optional pagination.
   *
   * GET /shipments
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new ShippeoClient(credentials)
    const res = await client.get<ShippeoShipmentsListResponse>('/shipments', {
      page: params.page,
      limit: params.limit,
      ...(params.updatedAfter ? { updated_after: params.updatedAfter } : {}),
    })
    return extractShipments(res).map(transformShipment)
  }

  /**
   * Retrieve a single shipment by its Shippeo ID.
   *
   * GET /shipments/{id}
   */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ShippeoClient(credentials)
    const res = await client.get<ShippeoShipmentResponse>(
      `/shipments/${encodeURIComponent(id)}`,
    )
    return transformShipment(res)
  }

  /**
   * Create a new shipment to start tracking.
   *
   * POST /shipments
   */
  async createShipment(
    credentials: Credentials,
    data: Partial<Shipment>,
  ): Promise<Shipment> {
    const client = new ShippeoClient(credentials)

    const body: Record<string, unknown> = {
      tracking_number: data.trackingNumber,
      carrier_code: data.carrierId,
      service_code: data.serviceCode,
      reference: data.reference,
      transport_mode: data.mode?.toUpperCase(),
    }

    if (data.originAddress) {
      body.origin = {
        name: data.originAddress.name,
        company: data.originAddress.company,
        street1: data.originAddress.street1,
        city: data.originAddress.city,
        state: data.originAddress.state,
        postal_code: data.originAddress.postalCode,
        country: data.originAddress.country,
      }
    }

    if (data.destinationAddress) {
      body.destination = {
        name: data.destinationAddress.name,
        company: data.destinationAddress.company,
        street1: data.destinationAddress.street1,
        city: data.destinationAddress.city,
        state: data.destinationAddress.state,
        postal_code: data.destinationAddress.postalCode,
        country: data.destinationAddress.country,
      }
    }

    const res = await client.post<ShippeoShipmentResponse>('/shipments', body)
    return transformShipment(res)
  }

  /**
   * Cancel / stop tracking a shipment.
   *
   * DELETE /shipments/{id}
   */
  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new ShippeoClient(credentials)
    await client.delete(`/shipments/${encodeURIComponent(id)}`)
  }
}
