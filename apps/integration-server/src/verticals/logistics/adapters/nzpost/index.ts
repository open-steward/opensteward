// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — NZ Post is a single national postal carrier; no carrier list endpoint exists
// Unavailable: order     — NZ Post provides no order management API
// Unavailable: warehouse — NZ Post exposes no depot/facility management endpoint

import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'

import axios from 'axios'
import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh, authHeader } from './auth'
import { NZPostClient } from './client'

import { transformTrackingEvents, type NZPostTrackingResponse } from './transform/tracking'
import { transformShipment, type NZPostShipmentResponse } from './transform/shipment'
import { transformRate, type NZPostRatesResponse } from './transform/rate'
import { transformLabel, type NZPostLabelCreateResponse } from './transform/label'
import { transformManifest, type NZPostManifestResponse } from './transform/manifest'

// ParcelLabel API uses a separate base URL from the Shipping v2 API.
const PARCELLABEL_BASE = 'https://api.nzpost.co.nz/parcellabel/v3'

export interface NZPostAdapterConfig {
  clientId?: string
  clientSecret?: string
}

export class NZPostAdapter implements LogisticsAdapter {
  readonly platform = 'nzpost'
  readonly version = '1'

  private config: NZPostAdapterConfig

  constructor(config: NZPostAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('nzpost: clientId and clientSecret are required')
    }
    return exchangeCredentials({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new NZPostClient(credentials)

    const body = {
      origin: {
        postalCode: params.originAddress.postalCode,
        country: params.originAddress.country,
      },
      destination: {
        postalCode: params.destinationAddress.postalCode,
        country: params.destinationAddress.country,
      },
      weight: params.packages[0]?.weight
        ? { value: params.packages[0].weight.value, unit: params.packages[0].weight.unit }
        : undefined,
    }

    const res = await client.post<NZPostRatesResponse>('/rates', body)
    return (res.rates ?? []).map(transformRate)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new NZPostClient(credentials)
    const res = await client.get<NZPostTrackingResponse>(`/tracking/${trackingNumber}`)
    return transformTrackingEvents(res)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new NZPostClient(credentials)

    const body = {
      serviceCode: data.serviceCode,
      sender: {
        name: data.originAddress?.name,
        company: data.originAddress?.company,
        addressLine1: data.originAddress?.street1,
        addressLine2: data.originAddress?.street2,
        city: data.originAddress?.city,
        region: data.originAddress?.state,
        postCode: data.originAddress?.postalCode,
        countryCode: data.originAddress?.country,
        phone: data.originAddress?.phone,
        email: data.originAddress?.email,
      },
      receiver: {
        name: data.destinationAddress?.name,
        company: data.destinationAddress?.company,
        addressLine1: data.destinationAddress?.street1,
        addressLine2: data.destinationAddress?.street2,
        city: data.destinationAddress?.city,
        region: data.destinationAddress?.state,
        postCode: data.destinationAddress?.postalCode,
        countryCode: data.destinationAddress?.country,
        phone: data.destinationAddress?.phone,
        email: data.destinationAddress?.email,
      },
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
    }

    const res = await client.post<NZPostShipmentResponse>('/parcels', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new NZPostClient(credentials)
    await client.delete(`/parcels/${id}`)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  // ParcelLabel API v3: POST /parcellabel/v3/labels
  // Uses a separate base URL from the Shipping v2 API — must call axios directly.
  // Response includes consignment_id; consignment_url is derived for PDF download.

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const body = {
      carrier: 'COURIERPOST',
      parcel_details: [{ service_code: data.serviceCode }],
    }
    const { data: res } = await axios.post<NZPostLabelCreateResponse>(
      `${PARCELLABEL_BASE}/labels`,
      body,
      { headers: { Authorization: authHeader(credentials.accessToken), 'Content-Type': 'application/json' } },
    )
    if (!res.consignment_url && res.consignment_id) {
      ;(res as Record<string, unknown>).consignment_url =
        `${PARCELLABEL_BASE}/labels/${res.consignment_id}?format=PDF`
    }
    return transformLabel(res)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────
  // Derived: same POST /parcellabel/v3/labels endpoint with manifest_only: true.
  // No label PDF is generated; manifest data is submitted to NZ Post.

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const body = {
      carrier: 'COURIERPOST',
      manifest_only: true,
      parcel_details: (data.shipmentIds ?? []).map((trackingNumber) => ({
        tracking_number: trackingNumber,
      })),
    }
    const { data: res } = await axios.post<NZPostManifestResponse>(
      `${PARCELLABEL_BASE}/labels`,
      body,
      { headers: { Authorization: authHeader(credentials.accessToken), 'Content-Type': 'application/json' } },
    )
    return transformManifest(res)
  }
}
