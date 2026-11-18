// ── Resource coverage ──────────────────────────────────────────────
// Available:   shipment, trackingevent
// Unavailable: carrier — Roambee is a visibility/monitoring platform, not a carrier management system
// Unavailable: label — Roambee does not generate or manage shipping labels
// Unavailable: manifest — Roambee has no manifest concept; tracks shipment events/conditions only
// Unavailable: order — Roambee has no order management API; integrates with ERP/TMS but does not expose orders
// Unavailable: rate — Roambee does not quote shipping rates; it is a monitoring platform only
// Unverified:  warehouse — Roambee has a facility monitoring concept but the endpoint structure is behind an authenticated portal
//
// API reference: https://docs.decklar.com/ (Roambee is now Decklar; the
// Redoc page embeds the OpenAPI spec). Shipments are GET /v2/shipment
// ("Get List of Shipments") and GET /v2/shipment/summary?uuid= ("Get
// Shipment Details"); a shipment's event history is POST /shipment/alerts
// ("Get Alert for Shipment") with body { sid }.

import {
  simpleApiKey,
  pageByRows,
  pageOffset,
  cursorPagerKey,
  connectionScope,
  reportUpstreamPage,
  DEFAULT_PAGE_LIMIT,
} from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { RoambeeClient } from './client'
import { EVENT_PARENT_PAGE_SIZE, MAX_SHIPMENT_PAGE_SIZE, ROAMBEE_API_BASE } from './constants'
import {
  transformShipmentRow,
  transformShipmentSummary,
  type RoambeeShipmentList,
  type RoambeeShipmentRow,
  type RoambeeShipmentSummary,
} from './transform/shipment'
import { transformAlerts, type RoambeeAlert } from './transform/tracking'

interface RoambeeAdapterConfig {
  clientId?: string
  clientSecret?: string
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

/**
 * One page of GET /v2/shipment. `$size`: "This specifies result count. If
 * not specified by default it will return 10 records. Maximum value can be
 * 100. For more please use pagination." `$offset`: "Offset from start of
 * records. Calculated as (desired_page_num - 1) * size". The response is
 * `{ offset, size, total, data }`; `total` counts every match, so the page is
 * the last when offset + rows reaches it.
 */
async function fetchShipmentPage(
  client: RoambeeClient,
  offset: number,
  size: number,
): Promise<{ rows: RoambeeShipmentRow[]; total: number | undefined; hasMore: boolean }> {
  const res = await client.get<RoambeeShipmentList>('v2/shipment', {
    $size: size,
    $offset: offset,
  })
  const rows = res.data ?? []
  // Nothing at this offset: the list ends here, whatever else the body says.
  if (rows.length === 0) return { rows, total: res.total, hasMore: false }
  if (typeof res.total !== 'number') {
    throw new Error(
      'Decklar GET /v2/shipment returned rows but no total, the only documented end of the list',
    )
  }
  return { rows, total: res.total, hasMore: offset + rows.length < res.total }
}

export class RoambeeAdapter implements LogisticsAdapter {
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'roambee'
  readonly version = '1'
  // GET /v2/shipment $size: "Maximum value can be 100."
  readonly capabilities = { maxPageSize: MAX_SHIPMENT_PAGE_SIZE }

  constructor(_config: RoambeeAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }
  async exchangeCode(code: string, _ru: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }
  async refreshCredentials(c: Credentials): Promise<Credentials> {
    return doRefresh(c)
  }

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>): boolean {
    return false
  }

  /**
   * POST /shipment/alerts with body { sid: <shipment uuid> }: "It returns a
   * list of all alerts for the shipment." `trackingNumber` is the shipment
   * uuid, the id listShipments returns.
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new RoambeeClient(credentials)
    const alerts = await client.post<RoambeeAlert[]>('shipment/alerts', { sid: trackingNumber })
    return transformAlerts(trackingNumber, Array.isArray(alerts) ? alerts : [])
  }

  /**
   * Every shipment's alerts, flattened: GET /v2/shipment pages of
   * EVENT_PARENT_PAGE_SIZE shipments, then POST /shipment/alerts for each.
   * One page of shipments is not one caller page of events, so the caller's
   * page is cut from the stream by pageByRows.
   */
  async listTrackingEvents(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<TrackingEvent[]> {
    const client = new RoambeeClient(credentials)
    const size = EVENT_PARENT_PAGE_SIZE
    const key = cursorPagerKey(
      connectionScope(ROAMBEE_API_BASE, credentials),
      'roambee:trackingevents',
      { size },
    )
    const { items } = await pageByRows<TrackingEvent, number>(key, params, async (cursor) => {
      const offset = cursor ?? 0
      const page = await fetchShipmentPage(client, offset, size)
      const events: TrackingEvent[] = []
      for (const row of page.rows) {
        if (!row.uuid) throw new Error('Decklar shipment row has no uuid')
        const alerts = await client.post<RoambeeAlert[]>('shipment/alerts', { sid: row.uuid })
        events.push(...transformAlerts(row.uuid, Array.isArray(alerts) ? alerts : []))
      }
      return { items: events, next: page.hasMore ? offset + page.rows.length : undefined }
    })
    return items
  }

  /** GET /v2/shipment at the caller's page, `$size` clamped to the documented 100. */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new RoambeeClient(credentials)
    const asked = Math.max(
      1,
      Math.floor(Number(params.limit ?? DEFAULT_PAGE_LIMIT)) || DEFAULT_PAGE_LIMIT,
    )
    const size = Math.min(asked, MAX_SHIPMENT_PAGE_SIZE)
    const offset = pageOffset(params, size)
    const page = await fetchShipmentPage(client, offset, size)
    reportUpstreamPage(params, {
      hasMore: page.hasMore,
      ...(page.total !== undefined ? { totalCount: page.total } : {}),
      ...(size < asked ? { pageSize: size } : {}),
    })
    return page.rows.map(transformShipmentRow)
  }

  /** GET /v2/shipment/summary?uuid=: "It will return all details of that particular shipment". */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new RoambeeClient(credentials)
    const raw = await client.get<RoambeeShipmentSummary>('v2/shipment/summary', { uuid: id })
    return transformShipmentSummary(id, raw)
  }
}
