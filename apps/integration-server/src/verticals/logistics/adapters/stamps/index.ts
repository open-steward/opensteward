import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'
import type { Manifest } from '../../schema/manifest'

import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefresh,
} from './auth'
import { StampsClient } from './client'
import { pageLocally } from '@opensteward/shared'

import { transformRate, type SeraRate } from './transform/rate'
import { transformLabel, type SeraLabelResponse } from './transform/label'
import { transformTrackingEvents, type SeraTrackingResponse } from './transform/tracking'
import { transformCarrier, type SeraCarrierServicesResponse } from './transform/carrier'
import { transformManifest, type SeraManifestResponse } from './transform/manifest'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: order     — SERA has no order management concept; it is a label/shipping API only
// Unavailable: shipment  — SERA has no shipment records endpoint; labels are the equivalent resource
// Unavailable: warehouse — SERA has no warehouse concept or endpoint

export interface StampsAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

export class StampsAdapter implements LogisticsAdapter {
  readonly platform = 'stamps'
  readonly version = '1'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: StampsAdapterConfig = {}) {
    this.clientId = config.clientId ?? ''
    this.clientSecret = config.clientSecret ?? ''
    this.redirectUri = config.redirectUri ?? ''
    this.scopes = config.scopes ?? []
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, state, overrideScopes ?? this.scopes)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new StampsClient(credentials)
    const res = await client.post<SeraRate[]>('/v1/rates', {
      from_address: toSeraAddress(params.originAddress),
      to_address: toSeraAddress(params.destinationAddress),
      package: params.packages[0]
        ? {
            weight: params.packages[0].weight
              ? { value: params.packages[0].weight.value, unit: params.packages[0].weight.unit }
              : undefined,
            dimensions: params.packages[0].dimensions
              ? {
                  length: params.packages[0].dimensions.length,
                  width: params.packages[0].dimensions.width,
                  height: params.packages[0].dimensions.height,
                  unit: params.packages[0].dimensions.unit,
                }
              : undefined,
          }
        : undefined,
    })
    return (res ?? []).map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    // SERA does not have a GET label endpoint; re-fetch is not supported.
    // Callers should store the label response from createLabel.
    throw new Error(`stamps: getLabel is not supported by SERA (label_id: ${id})`)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new StampsClient(credentials)
    const body: Record<string, unknown> = {
      ...(data.metadata as Record<string, unknown> | undefined),
    }
    const raw = await client.post<SeraLabelResponse>('/v1/labels', body)
    return transformLabel(raw)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new StampsClient(credentials)
    await client.put<unknown>(`/v1/labels/${id}/void`)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * SERA's `GET /v1/tracking` accepts an optional `carrier` alongside
   * `tracking_number`, to disambiguate numbers that collide across carriers.
   * It is a recommendation rather than a requirement, so it is forwarded only
   * when the caller supplies one.
   *
   * A blank hint is dropped rather than passed through: sending `carrier=`
   * would read as a filter on the empty carrier, not as no filter.
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
    carrier?: string,
  ): Promise<TrackingEvent[]> {
    const client = new StampsClient(credentials)
    const hint = carrier?.trim()
    const res = await client.get<SeraTrackingResponse>('/v1/tracking', {
      tracking_number: trackingNumber,
      ...(hint ? { carrier: hint } : {}),
    })
    return transformTrackingEvents(res, trackingNumber)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  /**
   * SERA's `GET /v1/carrier-services` ("Get All Available Carrier Services")
   * takes only an optional `ship_date` query parameter and returns the whole
   * `shipping_options` array with no page, offset or cursor, so the caller's
   * page is sliced locally from the one response.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new StampsClient(credentials)
    const res = await client.get<SeraCarrierServicesResponse>('/v1/carrier-services')
    return pageLocally((res?.shipping_options ?? []).map(transformCarrier), params)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new StampsClient(credentials)
    const body: Record<string, unknown> = {
      ...(data.metadata as Record<string, unknown> | undefined),
    }
    const raw = await client.post<SeraManifestResponse>('/v1/manifests', body)
    return transformManifest(raw)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toSeraAddress(addr: {
  name?: string
  company?: string
  street1?: string
  street2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  phone?: string
  email?: string
}): Record<string, string | undefined> {
  return {
    name: addr.name,
    company_name: addr.company,
    address_line1: addr.street1,
    address_line2: addr.street2,
    city: addr.city,
    state_province: addr.state,
    postal_code: addr.postalCode,
    country_code: addr.country,
    phone: addr.phone,
    email: addr.email,
  }
}
