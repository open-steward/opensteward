// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   shipment, trackingevent, label, manifest
// Unavailable: carrier   — single-carrier API; no carrier listing endpoint
// Unavailable: order     — "orders" in DHL API = label-creation requests, not a
//                          separate order management resource (maps to shipments)
// Unavailable: rate      — no rate-shopping / pricing endpoint in the API
// Unavailable: warehouse — no warehouse management endpoint in the API

import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'

import { pageLocally } from '@opensteward/shared'
import { buildAuthUrl, exchangeCode as doExchange, refreshCredentials as doRefresh, ensureAuth } from './auth'
import { DhlParcelDeClient } from './client'
import { transformTracking, type DhlParcelDeTrackingResponse } from './transform/tracking'
import { transformShipment, type DhlParcelDeShipment } from './transform/shipment'
import { transformLabelResponse, type DhlParcelDeLabelDataResponse } from './transform/label'
import { transformManifest, type DhlParcelDeSingleManifestResponse } from './transform/manifest'

interface DhlParcelDeAdapterConfig {
  sandbox?: boolean
}

export class DhlParcelDeAdapter implements LogisticsAdapter {
  readonly platform = 'dhl-parcel-de'
  readonly version = '2'

  constructor(_config: DhlParcelDeAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const creds = await ensureAuth(credentials)
    const client = new DhlParcelDeClient(creds)
    const raw = await client.get<DhlParcelDeTrackingResponse>('tracking/v0/shipments', {
      trackingNumber,
    })
    return transformTracking(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const creds = await ensureAuth(credentials)
    const client = new DhlParcelDeClient(creds)
    const raw = await client.post<DhlParcelDeShipment>('shipping/v2/orders', {
      sender: data.originAddress,
      recipient: data.destinationAddress,
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
      reference: data.reference,
      serviceCode: data.serviceCode,
    })
    return transformShipment(raw)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  // GET /orders retrieves label documents for up to 30 shipment numbers. It has
  // no page, offset or cursor parameter and returns every requested shipment,
  // so the caller's page is sliced locally.

  async listLabels(credentials: Credentials, params: QueryParams): Promise<Label[]> {
    const creds = await ensureAuth(credentials)
    const client = new DhlParcelDeClient(creds)
    // params may carry shipmentNumbers as a comma-separated string or array
    const shipmentParam = params['shipmentNumbers'] ?? params['shipment']
    const shipment = Array.isArray(shipmentParam)
      ? shipmentParam
      : typeof shipmentParam === 'string'
        ? shipmentParam.split(',').map((s) => s.trim()).filter(Boolean)
        : []
    const raw = await client.get<DhlParcelDeLabelDataResponse>('orders', {
      shipment,
      includeDocs: 'URL',
    })
    return pageLocally(transformLabelResponse(raw), params)
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const creds = await ensureAuth(credentials)
    const client = new DhlParcelDeClient(creds)
    const raw = await client.get<DhlParcelDeLabelDataResponse>('orders', {
      shipment: [id],
      includeDocs: 'URL',
    })
    const labels = transformLabelResponse(raw)
    if (labels.length === 0) throw new Error(`Label not found: ${id}`)
    return labels[0]
  }

  // ── Manifests ──────────────────────────────────────────────────────────────
  // GET /manifests retrieves the daily closing manifest (optionally for a given date).
  // POST /manifests marks shipments as ready for shipping but returns per-shipment
  // statuses, not a manifest document — createManifest here triggers POST /manifests.

  async listManifests(credentials: Credentials, params: QueryParams): Promise<Manifest[]> {
    const creds = await ensureAuth(credentials)
    const client = new DhlParcelDeClient(creds)
    const date = typeof params['date'] === 'string' ? params['date'] : undefined
    const raw = await client.get<DhlParcelDeSingleManifestResponse>('manifests', {
      ...(date ? { date } : {}),
      includeDocs: 'URL',
    })
    // GET /manifests returns the one daily manifest and takes no paging
    // parameter, so page 2 onward is empty rather than a repeat of page 1.
    return pageLocally([transformManifest(raw)], params)
  }

  async getManifest(credentials: Credentials, id: string): Promise<Manifest> {
    // id = manifest date (YYYY-MM-DD) — the natural key for DHL manifests
    const creds = await ensureAuth(credentials)
    const client = new DhlParcelDeClient(creds)
    const raw = await client.get<DhlParcelDeSingleManifestResponse>('manifests', {
      date: id,
      includeDocs: 'URL',
    })
    return transformManifest(raw)
  }

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const creds = await ensureAuth(credentials)
    const client = new DhlParcelDeClient(creds)
    const shipmentNos = data.shipmentIds ?? []
    // POST /manifests marks the given shipments as ready for shipping
    await client.post('manifests', { shipmentNumbers: shipmentNos })
    // Return today's manifest after closing
    const raw = await client.get<DhlParcelDeSingleManifestResponse>('manifests', {
      includeDocs: 'URL',
    })
    return transformManifest(raw)
  }
}
