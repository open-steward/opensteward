// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — USPS is a single carrier; no carrier-listing endpoint exists in the USPS REST API
// Unavailable: order     — USPS has no order-management concept or endpoint
// Unavailable: shipment  — USPS REST API has no shipment CRUD endpoint (labels are the unit of dispatch)
// Unavailable: warehouse — USPS has no warehouse or origin-location management endpoint
// Available:   pickup    — create/get/cancel over pickup/v3/carrier-pickup (Carrier Pickup v3).
//                          No listPickups: USPS only looks a pickup up by confirmation number and
//                          exposes nothing that enumerates them. Not yet declared in metadata.ts —
//                          the metadata PR owns that.

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  PickupRequestParams,
  PickupCancelParams,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'
import type { Pickup } from '../../schema/pickup'

import { buildAuthUrl, exchangeCode as doExchange, refreshCredentials as doRefresh } from './auth'
import { USPSClient } from './client'

import { transformTracking, type USPSTrackingResponse } from './transform/tracking'
import { transformRateResponse, type USPSRateResponse } from './transform/rate'
import { transformLabel as doTransformLabel, type USPSLabelMetadata } from './transform/label'
import { transformManifest, type USPSScanFormResponse } from './transform/manifest'
import {
  buildPickupRequest,
  transformPickup,
  transformCancelledPickup,
  type USPSPickupConfirmation,
} from './transform/pickup'

interface USPSAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class USPSAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'usps'
  readonly version = '1'

  constructor(_config: USPSAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return doExchange(code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new USPSClient(credentials)
    const raw = await client.get<USPSTrackingResponse>(
      `tracking/v3/tracking/${trackingNumber}`,
      { expand: 'DETAIL' },
    )
    return transformTracking(raw, trackingNumber)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new USPSClient(credentials)
    const pkg = params.packages[0]
    if (!pkg) throw new Error('usps: at least one package is required for rate quotes')
    if (!pkg.weight?.value) throw new Error('usps: package weight is required for rate quotes')
    const raw = await client.post<USPSRateResponse>('prices/v3/total-rates/search', {
      originZIPCode: params.originAddress.postalCode,
      destinationZIPCode: params.destinationAddress.postalCode,
      weight: pkg.weight.value,
      length: pkg.dimensions?.length ?? 1,
      width: pkg.dimensions?.width ?? 1,
      height: pkg.dimensions?.height ?? 1,
      priceType: 'RETAIL',
      mailingDate: new Date().toISOString().slice(0, 10),
    })
    return transformRateResponse(raw)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new USPSClient(credentials)
    const imageType = data.format === 'ZPL' ? 'ZPL203DPI' : 'PDF'
    const raw = await client.post<USPSLabelMetadata>('labels/v3/label', {
      imageInfo: {
        imageType,
        labelType: '4X6LABEL',
      },
      toAddress: data.metadata && (data.metadata as Record<string, unknown>).toAddress,
      fromAddress: data.metadata && (data.metadata as Record<string, unknown>).fromAddress,
      packageDescription: data.metadata && (data.metadata as Record<string, unknown>).packageDescription,
    })
    return doTransformLabel(raw, imageType)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new USPSClient(credentials)
    await client.delete(`labels/v3/label/${id}`)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new USPSClient(credentials)
    const trackingNumbers = (data.shipmentIds ?? [])
    const raw = await client.post<USPSScanFormResponse>('scan-forms/v3/scan-form', {
      form: '5630',
      imageType: 'PDF',
      labelType: '8.5x11LABEL',
      mailingDate: new Date().toISOString().slice(0, 10),
      shipment: { trackingNumbers },
    })
    return transformManifest(raw)
  }

  // ── Pickups ────────────────────────────────────────────────────────────────

  async createPickup(credentials: Credentials, data: PickupRequestParams): Promise<Pickup> {
    const client = new USPSClient(credentials)
    const raw = await client.post<USPSPickupConfirmation>(
      'pickup/v3/carrier-pickup',
      buildPickupRequest(data),
    )
    if (!raw?.confirmationNumber)
      throw new Error('usps: carrier-pickup returned no confirmationNumber')
    return transformPickup(raw)
  }

  async getPickup(credentials: Credentials, id: string): Promise<Pickup> {
    const client = new USPSClient(credentials)
    // The spec types this 200 as an array of PickupConfirmation even though
    // the path names a single confirmation number; accept either shape.
    const raw = await client.get<USPSPickupConfirmation[] | USPSPickupConfirmation>(
      `pickup/v3/carrier-pickup/${id}`,
    )
    const record = Array.isArray(raw) ? raw[0] : raw
    if (!record?.confirmationNumber)
      throw new Error(`usps: no carrier pickup found for confirmation number ${id}`)
    return transformPickup(record)
  }

  async cancelPickup(
    credentials: Credentials,
    id: string,
    data?: PickupCancelParams,
  ): Promise<Pickup> {
    const client = new USPSClient(credentials)
    // 200 with no body. `If-Match` is optional on DELETE (required only on PUT).
    await client.delete(`pickup/v3/carrier-pickup/${id}`)
    return transformCancelledPickup(id, data)
  }
}
