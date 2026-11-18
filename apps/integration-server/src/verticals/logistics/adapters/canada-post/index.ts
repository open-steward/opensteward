// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: carrier   — Canada Post IS the single carrier; no API to list carriers
// Unavailable: label     — Labels are binary artifacts (PDF/ZPL) returned via
//                          GET /ers/artifact/… link; no structured label list/get endpoint
// Unavailable: order     — Canada Post has no order-management concept or endpoint
// Unavailable: warehouse — Canada Post has no warehouse concept or endpoint

import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Manifest } from '../../schema/manifest'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { CanadaPostClient } from './client'

import { transformTracking, type CanadaPostTrackingResponse } from './transform/tracking'
import { transformShipment, type CanadaPostShipment } from './transform/shipment'
import { transformRateResponse, type CanadaPostRateResponse } from './transform/rate'
import {
  transformManifest,
  transformManifestListLink,
  type CanadaPostManifest,
} from './transform/manifest'

interface CanadaPostAdapterConfig {
  customerNumber?: string
  sandbox?: boolean
}

export class CanadaPostAdapter implements LogisticsAdapter {
  readonly platform = 'canada-post'
  readonly version = '1'

  private customerNumber: string

  constructor(config: CanadaPostAdapterConfig = {}) {
    this.customerNumber = config.customerNumber ?? ''
  }

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

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new CanadaPostClient(credentials)
    const raw = await client.get<CanadaPostTrackingResponse>(
      `vis/track/pin/${encodeURIComponent(trackingNumber)}/summary`,
    )
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new CanadaPostClient(credentials)
    const raw = await client.post<CanadaPostShipment>(
      `rs/${encodeURIComponent(this.customerNumber)}/shipment`,
      {
        sender: data.originAddress
          ? {
              name: data.originAddress.name,
              company: data.originAddress.company,
              street1: data.originAddress.street1,
              street2: data.originAddress.street2,
              city: data.originAddress.city,
              state: data.originAddress.state,
              postalCode: data.originAddress.postalCode,
              country: data.originAddress.country,
              phone: data.originAddress.phone,
              email: data.originAddress.email,
            }
          : undefined,
        delivery: data.destinationAddress
          ? {
              name: data.destinationAddress.name,
              company: data.destinationAddress.company,
              street1: data.destinationAddress.street1,
              street2: data.destinationAddress.street2,
              city: data.destinationAddress.city,
              state: data.destinationAddress.state,
              postalCode: data.destinationAddress.postalCode,
              country: data.destinationAddress.country,
              phone: data.destinationAddress.phone,
              email: data.destinationAddress.email,
            }
          : undefined,
        weight: data.totalWeight
          ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
          : undefined,
        reference: data.reference,
        'service-code': data.serviceCode,
      },
    )
    return transformShipment(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new CanadaPostClient(credentials)
    const raw = await client.post<CanadaPostRateResponse>(
      `rs/ship/price`,
      {
        origin: params.originAddress,
        destination: params.destinationAddress,
        packages: params.packages,
        serviceCodes: params.serviceCodes,
      },
    )
    return transformRateResponse(raw)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async listManifests(credentials: Credentials, params: QueryParams): Promise<Manifest[]> {
    const client = new CanadaPostClient(credentials)
    // GET /rs/{customer}/{mobo}/manifest?start=YYYYMMDD&end=YYYYMMDD
    // Response: { manifests: { link: [...] } }
    const raw = await client.get<{ manifests?: { link?: unknown | unknown[] } }>(
      `rs/${encodeURIComponent(this.customerNumber)}/${encodeURIComponent(this.customerNumber)}/manifest`,
      params as Record<string, unknown>,
    )
    const linkOrArray = raw.manifests?.link
    if (!linkOrArray) return []
    const links = Array.isArray(linkOrArray) ? linkOrArray : [linkOrArray]
    return links.map((l) => transformManifestListLink(l as { href: string }))
  }

  async getManifest(credentials: Credentials, id: string): Promise<Manifest> {
    const client = new CanadaPostClient(credentials)
    // GET /rs/{customer}/{mobo}/manifest/{manifestid}
    const raw = await client.get<CanadaPostManifest>(
      `rs/${encodeURIComponent(this.customerNumber)}/${encodeURIComponent(this.customerNumber)}/manifest/${encodeURIComponent(id)}`,
    )
    return transformManifest(raw)
  }
}
