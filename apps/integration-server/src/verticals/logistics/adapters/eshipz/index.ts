import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Rate } from '../../schema/rate'
import type { Carrier } from '../../schema/carrier'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { EshipzClient } from './client'
import { pageLocally } from '@opensteward/shared'

import {
  transformShipment,
  shipmentToCreateBody,
  type EshipzShipment,
} from './transform/shipment'
import { transformTracking, type EshipzTrackingRecord } from './transform/tracking'
import { transformRate, type EshipzServicesResponse, type EshipzRate } from './transform/rate'
import { transformCarrierFromRate } from './transform/carrier'

type EshipzAdapterConfig = Record<string, unknown>

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: label    — eShipz has no dedicated label-list endpoint; label URL
//                         is embedded in the shipment response (files.label.label_meta.url)
// Unavailable: manifest — eShipz marketing references handover manifests but no
//                         public REST endpoint exists for listing/creating manifests
// Unavailable: order    — eShipz supports orders conceptually but no public REST
//                         endpoint is documented for listing/creating orders via API
// Unavailable: warehouse — no pickup-location or warehouse listing endpoint is
//                          documented in the public eShipz API

// ── Response envelopes ────────────────────────────────────────────────────────

interface EshipzShipmentListResponse {
  data?: EshipzShipment[] | null
  [key: string]: unknown
}

interface EshipzCreateShipmentResponse {
  data?: EshipzShipment | null
  [key: string]: unknown
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class EshipzAdapter implements LogisticsAdapter {
  readonly platform = 'eshipz'
  readonly version = '1'

  private config: EshipzAdapterConfig

  constructor(config: EshipzAdapterConfig = {}) {
    this.config = config
    // Silence unused-var lint for config until extended
    void this.config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // code is the raw API token obtained from eShipz Settings
    return Promise.resolve(exchangeApiKey(code))
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new EshipzClient(credentials)
    const res = await client.getV1<EshipzShipmentListResponse>('get-shipments', {
      page: params.page ?? 1,
      limit: params.limit ?? 50,
    })
    return (res.data ?? []).map(transformShipment)
  }

  async getShipment(_credentials: Credentials, _id: string): Promise<Shipment> {
    // eShipz has no single-shipment GET endpoint; use listShipments with an ID filter instead.
    const err = new Error('getShipment is not supported by the eShipz API')
    ;(err as NodeJS.ErrnoException & { statusCode?: number }).statusCode = 501
    throw err
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new EshipzClient(credentials)
    const body = shipmentToCreateBody(data)
    const res = await client.postV1<EshipzCreateShipmentResponse>('create-shipments', body)
    const raw = res.data ?? (res as unknown as EshipzShipment)
    return transformShipment(raw as EshipzShipment)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new EshipzClient(credentials)
    await client.postV1<unknown>('cancel', { order_id: [id] })
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new EshipzClient(credentials)
    const records = await client.postV2<EshipzTrackingRecord[]>('trackings', {
      track_id: trackingNumber,
    })
    return transformTracking(Array.isArray(records) ? records : [], trackingNumber)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────
  //
  // eShipz has no dedicated carrier-list endpoint.  Carrier identity is
  // embedded in each rate entry (vendor_id, slug, description) returned by
  // POST /v2/services.  We fetch rates for a minimal sample parcel and
  // de-duplicate by slug to produce a carrier list.

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new EshipzClient(credentials)
    // Minimal probe body — origin/destination don't matter for carrier discovery
    const body = {
      is_document: false,
      shipment: {
        is_reverse: false,
        is_cod: false,
        collect_on_delivery: { amount: 0, currency: 'INR' },
        ship_from: { street1: '', city: '', state: '', postal_code: '', country: 'IN', phone: '', email: '' },
        ship_to: { street1: '', city: '', state: '', postal_code: '', country: 'IN', phone: '', email: '' },
        parcels: [{ weight: { value: 0.5, unit: 'kg' }, dimension: { length: 10, width: 10, height: 10, unit: 'cm' } }],
      },
    }
    const res = await client.postV2<EshipzServicesResponse>('services', body)
    const rates: EshipzRate[] = res.data?.rates ?? []
    const seen = new Set<string>()
    const carriers: Carrier[] = []
    for (const r of rates) {
      const key = r.slug ?? (r.vendor_id != null ? String(r.vendor_id) : null)
      if (!key || seen.has(key)) continue
      seen.add(key)
      carriers.push(transformCarrierFromRate(r))
    }
    // One unpaged response holds every carrier: page the whole list locally.
    return pageLocally(carriers, params)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new EshipzClient(credentials)
    const pkg = params.packages[0]
    const weightKg = pkg?.weight?.value ?? 0.5

    const body = {
      is_document: false,
      shipment: {
        is_reverse: false,
        is_cod: false,
        collect_on_delivery: { amount: 0, currency: 'INR' },
        ship_from: {
          street1: params.originAddress.street1 ?? '',
          city: params.originAddress.city ?? '',
          state: params.originAddress.state ?? '',
          postal_code: params.originAddress.postalCode ?? '',
          country: params.originAddress.country ?? '',
          phone: params.originAddress.phone ?? '',
          email: params.originAddress.email ?? '',
        },
        ship_to: {
          street1: params.destinationAddress.street1 ?? '',
          city: params.destinationAddress.city ?? '',
          state: params.destinationAddress.state ?? '',
          postal_code: params.destinationAddress.postalCode ?? '',
          country: params.destinationAddress.country ?? '',
          phone: params.destinationAddress.phone ?? '',
          email: params.destinationAddress.email ?? '',
        },
        parcels: [
          {
            weight: { value: weightKg, unit: 'kg' },
            dimension: pkg?.dimensions
              ? {
                  length: pkg.dimensions.length,
                  width: pkg.dimensions.width,
                  height: pkg.dimensions.height,
                  unit: pkg.dimensions.unit,
                }
              : { length: 10, width: 10, height: 10, unit: 'cm' },
          },
        ],
      },
    }

    const res = await client.postV2<EshipzServicesResponse>('services', body)
    const rates = res.data?.rates ?? []
    // Only return rates with code 200/201 (usable rates per eShipz docs)
    return rates
      .filter((r) => r.code === 200 || r.code === 201)
      .map(transformRate)
  }
}
