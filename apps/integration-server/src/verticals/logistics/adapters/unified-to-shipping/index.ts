/**
 * Unified.to Shipping adapter for OpenSteward.
 *
 * Unified.to is a meta-API that provides a single normalised interface over
 * 10+ shipping providers (EasyPost, ShipStation, Shippo, FedEx, UPS, etc.).
 *
 * Auth: API key passed as `Authorization: Bearer <key>` header.
 *       Additionally, each API call must include a `connection_id` path
 *       parameter that identifies which downstream provider connection to use.
 *       This is stored in credentials.extra.connectionId at setup time.
 *
 * Base URL: https://api.unified.to
 * Endpoint pattern: /shipping/{connection_id}/{resource}[/{id}]
 *
 * Webhooks: Unified.to supports webhooks for shipping events but uses a
 * platform-specific signing scheme per provider. Since there is no universal
 * HMAC signing key exposed at the Unified.to layer, webhook signature
 * verification is not implemented here.
 */
// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: manifest  — Unified.to Shipping API has no manifest endpoint; the vertical exposes only Shipment, Label, Rate, Tracking, and Carrier.
// Unavailable: order     — Unified.to Shipping API has no order endpoint; order_id appears only as a reference field on Shipment objects.
// Unavailable: warehouse — Unified.to Shipping API has no warehouse endpoint; warehouse_location_id appears only as a reference field on Shipment objects.
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageOffset,
  reportUpstreamPage,
  simpleApiKey,
} from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { UnifiedToShippingClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { unifiedToShippingWebhook } from './webhook'

export { unifiedToShippingWebhook }

import { transformShipment, type UnifiedShippingShipment } from './transform/shipment'
import { expandRates, type UnifiedShippingRate } from './transform/rate'
import { transformLabel, type UnifiedShippingLabel } from './transform/label'
import { transformTracking, type UnifiedShippingTracking } from './transform/tracking'
import { transformCarrier, type UnifiedShippingCarrier } from './transform/carrier'
import { addressToUnified } from './transform/address'

interface UnifiedToShippingAdapterConfig {
  /** Optional override — not used in API-key flow. */
  clientId?: string
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

/**
 * Paging, per https://docs.unified.to/reference/pagination: list endpoints
 * take `limit` ("you can't exceed 100 records per page on most endpoints")
 * and a zero-based `offset`, answer a bare array with no count, and "You will
 * know that there aren't any more records, when the number of returned
 * results is less than your requested `limit`."
 */
function sentSize(params: QueryParams): number {
  return Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
}

/** One caller page of an offset-paged list whose rows map one to one. */
async function listOffsetPage<T>(
  client: UnifiedToShippingClient,
  resource: string,
  query: Record<string, unknown>,
  params: QueryParams,
): Promise<T[]> {
  const size = sentSize(params)
  const offset = pageOffset(params, size)
  const res = await client.get<T[]>(resource, { ...query, limit: size, offset })
  const rows = Array.isArray(res) ? res : []
  reportUpstreamPage(params, {
    // The documented end signal: a page shorter than the limit sent.
    hasMore: rows.length === size,
    ...(size < (params.limit ?? size) ? { pageSize: size } : {}),
  })
  return rows
}

export class UnifiedToShippingAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'unified-to-shipping'
  readonly version = '1'
  // Every list method pages by `limit` (at most 100) and `offset`, or by rows.
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config: UnifiedToShippingAdapterConfig = {}) {}

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ─────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new UnifiedToShippingClient(credentials)
    const res = await listOffsetPage<UnifiedShippingShipment>(
      client,
      'shipment',
      params.updatedAfter ? { updatedGte: (params.updatedAfter as Date).toISOString() } : {},
      params,
    )
    return res.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new UnifiedToShippingClient(credentials)
    const raw = await client.getById<UnifiedShippingShipment>('shipment', id)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new UnifiedToShippingClient(credentials)
    const body: Partial<UnifiedShippingShipment> = {
      referenceNumber: data.reference,
      carrierId: data.carrierId,
      serviceCode: data.serviceCode,
      fromAddress: addressToUnified(data.originAddress),
      toAddress: addressToUnified(data.destinationAddress),
      returnAddress: addressToUnified(data.returnAddress),
      packages:
        data.totalWeight
          ? [
              {
                weight: data.totalWeight.value,
                weightUnit: data.totalWeight.unit,
                length: data.dimensions?.length,
                width: data.dimensions?.width,
                height: data.dimensions?.height,
                sizeUnit: data.dimensions?.unit,
              },
            ]
          : undefined,
    }
    const raw = await client.post<UnifiedShippingShipment>('shipment', body)
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new UnifiedToShippingClient(credentials)
    await client.delete('shipment', id)
  }

  // ── Tracking Events ───────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new UnifiedToShippingClient(credentials)
    // Unified.to: GET /shipping/{connection_id}/tracking/{id}
    // The tracking ID is usually the tracking number for GET-by-id.
    const raw = await client.getById<UnifiedShippingTracking>('tracking', trackingNumber)
    return transformTracking(raw)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new UnifiedToShippingClient(credentials)
    // Events are flattened out of tracking objects, so one upstream page is
    // not one caller page: walk the trackings in full pages of 100 by offset
    // and cut the caller's events out of them.
    const query = params.updatedAfter
      ? { updatedGte: (params.updatedAfter as Date).toISOString() }
      : {}
    const key = cursorPagerKey(
      connectionScope(`unified-to-shipping:${client.connectionId}`, credentials),
      'tracking-events',
      { ...query, limit: MAX_PAGE_SIZE },
    )
    const { items } = await pageByRows<TrackingEvent, number>(
      key,
      params,
      async (cursor) => {
        const offset = cursor ?? 0
        const res = await client.get<UnifiedShippingTracking[]>('tracking', {
          ...query,
          limit: MAX_PAGE_SIZE,
          offset,
        })
        const rows = Array.isArray(res) ? res : []
        return {
          items: rows.flatMap(transformTracking),
          // The documented end signal: a page shorter than the limit sent.
          next: rows.length === MAX_PAGE_SIZE ? offset + rows.length : undefined,
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new UnifiedToShippingClient(credentials)
    const body: Partial<UnifiedShippingRate> = {
      fromAddress: addressToUnified(params.originAddress),
      toAddress: addressToUnified(params.destinationAddress),
      packages: params.packages.map((pkg) => ({
        weight: pkg.weight?.value,
        weightUnit: pkg.weight?.unit ?? 'oz',
        length: pkg.dimensions?.length,
        width: pkg.dimensions?.width,
        height: pkg.dimensions?.height,
        sizeUnit: pkg.dimensions?.unit ?? 'in',
      })),
    }
    const raw = await client.post<UnifiedShippingRate>('rate', body)
    return expandRates(raw)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async listLabels(credentials: Credentials, params: QueryParams): Promise<Label[]> {
    const client = new UnifiedToShippingClient(credentials)
    const res = await listOffsetPage<UnifiedShippingLabel>(
      client,
      'label',
      params.updatedAfter ? { updatedGte: (params.updatedAfter as Date).toISOString() } : {},
      params,
    )
    return res.map(transformLabel)
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new UnifiedToShippingClient(credentials)
    const raw = await client.getById<UnifiedShippingLabel>('label', id)
    return transformLabel(raw)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new UnifiedToShippingClient(credentials)
    const body: Partial<UnifiedShippingLabel> = {
      shipmentId: data.shipmentId,
      rateId:
        data.metadata && typeof data.metadata === 'object'
          ? String((data.metadata as Record<string, unknown>).rate_id ?? '')
          : undefined,
      labelFormat: data.format ?? 'PDF',
      serviceCode: data.serviceCode,
    }
    const raw = await client.post<UnifiedShippingLabel>('label', body)
    return transformLabel(raw)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new UnifiedToShippingClient(credentials)
    await client.delete('label', id)
  }

  // ── Carriers ──────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new UnifiedToShippingClient(credentials)
    const res = await listOffsetPage<UnifiedShippingCarrier>(client, 'carrier', {}, params)
    return res.map(transformCarrier)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new UnifiedToShippingClient(credentials)
    const raw = await client.getById<UnifiedShippingCarrier>('carrier', id)
    return transformCarrier(raw)
  }
}
