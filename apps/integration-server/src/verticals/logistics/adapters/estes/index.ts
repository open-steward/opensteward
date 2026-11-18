import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Carrier } from '../../schema/carrier'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { EstesClient } from './client'

import { transformShipment, type EstesPickupRequest } from './transform/shipment'
import { transformTracking, type EstesTrackingResponse } from './transform/tracking'
import { transformRate, type EstesRateResponse } from './transform/rate'
import { transformCarrier } from './transform/carrier'
import { transformLabel, type EstesBolResponse } from './transform/label'

// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: manifest — Estes has no manifest API; BOL is the equivalent document and is accessed via the BOL endpoint, not a manifest resource
// Unavailable: order    — Estes is an LTL freight carrier, not an order management system; no order endpoint exists
// Unavailable: warehouse — Estes has no warehouse management API; they are a carrier, not a WMS

interface EstesAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class EstesAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'estes'
  readonly version = '1'

  constructor(_config: EstesAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Estes the "code" is the "username:password" pair.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new EstesClient(credentials)
    const raw = await client.get<EstesTrackingResponse>('shipments/history', {
      pro: trackingNumber,
    })
    return transformTracking(raw, trackingNumber)
  }

  // ── Shipments (Estes "pickup requests" map to canonical Shipments) ────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new EstesClient(credentials)
    const raw = await client.post<EstesPickupRequest>('pickup-requests', {
      shipper: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            addressLine1: data.originAddress.street1,
            addressLine2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postalCode: data.originAddress.postalCode,
            country: data.originAddress.country,
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
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      totalWeight: data.totalWeight?.value,
      weightUnit: data.totalWeight?.unit ?? 'lb',
      totalPieces: data.packages?.length ?? 1,
      serviceLevel: data.serviceCode,
      reference: data.reference,
    })
    return transformShipment(raw)
  }

  // ── Carriers (derived — Estes is a single LTL carrier; no list endpoint) ──

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return [transformCarrier()]
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    return transformCarrier()
  }

  // ── Labels (derived from POST /v1/bol with images.includeShippingLabels) ──

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new EstesClient(credentials)
    const raw = await client.post<EstesBolResponse>('bol', {
      referenceNumbers: {
        pro: data.trackingNumber,
      },
      images: {
        includeBol: false,
        includeShippingLabels: true,
        shippingLabels: {
          format: data.format ?? 'PDF',
          quantity: 1,
          position: 1,
        },
      },
    })
    return transformLabel(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new EstesClient(credentials)
    const pkg = params.packages[0]
    const raw = await client.post<EstesRateResponse>('rating-services/v4.0/rates', {
      originPoint: {
        city: params.originAddress.city,
        stateProvince: params.originAddress.state,
        postalCode: params.originAddress.postalCode,
        countryCode: params.originAddress.country ?? 'US',
      },
      destinationPoint: {
        city: params.destinationAddress.city,
        stateProvince: params.destinationAddress.state,
        postalCode: params.destinationAddress.postalCode,
        countryCode: params.destinationAddress.country ?? 'US',
      },
      commodity: {
        weight: pkg?.weight?.value,
        weightUnit: pkg?.weight?.unit ?? 'lb',
        pieces: params.packages.length,
      },
    })
    return (raw.data?.quotes ?? []).map(transformRate)
  }
}
