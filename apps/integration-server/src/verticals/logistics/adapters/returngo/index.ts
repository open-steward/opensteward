// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: rate      — ReturnGO outsources rating to third-party aggregators
//                          (EasyPost, Sendcloud, etc.); no /rates endpoint exists
// Unavailable: manifest  — No manifest concept or endpoint in the ReturnGO API
// Unavailable: warehouse — No /warehouses endpoint; warehouse integration is
//                          push-only (ReturnGO POSTs to your WMS, not vice-versa)

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ReturnGoClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformRmaToShipment,
  transformRmaToOrder,
  type ReturnGoRma,
} from './transform/rma'
import { transformRmaToTrackingEvent } from './transform/tracking'
import { transformRmaToLabel } from './transform/label'
import { transformRmaToCarrier } from './transform/carrier'

interface ReturnGoAdapterConfig {
  // Reserved for future configuration options
  [key: string]: unknown
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class ReturnGoAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'returngo'
  readonly version = '1'

  constructor(_config: ReturnGoAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For ReturnGO the "code" is the API key itself.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  /**
   * List RMAs as inbound return shipments.
   * Supports optional pagination via params.limit and params.page.
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new ReturnGoClient(credentials)
    const p = params as Record<string, unknown>
    const limit = Math.min((params.limit ?? DEFAULT_PAGE_SIZE) as number, MAX_PAGE_SIZE)
    const query: Record<string, unknown> = {
      limit,
      page: p.page ?? undefined,
      status: p.status ?? undefined,
      from: p.from ?? undefined,
      to: p.to ?? undefined,
    }
    const clean = Object.fromEntries(
      Object.entries(query).filter(([, v]) => v !== undefined),
    )
    const res = await client.get<ReturnGoRma[] | { data: ReturnGoRma[]; rmas?: ReturnGoRma[] }>(
      '/rmas',
      clean,
    )
    const rmas = extractList(res)
    return rmas.map(transformRmaToShipment)
  }

  /**
   * Get a single RMA as a shipment by RMA ID.
   */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ReturnGoClient(credentials)
    const res = await client.get<ReturnGoRma | { data: ReturnGoRma; rma?: ReturnGoRma }>(
      `/rmas/${id}`,
    )
    const rma = extractSingle(res)
    return transformRmaToShipment(rma)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  /**
   * List RMAs as return orders.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ReturnGoClient(credentials)
    const p = params as Record<string, unknown>
    const limit = Math.min((params.limit ?? DEFAULT_PAGE_SIZE) as number, MAX_PAGE_SIZE)
    const query: Record<string, unknown> = {
      limit,
      page: p.page ?? undefined,
      status: p.status ?? undefined,
      from: p.from ?? undefined,
      to: p.to ?? undefined,
    }
    const clean = Object.fromEntries(
      Object.entries(query).filter(([, v]) => v !== undefined),
    )
    const res = await client.get<ReturnGoRma[] | { data: ReturnGoRma[]; rmas?: ReturnGoRma[] }>(
      '/rmas',
      clean,
    )
    const rmas = extractList(res)
    return rmas.map(transformRmaToOrder)
  }

  /**
   * Get a single RMA as an order by RMA ID.
   */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ReturnGoClient(credentials)
    const res = await client.get<ReturnGoRma | { data: ReturnGoRma; rma?: ReturnGoRma }>(
      `/rmas/${id}`,
    )
    const rma = extractSingle(res)
    return transformRmaToOrder(rma)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * List tracking events derived from RMA statuses.
   */
  async listTrackingEvents(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<TrackingEvent[]> {
    const client = new ReturnGoClient(credentials)
    const p = params as Record<string, unknown>
    const limit = Math.min((params.limit ?? DEFAULT_PAGE_SIZE) as number, MAX_PAGE_SIZE)
    const query: Record<string, unknown> = {
      limit,
      page: p.page ?? undefined,
      status: p.status ?? undefined,
      from: p.from ?? undefined,
      to: p.to ?? undefined,
    }
    const clean = Object.fromEntries(
      Object.entries(query).filter(([, v]) => v !== undefined),
    )
    const res = await client.get<ReturnGoRma[] | { data: ReturnGoRma[]; rmas?: ReturnGoRma[] }>(
      '/rmas',
      clean,
    )
    const rmas = extractList(res)
    return rmas.map(transformRmaToTrackingEvent)
  }

  /**
   * Get tracking events for a specific RMA by tracking number.
   * Searches RMAs for a matching tracking number.
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new ReturnGoClient(credentials)
    const res = await client.get<ReturnGoRma[] | { data: ReturnGoRma[]; rmas?: ReturnGoRma[] }>(
      '/rmas',
      { tracking_number: trackingNumber },
    )
    const rmas = extractList(res)
    return rmas
      .filter(
        (r) =>
          r.tracking_number === trackingNumber ||
          r.shipment?.tracking_number === trackingNumber,
      )
      .map(transformRmaToTrackingEvent)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  /**
   * List labels derived from RMAs that carry a label_url.
   * ReturnGO embeds label information inside the RMA's shipment object;
   * there is no dedicated /labels endpoint.
   */
  async listLabels(credentials: Credentials, params: QueryParams): Promise<Label[]> {
    const client = new ReturnGoClient(credentials)
    const p = params as Record<string, unknown>
    const limit = Math.min((params.limit ?? DEFAULT_PAGE_SIZE) as number, MAX_PAGE_SIZE)
    const query: Record<string, unknown> = {
      limit,
      page: p.page ?? undefined,
      status: p.status ?? undefined,
      from: p.from ?? undefined,
      to: p.to ?? undefined,
    }
    const clean = Object.fromEntries(
      Object.entries(query).filter(([, v]) => v !== undefined),
    )
    const res = await client.get<ReturnGoRma[] | { data: ReturnGoRma[]; rmas?: ReturnGoRma[] }>(
      '/rmas',
      clean,
    )
    const rmas = extractList(res)
    return rmas.flatMap((r) => {
      const label = transformRmaToLabel(r)
      return label ? [label] : []
    })
  }

  /**
   * Get the label for a specific RMA by RMA ID.
   */
  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new ReturnGoClient(credentials)
    const res = await client.get<ReturnGoRma | { data: ReturnGoRma; rma?: ReturnGoRma }>(
      `/rmas/${id}`,
    )
    const rma = extractSingle(res)
    const label = transformRmaToLabel(rma)
    if (!label) {
      throw new Error(`ReturnGO RMA ${id} does not have an associated label`)
    }
    return label
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  /**
   * List carriers derived from RMA records.
   * ReturnGO does not expose a /carriers endpoint; carrier identity is a string
   * field on each RMA. This returns deduplicated carrier stubs from recent RMAs.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new ReturnGoClient(credentials)
    const p = params as Record<string, unknown>
    const limit = Math.min((params.limit ?? DEFAULT_PAGE_SIZE) as number, MAX_PAGE_SIZE)
    const query: Record<string, unknown> = {
      limit,
      page: p.page ?? undefined,
    }
    const clean = Object.fromEntries(
      Object.entries(query).filter(([, v]) => v !== undefined),
    )
    const res = await client.get<ReturnGoRma[] | { data: ReturnGoRma[]; rmas?: ReturnGoRma[] }>(
      '/rmas',
      clean,
    )
    const rmas = extractList(res)
    const seen = new Set<string>()
    const carriers: Carrier[] = []
    for (const rma of rmas) {
      const carrier = transformRmaToCarrier(rma)
      if (carrier && carrier.code && !seen.has(carrier.code)) {
        seen.add(carrier.code)
        carriers.push(carrier)
      }
    }
    return carriers
  }

  /**
   * Get a carrier stub by carrier code.
   * Since there is no /carriers endpoint, this returns a minimal stub for
   * the requested carrier code without network validation.
   */
  async getCarrier(_credentials: Credentials, id: string): Promise<Carrier> {
    return {
      id,
      name: id,
      code: id,
      isActive: true,
    }
  }
}

// ─── Response-shape helpers ───────────────────────────────────────────────────

/**
 * ReturnGO may return a bare array or an envelope { data: [], rmas: [] }.
 * This helper normalises both shapes.
 */
function extractList(
  res: ReturnGoRma[] | { data?: ReturnGoRma[]; rmas?: ReturnGoRma[] },
): ReturnGoRma[] {
  if (Array.isArray(res)) return res
  return res.rmas ?? res.data ?? []
}

function extractSingle(
  res: ReturnGoRma | { data?: ReturnGoRma; rma?: ReturnGoRma },
): ReturnGoRma {
  if ('id' in res) return res as ReturnGoRma
  const envelope = res as { data?: ReturnGoRma; rma?: ReturnGoRma }
  return envelope.rma ?? envelope.data ?? (res as ReturnGoRma)
}
