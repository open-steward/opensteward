import axios from 'axios'
import { pageOffset, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Carrier } from '../../schema/carrier'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ShipsGoClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, SHIPSGO_API_V2_BASE } from './constants'
import {
  transformShipment,
  type ShipsGoContainer,
  type ShipsGoListResponse,
} from './transform/shipment'
import { transformTracking } from './transform/tracking'
import {
  transformCarrier,
  type ShipsGoCarrierListResponse,
} from './transform/carrier'

// ─── Config ───────────────────────────────────────────────────────────────────

interface ShipsGoAdapterConfig {
  /**
   * Set to true to target the ShipsGo sandbox/staging environment if one
   * becomes available.  Currently unused — kept for forward-compatibility.
   */
  sandbox?: boolean
}

// ─── Credential form ──────────────────────────────────────────────────────────

const SIMPLE_API_KEY_FORM = simpleApiKey()

// ─── Adapter ─────────────────────────────────────────────────────────────────

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: label     — ShipsGo is a tracking-only API; no label printing or generation endpoints exist
// Unavailable: manifest  — No manifest/SCAN-form concept in the ShipsGo API
// Unavailable: order     — ShipsGo is not an order management system; no order endpoints exist
// Unavailable: rate      — ShipsGo does not provide freight rate quoting endpoints
// Unavailable: warehouse — ShipsGo has no warehouse management concept or endpoints

/**
 * OpenSteward adapter for the ShipsGo Container Tracking API.
 *
 * Supported operations
 * ────────────────────
 *   • listShipments       — GET  ShipmentService/v2/list          (legacy v1 API)
 *   • getShipment         — GET  ShipmentService/v2/{shipmentId}  (legacy v1 API)
 *   • createShipment      — POST ShipmentService/v2/add           (legacy v1 API)
 *   • cancelShipment      — POST ShipmentService/v2/delete/{id}   (legacy v1 API)
 *   • listTrackingEvents  — GET  ShipmentService/v2/list          (milestones flattened, legacy v1 API)
 *   • getTrackingEvents   — GET  ShipmentService/v2/{shipmentId}  (milestones, legacy v1 API)
 *   • listCarriers        — GET  /ocean/carriers                  (v2 API)
 *
 * Authentication
 * ──────────────
 *   Legacy v1 API: API key as `authCode` query parameter.
 *   v2 API:        Same key sent as `X-Shipsgo-User-Token` header.
 *   The key is obtained from the ShipsGo dashboard under Settings → API.
 *
 * Rate limits
 * ───────────
 *   100 requests/minute shared across all company users.
 *   Each new shipment creation deducts 1 credit; subsequent queries are free.
 *
 * Webhooks
 * ────────
 *   ShipsGo does not yet support webhook signatures — no webhook.ts.
 */
export class ShipsGoAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'shipsgo'
  readonly version = '1'
  /**
   * 100 is documented only for listCarriers (v2 `take`, maximum 100). The
   * other two list methods clamp `pageSize` to the same constant on
   * `ShipmentService/v2/list`, which no ShipsGo doc describes.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config: ShipsGoAdapterConfig = {}) {}

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
   * Lists tracked containers from ShipsGo with optional pagination.
   *
   * Query params forwarded to the API:
   *   pageIndex  — 1-based page number (default: 1)
   *   pageSize   — results per page (default: DEFAULT_PAGE_SIZE, max: MAX_PAGE_SIZE)
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new ShipsGoClient(credentials)
    const pageSize = Math.min((params.limit as number | undefined) ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const pageIndex = (params.page as number | undefined) ?? 1

    const res = await client.get<ShipsGoListResponse>('ShipmentService/v2/list', {
      pageIndex,
      pageSize,
    })
    return (res.data ?? []).map(transformShipment)
  }

  /**
   * Fetches a single container/shipment by its ShipsGo shipmentId or
   * container number.
   */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ShipsGoClient(credentials)
    const raw = await client.get<ShipsGoContainer>(`ShipmentService/v2/${id}`, {
      mapPoint: true,
    })
    return transformShipment(raw)
  }

  /**
   * Registers a new container/BL for tracking in ShipsGo.
   *
   * Required fields (passed via data.metadata or direct fields):
   *   containerNumber | mblNumber | bookingNumber
   *
   * ShipsGo deducts 1 credit per new unique shipment creation.
   */
  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ShipsGoClient(credentials)
    const meta = (data.metadata ?? {}) as Record<string, unknown>

    const body: Record<string, unknown> = {
      containerNumber: data.trackingNumber ?? meta.containerNumber ?? undefined,
      mblNumber: data.reference ?? meta.mblNumber ?? undefined,
      bookingNumber: meta.bookingNumber ?? undefined,
      shippingLine: data.ocean?.shippingLine ?? meta.shippingLine ?? undefined,
      pol: data.ocean?.portOfLoading ?? meta.pol ?? undefined,
      pod: data.ocean?.portOfDischarge ?? meta.pod ?? undefined,
    }

    const raw = await client.post<ShipsGoContainer>('ShipmentService/v2/add', body)
    return transformShipment(raw)
  }

  /**
   * Stops tracking a container in ShipsGo (does not affect the carrier record).
   */
  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new ShipsGoClient(credentials)
    await client.post<unknown>(`ShipmentService/v2/delete/${id}`, {})
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * Returns milestone-level tracking events for a specific container/shipment.
   *
   * @param trackingNumber  ShipsGo shipmentId or container number (MSCU1234567)
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new ShipsGoClient(credentials)
    const raw = await client.get<ShipsGoContainer>(`ShipmentService/v2/${trackingNumber}`, {
      mapPoint: false,
    })
    return transformTracking(raw)
  }

  /**
   * Returns tracking events for all tracked containers, flattening milestones
   * into a single event stream.
   */
  async listTrackingEvents(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<TrackingEvent[]> {
    const client = new ShipsGoClient(credentials)
    const pageSize = Math.min((params.limit as number | undefined) ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const pageIndex = (params.page as number | undefined) ?? 1

    const res = await client.get<ShipsGoListResponse>('ShipmentService/v2/list', {
      pageIndex,
      pageSize,
    })
    return (res.data ?? []).flatMap(transformTracking)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  /**
   * Lists ocean carriers supported by ShipsGo for container tracking.
   *
   * Uses the ShipsGo v2 API endpoint GET /ocean/carriers with
   * X-Shipsgo-User-Token header authentication (same API key as v1).
   *
   * Paginates with `skip`/`take`. `params.limit` maps to `take` (documented
   * minimum 1, maximum 100); `skip` is "The number of records to skip before
   * returning the results", so page N skips (N - 1) × the take actually sent.
   * `meta.more` and `meta.total` are reported, so a page clamped to 100 under a
   * larger caller limit is not read as the last one.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const asked = Number(params.limit)
    const take =
      Number.isFinite(asked) && asked >= 1 ? Math.min(Math.floor(asked), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE
    const skip = pageOffset({ page: Number(params.page) }, take)

    const { data } = await axios.get<ShipsGoCarrierListResponse>(
      `${SHIPSGO_API_V2_BASE}/ocean/carriers`,
      {
        headers: {
          'X-Shipsgo-User-Token': credentials.accessToken,
          Accept: 'application/json',
        },
        params: { skip, take },
      },
    )

    const more = data.meta?.more
    const total = data.meta?.total
    reportUpstreamPage(params, {
      ...(typeof more === 'boolean' ? { hasMore: more } : {}),
      ...(typeof total === 'number' ? { totalCount: total } : {}),
    })
    return (data.carriers ?? []).map(transformCarrier)
  }
}
