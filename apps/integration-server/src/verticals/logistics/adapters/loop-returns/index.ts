// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier  — Loop Returns has no dedicated carrier list endpoint; carrier info is embedded in return records only
// Unavailable: manifest — Loop Returns has no manifest API endpoint
// Unavailable: rate     — Loop Returns handles rate shopping internally; no rate-query API is exposed

import { pageLocally, pageOffset, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'
import type { Warehouse } from '../../schema/warehouse'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { LoopReturnsClient } from './client'
import { DEFAULT_PAGE_SIZE, LABEL_REQUESTS_MAX_LIMIT } from './constants'

import {
  transformReturnToShipment,
  transformReturnToOrder,
  type LoopReturn,
} from './transform/return'
import { transformReturnToTrackingEvent } from './transform/tracking'
import {
  transformLabelRequestToLabel,
  type LoopLabelRequest,
  type LoopLabelRequestsResponse,
} from './transform/label'
import {
  transformDestinationToWarehouse,
  type LoopDestination,
  type LoopDestinationsResponse,
} from './transform/warehouse'
import { parseWebhookEvents as parseWebhookEventsImpl } from './webhook'

// Loop Returns is API-key only — no OAuth fields needed.
type LoopReturnsAdapterConfig = Record<string, never>

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class LoopReturnsAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'loop-returns'
  readonly version = '1'

  constructor(_config: LoopReturnsAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Loop Returns the "code" is the API key itself.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  /**
   * List returns as inbound shipments using the detailed returns list endpoint.
   * Supports optional `from`/`to` date filters and `state` filter via params.
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new LoopReturnsClient(credentials)
    const p = params as Record<string, unknown>
    const queryParams: Record<string, unknown> = {
      from: p.from ?? undefined,
      to: p.to ?? undefined,
      state: p.state ?? undefined,
      filter: p.filter ?? undefined,
    }
    // Remove undefined keys
    const clean = Object.fromEntries(
      Object.entries(queryParams).filter(([, v]) => v !== undefined),
    )
    const res = await client.get<LoopReturn[]>('/warehouse/return/list', clean)
    return (res ?? []).slice(0, params.limit ?? DEFAULT_PAGE_SIZE).map(transformReturnToShipment)
  }

  /**
   * Get a single return-as-shipment by return ID.
   * Real Loop API: GET /warehouse/return/details?return_id=<id> (query param, not path param)
   */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new LoopReturnsClient(credentials)
    const res = await client.get<LoopReturn>('/warehouse/return/details', { return_id: id })
    return transformReturnToShipment(res)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  /**
   * List returns as orders.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new LoopReturnsClient(credentials)
    const p = params as Record<string, unknown>
    const queryParams: Record<string, unknown> = {
      from: p.from ?? undefined,
      to: p.to ?? undefined,
      state: p.state ?? undefined,
      filter: p.filter ?? undefined,
    }
    const clean = Object.fromEntries(
      Object.entries(queryParams).filter(([, v]) => v !== undefined),
    )
    const res = await client.get<LoopReturn[]>('/warehouse/return/list', clean)
    return (res ?? []).slice(0, params.limit ?? DEFAULT_PAGE_SIZE).map(transformReturnToOrder)
  }

  /**
   * Get a single return as an order by return ID.
   * Real Loop API: GET /warehouse/return/details?return_id=<id> (query param, not path param)
   */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new LoopReturnsClient(credentials)
    const res = await client.get<LoopReturn>('/warehouse/return/details', { return_id: id })
    return transformReturnToOrder(res)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * List tracking events for returns, derived from return state.
   */
  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new LoopReturnsClient(credentials)
    const p = params as Record<string, unknown>
    const queryParams: Record<string, unknown> = {
      from: p.from ?? undefined,
      to: p.to ?? undefined,
      state: p.state ?? undefined,
    }
    const clean = Object.fromEntries(
      Object.entries(queryParams).filter(([, v]) => v !== undefined),
    )
    const res = await client.get<LoopReturn[]>('/warehouse/return/list', clean)
    return (res ?? [])
      .slice(0, params.limit ?? DEFAULT_PAGE_SIZE)
      .map(transformReturnToTrackingEvent)
  }

  /**
   * Get tracking events by tracking number.
   * Loop Returns provides no endpoint to look up a return by tracking number —
   * only by return_id, order_id, or order_name. Returning an empty array to
   * avoid a full-list scan that would be expensive and unreliable in production.
   */
  async getTrackingEvents(_credentials: Credentials, _trackingNumber: string): Promise<TrackingEvent[]> {
    return []
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  /**
   * List label requests as canonical Labels.
   * Real endpoint: GET /label-requests
   * Requires API key with "Label Requests (Read)" scope (X-Authorization header).
   * Supports date range filters via from/to params.
   *
   * Pages by `limit` (documented maximum 250) + `offset`. The response carries
   * no total and no next link, so a full page reads as more and a short page
   * as the end.
   */
  async listLabels(credentials: Credentials, params: QueryParams): Promise<Label[]> {
    const client = new LoopReturnsClient(credentials)
    const p = params as Record<string, unknown>
    const requested = Math.floor(params.limit ?? DEFAULT_PAGE_SIZE)
    const size = Math.min(Math.max(requested, 1), LABEL_REQUESTS_MAX_LIMIT)
    const queryParams: Record<string, unknown> = {
      from: p.from ?? undefined,
      to: p.to ?? undefined,
      status: p.status ?? undefined,
      limit: size,
      offset: pageOffset(params, size),
    }
    const clean = Object.fromEntries(
      Object.entries(queryParams).filter(([, v]) => v !== undefined),
    )
    const res = await client.get<LoopLabelRequestsResponse>('/label-requests', clean)
    const items: LoopLabelRequest[] = res?.data ?? []
    reportUpstreamPage(params, {
      hasMore: items.length >= size,
      ...(size < requested ? { pageSize: size } : {}),
    })
    return items.map(transformLabelRequestToLabel)
  }

  /**
   * Get a single label request by ID.
   * Real endpoint: GET /label-requests/{id}
   */
  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new LoopReturnsClient(credentials)
    const res = await client.get<LoopLabelRequest>(`/label-requests/${id}`)
    return transformLabelRequestToLabel(res)
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────

  /**
   * List destinations as canonical Warehouses.
   * Real endpoint: GET /destinations
   * Requires API key with "Destinations (Read)" scope (X-Authorization header).
   * Unpaginated ("Retrieve all destinations."), so the caller's page is cut locally.
   */
  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new LoopReturnsClient(credentials)
    const res = await client.get<LoopDestinationsResponse>('/destinations')
    const items: LoopDestination[] = res?.destinations ?? []
    return pageLocally(items, params).map(transformDestinationToWarehouse)
  }

  /**
   * Get a single destination as a Warehouse by destination ID.
   * Real endpoint: GET /destinations/{id}
   */
  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new LoopReturnsClient(credentials)
    const res = await client.get<LoopDestination>(`/destinations/${id}`)
    return transformDestinationToWarehouse(res)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  /**
   * Parse a Loop Returns webhook payload into canonical WebhookEvents.
   */
  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEventsImpl(payload)
  }
}
