// ── Resource coverage ──────────────────────────────────────────────
// Available:   trackingevent — GET /v1/tasks (list) + GET /v1/tasks/:id (get)
// Available:   shipment      — derived from GET /v1/tasks/:id
// Unverified:  carrier       — Locus API docs require client credentials (401); no public endpoint confirmed
// Unverified:  label         — endpoint exists per partner docs but paths/schema not publicly documented
// Unverified:  manifest      — endpoint exists per partner docs but paths/schema not publicly documented
// Unverified:  order         — order management on separate base (oms.locus-api.com); schema not publicly documented
// Unverified:  rate          — no public endpoint confirmed for rate quotes
// Unverified:  warehouse     — no public endpoint confirmed for warehouses/hubs

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { LocusClient } from './client'
import {
  transformTracking,
  transformTrackingList,
  type LocusTask,
  type LocusTaskListResponse,
} from './transform/tracking'

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class LocusAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'locus'
  readonly version = '1'

  getAuthUrl(state: string): string { return buildAuthUrl(state) }
  async exchangeCode(code: string, _ru: string): Promise<Credentials> { return exchangeApiKey(code) }
  async refreshCredentials(c: Credentials): Promise<Credentials> { return doRefresh(c) }

  /**
   * List tracking events for all tasks, optionally filtered by query params.
   * Maps to GET /v1/tasks endpoint.
   */
  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new LocusClient(credentials)
    const query: Record<string, unknown> = {}
    if (params.limit) query.limit = params.limit
    if (params.page) query.page = params.page
    if (params.updatedAfter) query.updatedAfter = params.updatedAfter.toISOString()
    const raw = await client.get<LocusTaskListResponse>('tasks', query)
    return transformTrackingList(raw)
  }

  /**
   * Get tracking events for a specific task by ID.
   * Maps to GET /v1/tasks/:taskId endpoint.
   */
  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new LocusClient(credentials)
    const raw = await client.get<LocusTask>(`tasks/${trackingNumber}`)
    return [transformTracking(raw)]
  }

  /**
   * Get a shipment record for a specific task, mapped from the Locus task model.
   * Maps to GET /v1/tasks/:taskId endpoint.
   */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new LocusClient(credentials)
    const raw = await client.get<LocusTask>(`tasks/${id}`)
    const event = transformTracking(raw)
    return {
      id: raw.taskId,
      trackingNumber: raw.clientTaskId ?? raw.taskId,
      carrierId: 'locus',
      status: mapTaskStatusToShipmentStatus(raw.status),
      destinationAddress: raw.locationAddress
        ? {
            street1: raw.locationAddress.addressLine1 ?? undefined,
            street2: raw.locationAddress.addressLine2 ?? undefined,
            city: raw.locationAddress.city ?? undefined,
            state: raw.locationAddress.state ?? undefined,
            postalCode: raw.locationAddress.pinCode ?? undefined,
            country: raw.locationAddress.country ?? undefined,
          }
        : undefined,
      estimatedDeliveryAt: raw.expectedArrivalTime ? new Date(raw.expectedArrivalTime) : undefined,
      actualDeliveryAt: event.occurredAt,
      metadata: raw as Record<string, unknown>,
    }
  }

  /**
   * Webhook verification is not implemented — Locus does not provide a
   * publicly documented HMAC signature scheme for webhooks at this time.
   */
  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return false
  }
}

function mapTaskStatusToShipmentStatus(status: string | null | undefined): Shipment['status'] {
  if (!status) return 'UNKNOWN'
  const s = status.toUpperCase()
  if (s === 'UNASSIGNED' || s === 'PENDING') return 'LABEL_CREATED'
  if (s === 'ASSIGNED' || s === 'STARTED' || s === 'PICKUP_COMPLETE') return 'IN_TRANSIT'
  if (s === 'ARRIVED' || s === 'DELIVERY_STARTED') return 'OUT_FOR_DELIVERY'
  if (s === 'DELIVERED' || s === 'COMPLETED') return 'DELIVERED'
  if (s === 'FAILED' || s === 'CANCELLED' || s === 'REJECTED') return 'EXCEPTION'
  if (s === 'RETURNED') return 'RETURNED'
  return 'UNKNOWN'
}
