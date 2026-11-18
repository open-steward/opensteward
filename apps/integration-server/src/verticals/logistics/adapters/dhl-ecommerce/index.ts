import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { DhlEcommerceClient } from './client'
import { transformTracking, type DhlEcommerceTrackingResponse } from './transform/tracking'
import { transformShipment, type DhlEcommerceShipment } from './transform/shipment'
import { transformLabel, type DhlEcommerceLabel } from './transform/label'
import { transformManifest, type DhlEcommerceManifest } from './transform/manifest'
import { transformRate, type DhlEcommerceProduct } from './transform/rate'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — DHL eCommerce Americas has no carrier listing endpoint;
//                          the platform itself is the single carrier (no /carriers resource)
// Unavailable: order     — The DHL eCommerce Americas API has no order management
//                          endpoints; it is label/manifest/tracking-only
// Unavailable: warehouse — The DHL eCommerce Americas API has no warehouse management
//                          endpoints

interface DhlEcommerceAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class DhlEcommerceAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'dhl-ecommerce'
  readonly version = '1'

  constructor(_config: DhlEcommerceAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking ───────────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new DhlEcommerceClient(credentials)
    const raw = await client.get<DhlEcommerceTrackingResponse>('tracking/v4/package', {
      trackingNumber,
    })
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new DhlEcommerceClient(credentials)
    const raw = await client.post<DhlEcommerceShipment>('shipping/v4/label', {
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

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new DhlEcommerceClient(credentials)
    const raw = await client.post<DhlEcommerceLabel>('shipping/v4/label', {
      packageId: data.id,
      orderedProductId: data.serviceCode,
      trackingId: data.trackingNumber,
    })
    return transformLabel(raw)
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new DhlEcommerceClient(credentials)
    const raw = await client.get<DhlEcommerceLabel>(`shipping/v4/label/${id}`)
    return transformLabel(raw)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new DhlEcommerceClient(credentials)
    await client.delete(`shipping/v4/label/${id}`)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new DhlEcommerceClient(credentials)
    // POST returns { requestId, pickup, status }; poll GET to get documents
    const raw = await client.post<DhlEcommerceManifest>('shipping/v4/manifest', {
      pickup: data.id,
      packageIds: data.shipmentIds,
    })
    return transformManifest(raw)
  }

  async getManifest(credentials: Credentials, id: string): Promise<Manifest> {
    // id expected as "<pickup>/<requestId>"
    const client = new DhlEcommerceClient(credentials)
    const raw = await client.get<DhlEcommerceManifest>(`shipping/v4/manifest/${id}`)
    return transformManifest(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new DhlEcommerceClient(credentials)
    const products = await client.post<DhlEcommerceProduct[]>('shipping/v4/products', {
      labelRequest: {
        pickup: undefined,
        distributionCenter: undefined,
        shipToAddress: {
          name: params.destinationAddress.name,
          address1: params.destinationAddress.street1,
          address2: params.destinationAddress.street2,
          city: params.destinationAddress.city,
          state: params.destinationAddress.state,
          postalCode: params.destinationAddress.postalCode,
          country: params.destinationAddress.country,
        },
        packages: params.packages.map((pkg) => ({
          weight: pkg.weight?.value,
          weightUom: pkg.weight?.unit ?? 'oz',
        })),
        orderedProductId: params.serviceCodes?.[0],
      },
      rate: true,
      estimatedDeliveryDate: true,
    })
    return (Array.isArray(products) ? products : []).map(transformRate)
  }
}
