// ── Resource coverage ──────────────────────────────────────────────
// Available:   shipment, trackingevent, rate, label, manifest
// Unavailable: carrier  — Purolator is a single carrier; no carrier-list endpoint exists
// Unavailable: order    — Purolator has no order-management concept in its API
// Unavailable: warehouse — Purolator exposes no warehouse/depot-list endpoint

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
import type { Manifest } from '../../schema/manifest'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { PurolatorClient } from './client'

import { transformTracking, type PurolatorTrackingResponse } from './transform/tracking'
import { transformShipment, type PurolatorShipment } from './transform/shipment'
import {
  transformRates,
  type PurolatorGetFullEstimateResponse,
} from './transform/rate'
import {
  transformLabels,
  type PurolatorGetDocumentsResponse,
} from './transform/label'
import {
  transformManifests,
  type PurolatorGetShipmentManifestDocumentResponse,
} from './transform/manifest'

interface PurolatorAdapterConfig {
  sandbox?: boolean
}

export class PurolatorAdapter implements LogisticsAdapter {
  readonly platform = 'purolator'
  readonly version = '1'

  constructor(_config: PurolatorAdapterConfig = {}) {}

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
    const client = new PurolatorClient(credentials)
    const raw = await client.post<PurolatorTrackingResponse>(
      'EWS/V2/Tracking/TrackingService.asmx',
      { PIN: trackingNumber },
    )
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new PurolatorClient(credentials)
    const raw = await client.post<PurolatorShipment>('EWS/V2/Shipping/ShippingService.asmx', {
      SenderInformation: data.originAddress
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
      ReceiverInformation: data.destinationAddress
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
      TotalWeight: data.totalWeight?.value,
      WeightUnit: data.totalWeight?.unit,
      Reference: data.reference,
      ServiceID: data.serviceCode,
    })
    return transformShipment(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new PurolatorClient(credentials)
    const raw = await client.post<PurolatorGetFullEstimateResponse>(
      'EWS/V2/Estimating/EstimatingService.asmx',
      {
        origin: params.originAddress,
        destination: params.destinationAddress,
        packages: params.packages,
        ShowAlternativeServicesIndicator: true,
      },
    )
    return transformRates(raw)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new PurolatorClient(credentials)
    const raw = await client.post<PurolatorGetDocumentsResponse>(
      'EWS/V2/Shipping/ShippingDocumentsService.asmx',
      {
        DocumentCriterium: {
          DocumentCriteria: [
            {
              PIN: { Value: id },
              DocumentTypes: { DocumentType: ['Label'] },
            },
          ],
        },
      },
    )
    const labels = transformLabels(raw)
    if (labels.length === 0) throw new Error(`No label found for PIN ${id}`)
    return labels[0]
  }

  async listLabels(credentials: Credentials, params: QueryParams): Promise<Label[]> {
    const client = new PurolatorClient(credentials)
    const pins: string[] = Array.isArray((params as Record<string, unknown>).pins)
      ? ((params as Record<string, unknown>).pins as string[])
      : []
    const raw = await client.post<PurolatorGetDocumentsResponse>(
      'EWS/V2/Shipping/ShippingDocumentsService.asmx',
      {
        DocumentCriterium: {
          DocumentCriteria: pins.map((pin) => ({
            PIN: { Value: pin },
            DocumentTypes: { DocumentType: ['Label'] },
          })),
        },
      },
    )
    return transformLabels(raw)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async getManifest(credentials: Credentials, id: string): Promise<Manifest> {
    const client = new PurolatorClient(credentials)
    const raw = await client.post<PurolatorGetShipmentManifestDocumentResponse>(
      'EWS/V2/Shipping/ShippingDocumentsService.asmx',
      {
        ShipmentManifestDocumentCriterium: {
          ShipmentManifestDocumentCriteria: [{ ManifestDate: id }],
        },
      },
    )
    const manifests = transformManifests(raw)
    if (manifests.length === 0) throw new Error(`No manifest found for date ${id}`)
    return manifests[0]
  }

  async listManifests(credentials: Credentials, params: QueryParams): Promise<Manifest[]> {
    const client = new PurolatorClient(credentials)
    const dates: string[] = Array.isArray((params as Record<string, unknown>).dates)
      ? ((params as Record<string, unknown>).dates as string[])
      : []
    const raw = await client.post<PurolatorGetShipmentManifestDocumentResponse>(
      'EWS/V2/Shipping/ShippingDocumentsService.asmx',
      {
        ShipmentManifestDocumentCriterium: {
          ShipmentManifestDocumentCriteria: dates.map((d) => ({ ManifestDate: d })),
        },
      },
    )
    return transformManifests(raw)
  }
}
