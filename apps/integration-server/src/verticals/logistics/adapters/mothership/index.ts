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

import { credentialsFromApiKey } from './auth'
import { MothershipClient } from './client'

import {
  transformShipment,
  unwrapShipment,
  type MothershipShipmentDataWrapper,
  type MothershipShipmentResponse,
} from './transform/shipment'
import { transformTrackingEvents, type MothershipTrackingResponse } from './transform/tracking'
import { transformRate, unwrapQuote, type MothershipQuoteResponse } from './transform/rate'
import {
  transformLabel,
  unwrapDocuments,
  type MothershipDocumentListResponse,
} from './transform/label'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Mothership exposes carriers only as a static SCAC lookup table embedded in quote responses; no /carriers endpoint exists.
// Unavailable: manifest  — Mothership has no manifest concept or endpoint in its API.
// Unavailable: order     — Mothership has no order management in its API; shipments are booked directly from quotes.
// Unavailable: warehouse — The deprecated /places endpoints are address-lookup utilities, not warehouse management.

export interface MothershipAdapterConfig {
  /** Static Bearer token obtained from dashboard.mothership.build/settings/api */
  apiKey?: string
}

export class MothershipAdapter implements LogisticsAdapter {
  readonly platform = 'mothership'
  readonly version = '1'

  private config: MothershipAdapterConfig

  constructor(config: MothershipAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────
  // Mothership uses static API keys — no OAuth dance required.

  getAuthUrl(_state: string): string {
    return 'https://dashboard.mothership.build/settings/api'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.apiKey) {
      throw new Error('mothership: apiKey is required')
    }
    return credentialsFromApiKey(this.config.apiKey)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static tokens do not expire — return as-is
    return credentials
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new MothershipClient(credentials)
    const res = await client.get<{ data?: { results?: MothershipShipmentResponse[] } }>('/shipments', {
      page: params.page ?? 1,
      perPage: params.limit ?? 25,
    })
    const rows = res.data?.results ?? []
    return rows.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new MothershipClient(credentials)
    const res = await client.get<MothershipShipmentDataWrapper>(`/shipments/${id}`)
    return transformShipment(unwrapShipment(res))
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new MothershipClient(credentials)

    // Mothership requires a quoteId + rateId to create a shipment.
    // These must be passed in the metadata/extra fields of the canonical Shipment.
    const extra = data as Record<string, unknown>
    const body = {
      quoteId: extra.quoteId ?? undefined,
      rateId: extra.rateId ?? undefined,
    }

    const res = await client.post<MothershipShipmentDataWrapper>('/shipments', body)
    return transformShipment(unwrapShipment(res))
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new MothershipClient(credentials)
    await client.post<unknown>(`/shipments/${id}/cancel`, {
      reason: 'ShipmentNotNeeded',
    })
  }

  // ── Labels (derived from shipment documents) ───────────────────────────────
  // Mothership is LTL freight and does not issue parcel shipping labels.
  // Shipment documents (Bill of Lading, Proof of Delivery) are returned by
  // GET /documents/{shipmentId} and mapped to the canonical Label resource.

  async listLabels(credentials: Credentials, params: QueryParams): Promise<Label[]> {
    // Mothership does not have a paginated labels endpoint; we need a shipment ID.
    // Fallback: list shipments then fetch documents for each.
    const client = new MothershipClient(credentials)
    const res = await client.get<{ data?: { results?: MothershipShipmentResponse[] } }>(
      '/shipments',
      { page: params.page ?? 1, perPage: params.limit ?? 25 },
    )
    const shipments = res.data?.results ?? []
    const labels: Label[] = []
    for (const shipment of shipments) {
      if (!shipment.id) continue
      const docRes = await client.get<MothershipDocumentListResponse>(
        `/documents/${shipment.id}`,
      )
      const docs = unwrapDocuments(docRes)
      labels.push(...docs.map((d) => transformLabel(d, shipment.id as string)))
    }
    return labels
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    // `id` is expected to be a shipment ID; returns the first BOL document.
    const client = new MothershipClient(credentials)
    const docRes = await client.get<MothershipDocumentListResponse>(`/documents/${id}`)
    const docs = unwrapDocuments(docRes)
    const doc = docs[0]
    if (!doc) {
      throw new Error(`mothership: no documents found for shipment ${id}`)
    }
    return transformLabel(doc, id)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, shipmentId: string): Promise<TrackingEvent[]> {
    const client = new MothershipClient(credentials)
    const res = await client.get<MothershipTrackingResponse>(`/tracking/${shipmentId}`)
    return transformTrackingEvents(res, shipmentId)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new MothershipClient(credentials)

    // Mothership quote body — uses `street`/`zip` (not street1/postalCode)
    const body = {
      pickup: {
        name: params.originAddress.company ?? params.originAddress.name,
        street: params.originAddress.street1,
        city: params.originAddress.city,
        state: params.originAddress.state,
        zip: params.originAddress.postalCode,
        phoneNumber: params.originAddress.phone,
      },
      delivery: {
        name: params.destinationAddress.company ?? params.destinationAddress.name,
        street: params.destinationAddress.street1,
        city: params.destinationAddress.city,
        state: params.destinationAddress.state,
        zip: params.destinationAddress.postalCode,
        phoneNumber: params.destinationAddress.phone,
      },
      freight: params.packages.map((pkg, i) => ({
        quantity: 1,
        type: 'Pallet',
        description: pkg.reference ?? `Item ${i + 1}`,
        weight: pkg.weight?.value ?? 0,
        length: pkg.dimensions?.length ?? 48,
        width: pkg.dimensions?.width ?? 40,
        height: pkg.dimensions?.height ?? 48,
      })),
      pickupReadyDate: {
        date: new Date().toISOString().slice(0, 10),
        time: '0800',
      },
    }

    const res = await client.post<MothershipQuoteResponse>('/quotes', body)
    const { quoteId, rates } = unwrapQuote(res)
    return rates.map((r) => transformRate(r, quoteId))
  }
}
