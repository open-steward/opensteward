/**
 * Central Transport LTL adapter.
 *
 * Central Transport is a regional LTL freight carrier covering the US, Canada,
 * and Mexico. This adapter integrates via the Piyovi unified carrier platform
 * (https://api.piyovi.io/v1), which acts as the API gateway over Central
 * Transport's native services.
 *
 * Auth: API key issued by Piyovi (App → Configuration → API KEY),
 *       transmitted as the `X-API-KEY` request header.
 *
 * Supported operations:
 *  - getTrackingEvents  — real-time PRO-number tracking
 *  - createShipment     — BOL + PRO label creation
 *  - getRates           — LTL rate quotes
 *  - createLabel        — derived from POST /v1/shipment response (BOL/label URL)
 *  - listWarehouses     — GET /v1/locations (Piyovi shipping origin locations)
 *  - getWarehouse       — GET /v1/locations/{id}
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: carrier  — Piyovi has no carrier-list endpoint; Central Transport
 *                          is a single fixed carrier (CTII) with no listing API.
 * Unavailable: manifest — Piyovi exposes no manifest endpoint.
 * Unavailable: order    — Piyovi is a carrier gateway, not an OMS; no order concept.
 */
import { reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Warehouse } from '../../schema/warehouse'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { CentralTransportClient } from './client'

import {
  transformTrackingEvents,
  type PiyoviTrackingResponse,
} from './transform/tracking'
import { transformRate, extractQuotes, type PiyoviRateResponse } from './transform/rate'
import { transformShipment, type PiyoviShipmentResponse } from './transform/shipment'
import { transformLabel } from './transform/label'
import {
  transformWarehouse,
  extractLocations,
  type PiyoviLocationsResponse,
  type PiyoviLocation,
} from './transform/warehouse'

/** Piyovi's documented default for the required `Limit` parameter. */
const LOCATIONS_DEFAULT_LIMIT = 15

/** The paging fields of Piyovi's documented LocationListResponse. */
type PiyoviLocationsPage = PiyoviLocationsResponse & {
  totalCount?: number
  hasNextPage?: boolean
}

/** GET /v1/locations response: `{ status, payload: LocationListResponse }`. */
type PiyoviLocationsEnvelope = PiyoviLocationsPage & { payload?: PiyoviLocationsPage }

export interface CentralTransportAdapterConfig {
  /** Pass `true` to target the Piyovi UAT environment. */
  sandbox?: boolean
  /** Piyovi account number / shipper account if required for rate requests. */
  accountNumber?: string
}

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'Piyovi API key',
  placeholder: 'piy_live_...',
  helpText:
    'Find your key in the Piyovi dashboard under App → Configuration → API KEY.',
})

export class CentralTransportAdapter implements LogisticsAdapter {
  readonly platform = 'central-transport'
  readonly version = '1'

  /** Connect Link: single API-key credential form. */
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  private config: CentralTransportAdapterConfig

  constructor(config: CentralTransportAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  /**
   * For API-key adapters the "code" is the raw key value.
   * The Connect Link form calls `exchangeCredentials` directly; this method
   * is provided for interface compliance with the OAuth-style `exchangeCode` flow.
   */
  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * Fetch tracking history for a Central Transport PRO number.
   * Maps to Piyovi POST /v1/shipment/track.
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new CentralTransportClient(credentials)
    const raw = await client.post<PiyoviTrackingResponse>('shipment/track', {
      trackingNumber,
      carrierCode: 'CTII',
    })
    return transformTrackingEvents(raw, trackingNumber)
  }

  // ── Shipment Creation (BOL) ───────────────────────────────────────────────

  /**
   * Create a Central Transport LTL shipment (BOL + PRO label) via Piyovi.
   * Maps to Piyovi POST /v1/shipment.
   *
   * Weight constraints: 150–25,000 lbs; no hazmat.
   */
  async createShipment(
    credentials: Credentials,
    data: Partial<Shipment>,
  ): Promise<Shipment> {
    const client = new CentralTransportClient(credentials)

    const body = {
      carrierCode: 'CTII',
      accountNumber: this.config.accountNumber,
      serviceCode: data.serviceCode,
      shipper: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            addressLine1: data.originAddress.street1,
            addressLine2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postalCode: data.originAddress.postalCode,
            country: data.originAddress.country ?? 'US',
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      consignee: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            addressLine1: data.destinationAddress.street1,
            addressLine2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postalCode: data.destinationAddress.postalCode,
            country: data.destinationAddress.country ?? 'US',
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      totalWeight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit.toUpperCase() }
        : undefined,
      totalPieces: data.packages?.length ?? 1,
      packages: (data.packages ?? []).map((pkg) => ({
        weight: pkg.weight ? { value: pkg.weight.value, unit: pkg.weight.unit.toUpperCase() } : undefined,
        dimensions: pkg.dimensions
          ? {
              length: pkg.dimensions.length,
              width: pkg.dimensions.width,
              height: pkg.dimensions.height,
              unit: pkg.dimensions.unit.toUpperCase(),
            }
          : undefined,
      })),
      referenceNumber: data.reference,
      notes: data.notes,
    }

    const res = await client.post<PiyoviShipmentResponse>('shipment', body)
    return transformShipment(res)
  }

  // ── Rate Quotes ───────────────────────────────────────────────────────────

  /**
   * Request LTL rate quotes for a Central Transport shipment via Piyovi.
   * Maps to Piyovi POST /v1/shipment/rate.
   */
  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new CentralTransportClient(credentials)
    const pkg = params.packages[0]

    const body = {
      carrierCode: 'CTII',
      accountNumber: this.config.accountNumber,
      origin: {
        postalCode: params.originAddress.postalCode,
        city: params.originAddress.city,
        state: params.originAddress.state,
        country: params.originAddress.country ?? 'US',
      },
      destination: {
        postalCode: params.destinationAddress.postalCode,
        city: params.destinationAddress.city,
        state: params.destinationAddress.state,
        country: params.destinationAddress.country ?? 'US',
      },
      commodity: {
        weight: pkg?.weight ? { value: pkg.weight.value, unit: pkg.weight.unit.toUpperCase() } : undefined,
        dimensions: pkg?.dimensions
          ? {
              length: pkg.dimensions.length,
              width: pkg.dimensions.width,
              height: pkg.dimensions.height,
              unit: pkg.dimensions.unit.toUpperCase(),
            }
          : undefined,
        pieces: params.packages.length,
      },
    }

    const res = await client.post<PiyoviRateResponse>('shipment/rate', body)
    return extractQuotes(res).map(transformRate)
  }

  // ── Labels (derived from shipment) ───────────────────────────────────────

  /**
   * Create a label by creating a Central Transport LTL shipment via Piyovi.
   * The BOL/carrier label URL is returned in the POST /v1/shipment response and
   * is derived here — no separate label-creation endpoint exists.
   */
  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new CentralTransportClient(credentials)

    const body = {
      carrierCode: 'CTII',
      accountNumber: this.config.accountNumber,
      serviceCode: data.serviceCode,
      referenceNumber: data.trackingNumber,
    }

    const res = await client.post<PiyoviShipmentResponse>('shipment', body)
    return transformLabel(res)
  }

  // ── Warehouses (Piyovi locations) ─────────────────────────────────────────

  /**
   * One caller page of the Piyovi shipping-origin locations in the account.
   * Maps to GET /v1/locations, paged by Page + Limit. Piyovi's OpenAPI
   * (https://api.piyovi.io/swagger/v1/swagger.json): "Page" — "Gets or sets
   * the page number for pagination. Default is 1." / "Limit" — "Gets or sets
   * the number of items per page. Default is 15." The response's `payload`
   * carries "hasNextPage" — "Gets or sets a value indicating whether there is
   * a next page." No maximum is documented for Limit, so none is declared.
   */
  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new CentralTransportClient(credentials)
    const page =
      typeof params.page === 'number' && Number.isFinite(params.page) && params.page >= 1
        ? Math.floor(params.page)
        : 1
    const asked = Number(params.limit)
    const limit = Number.isFinite(asked) && asked >= 1 ? Math.floor(asked) : LOCATIONS_DEFAULT_LIMIT
    const raw = await client.get<PiyoviLocationsEnvelope>('locations', {
      Page: page,
      Limit: limit,
    })
    // The documented response wraps the list in `payload`; a flat body is
    // still read so the older shape keeps working.
    const body: PiyoviLocationsPage = raw.payload ?? raw
    const rows = extractLocations(body)
    const total = typeof body.totalCount === 'number' ? body.totalCount : undefined
    reportUpstreamPage(params, {
      hasMore:
        typeof body.hasNextPage === 'boolean'
          ? body.hasNextPage
          : total !== undefined
            ? (page - 1) * limit + rows.length < total
            : rows.length === limit,
      ...(total !== undefined ? { totalCount: total } : {}),
      pageSize: limit,
    })
    return rows.map(transformWarehouse)
  }

  /**
   * Fetch a single Piyovi location by its id.
   * Maps to GET /v1/locations/{id}.
   */
  async getWarehouse(_credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new CentralTransportClient(_credentials)
    const raw = await client.get<PiyoviLocation>(`locations/${id}`)
    return transformWarehouse(raw)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  /**
   * Central Transport / Piyovi does not expose a documented webhook signature
   * verification mechanism. This stub returns `false` to fail closed and must
   * not be changed to `true` without a real HMAC/signature check.
   */
  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return false
  }
}
