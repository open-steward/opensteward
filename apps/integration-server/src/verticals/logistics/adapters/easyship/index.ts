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
import type { Manifest } from '../../schema/manifest'

import { buildAuthUrl, exchangeApiKey, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { EasyshipClient } from './client'
import {
  EASYSHIP_API_BASE,
  EASYSHIP_DEFAULT_PER_PAGE,
  EASYSHIP_MAX_PER_PAGE,
  EASYSHIP_SANDBOX_API_BASE,
} from './constants'
import { reportUpstreamPage } from '@opensteward/shared'

import { transformTracking, type EasyshipTrackingResponse } from './transform/tracking'
import { transformShipment, type EasyshipShipment } from './transform/shipment'
import { transformRate, type EasyshipRate } from './transform/rate'
import { transformLabel, type EasyshipLabelResponse } from './transform/label'
import { transformCarrier, type EasyshipCourier } from './transform/carrier'
import { transformManifest, type EasyshipManifest } from './transform/manifest'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: order     — Easyship has no /orders endpoint; the platform is shipment-centric and orders are managed externally.
// Unavailable: warehouse — Easyship has no GET /warehouses endpoint; only eFulfillment warehouse-state updates on shipments exist.

/**
 * `meta.pagination` on every 2024-09 list response: `next` is the next page
 * number or null, `count` the total (null on "countless" lists).
 */
interface EasyshipListMeta {
  meta?: { pagination?: { page?: number; next?: number | null; count?: number | null } }
}

/** Easyship's `page` + `per_page` for the caller's 1-based page and limit, per_page capped at 100. */
function easyshipPageQuery(params: QueryParams): { page: number; per_page: number } {
  const p = Number(params.page)
  const n = Number(params.limit)
  return {
    page: Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1,
    per_page:
      Number.isFinite(n) && n >= 1
        ? Math.min(Math.floor(n), EASYSHIP_MAX_PER_PAGE)
        : EASYSHIP_DEFAULT_PER_PAGE,
  }
}

/** Report `next` (and `count` when Easyship gives one) as the page's end signal. */
function reportEasyshipPage(params: QueryParams, perPage: number, res: EasyshipListMeta): void {
  const pagination = res.meta?.pagination
  if (!pagination) return
  reportUpstreamPage(params, {
    hasMore: pagination.next !== null && pagination.next !== undefined,
    ...(typeof pagination.count === 'number' ? { totalCount: pagination.count } : {}),
    pageSize: perPage,
  })
}

export interface EasyshipAdapterConfig {
  clientId?: string
  clientSecret?: string
  sandbox?: boolean
}

export class EasyshipAdapter implements LogisticsAdapter {
  readonly platform = 'easyship'
  readonly version = '1'
  /** `per_page` "maximum": 100 on every list endpoint the adapter calls. */
  readonly capabilities = { maxPageSize: EASYSHIP_MAX_PER_PAGE }
  private baseURL: string

  constructor(config: EasyshipAdapterConfig = {}) {
    this.config = config
    this.baseURL = config.sandbox ? EASYSHIP_SANDBOX_API_BASE : EASYSHIP_API_BASE
  }

  private config: EasyshipAdapterConfig

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      // fall back to code-based exchange ("clientId:clientSecret")
      return exchangeApiKey(code)
    }
    return exchangeCredentials({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * `tracking/{n}` is undocumented and 404s. `GET /trackings/{tracking_id}`
   * takes Easyship's own tracking UUID, needs the advanced
   * `public.track_3p:read` scope, and returns no checkpoints. The only
   * endpoint that returns checkpoint events is `GET shipments/trackings`,
   * filtered by `easyship_shipment_id` (scope `public.track:read`) — so the
   * route param here is the Easyship shipment id, not a tracking number.
   */
  async getTrackingEvents(credentials: Credentials, shipmentId: string): Promise<TrackingEvent[]> {
    const client = new EasyshipClient(credentials, this.baseURL)
    const raw = await client.get<EasyshipTrackingResponse>('shipments/trackings', {
      easyship_shipment_id: shipmentId,
      include_checkpoints: true,
    })
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new EasyshipClient(credentials, this.baseURL)
    const raw = await client.post<EasyshipShipment>('shipments', {
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            street1: data.originAddress.street1,
            street2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postal_code: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      recipient: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            street1: data.destinationAddress.street1,
            street2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
      reference: data.reference,
      service_code: data.serviceCode,
    })
    return transformShipment(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new EasyshipClient(credentials, this.baseURL)
    const firstPkg = params.packages[0]
    const body = {
      from: {
        postal_code: params.originAddress.postalCode,
        country: params.originAddress.country,
      },
      to: {
        postal_code: params.destinationAddress.postalCode,
        country: params.destinationAddress.country,
      },
      weight: firstPkg?.weight?.value,
      weight_unit: firstPkg?.weight?.unit,
      length: firstPkg?.dimensions?.length,
      width: firstPkg?.dimensions?.width,
      height: firstPkg?.dimensions?.height,
      service_codes: params.serviceCodes,
    }
    const res = await client.post<{ rates: EasyshipRate[] }>('rates', body)
    return (res.rates ?? []).map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  /**
   * `POST /labels` doesn't exist. Labels are created per-shipment:
   * `POST shipments/{shipment_id}/label` with `shipment_id` in the path (not
   * the body) and `printing_options.format` lowercase (png|pdf|url|zpl).
   */
  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const shipmentId = data.shipmentId ?? data.id
    if (!shipmentId) throw new Error('shipmentId is required to create a label')
    const client = new EasyshipClient(credentials, this.baseURL)
    const res = await client.post<EasyshipLabelResponse>(
      `shipments/${encodeURIComponent(shipmentId)}/label`,
      {
        courier_service_id: data.serviceCode ?? undefined,
        printing_options: { format: (data.format ?? 'PDF').toLowerCase() },
      },
    )
    return transformLabel(res)
  }

  // ── Carriers (couriers) ────────────────────────────────────────────────────

  /**
   * List couriers (carriers) activated on the Easyship account.
   * Endpoint: GET /couriers, paged by `page` + `per_page` (max 100);
   * `meta.pagination.next` is null on the last page.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new EasyshipClient(credentials, this.baseURL)
    const query = easyshipPageQuery(params)
    const res = await client.get<
      { couriers?: EasyshipCourier[]; data?: EasyshipCourier[] } & EasyshipListMeta
    >('couriers', query)
    reportEasyshipPage(params, query.per_page, res)
    const couriers = res.couriers ?? res.data ?? []
    return couriers.map(transformCarrier)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new EasyshipClient(credentials, this.baseURL)
    const res = await client.get<{ courier?: EasyshipCourier; data?: EasyshipCourier }>(`couriers/${id}`)
    const courier = res.courier ?? res.data ?? {}
    return transformCarrier(courier)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  /**
   * List end-of-day manifests.
   * Endpoint: GET /manifests, paged by `page` + `per_page` (max 100);
   * `meta.pagination.next` is null on the last page.
   */
  async listManifests(credentials: Credentials, params: QueryParams): Promise<Manifest[]> {
    const client = new EasyshipClient(credentials, this.baseURL)
    const query = easyshipPageQuery(params)
    const res = await client.get<
      { manifests?: EasyshipManifest[]; data?: EasyshipManifest[] } & EasyshipListMeta
    >('manifests', query)
    reportEasyshipPage(params, query.per_page, res)
    const manifests = res.manifests ?? res.data ?? []
    return manifests.map(transformManifest)
  }

  async getManifest(credentials: Credentials, id: string): Promise<Manifest> {
    const client = new EasyshipClient(credentials, this.baseURL)
    const res = await client.get<{ manifest?: EasyshipManifest; data?: EasyshipManifest }>(`manifests/${id}`)
    const manifest = res.manifest ?? res.data ?? {}
    return transformManifest(manifest)
  }

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new EasyshipClient(credentials, this.baseURL)
    const res = await client.post<{ manifest?: EasyshipManifest; data?: EasyshipManifest }>('manifests', {
      courier: data.carrierId,
      shipment_ids: data.shipmentIds,
    })
    const manifest = res.manifest ?? res.data ?? {}
    return transformManifest(manifest)
  }
}
