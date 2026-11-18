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
import type { Carrier } from '../../schema/carrier'
import type { Warehouse } from '../../schema/warehouse'

import { pageLocally } from '@opensteward/shared'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { SendcloudClient } from './client'

import { transformTracking, type SendcloudTrackingResponse } from './transform/tracking'
import { transformShipment, type SendcloudShipment } from './transform/shipment'
import { transformRate, type SendcloudRate } from './transform/rate'
import { transformLabel, type SendcloudLabel } from './transform/label'
import {
  groupShippingMethodsByCarrier,
  transformCarrier,
  type SendcloudShippingMethodsResponse,
  type SendcloudShippingMethod,
} from './transform/carrier'
import {
  transformWarehouse,
  type SendcloudSenderAddressesResponse,
  type SendcloudSenderAddress,
} from './transform/warehouse'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: manifest — Sendcloud v2 API has no manifest/end-of-day document endpoint
// Unavailable: order   — Sendcloud v2 has no standalone Orders API; orders are only
//                        accessible via GET /integrations/{id}/shipments which requires
//                        a platform-specific integration ID not available from credentials alone

interface SendcloudAdapterConfig {
  sandbox?: boolean
}

export class SendcloudAdapter implements LogisticsAdapter {
  readonly platform = 'sendcloud'
  readonly version = '1'

  constructor(_config: SendcloudAdapterConfig = {}) {}

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
    const client = new SendcloudClient(credentials)
    const raw = await client.get<SendcloudTrackingResponse>(`tracking/${encodeURIComponent(trackingNumber)}`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new SendcloudClient(credentials)
    const raw = await client.post<SendcloudShipment>('shipments', {
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            street1: data.originAddress.street1,
            street2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postal_code: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      recipient: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            street1: data.destinationAddress.street1,
            street2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
      reference: data.reference,
      service_code: data.serviceCode,
    })
    return transformShipment(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new SendcloudClient(credentials)
    const firstPkg = params.packages[0]
    const body = {
      from: {
        postal_code: params.originAddress.postalCode,
        country: params.originAddress.country,
      },
      to: {
        postal_code: params.destinationAddress.postalCode,
        country: params.destinationAddress.country,
      },
      weight: firstPkg?.weight?.value,
      weight_unit: firstPkg?.weight?.unit,
      length: firstPkg?.dimensions?.length,
      width: firstPkg?.dimensions?.width,
      height: firstPkg?.dimensions?.height,
      service_codes: params.serviceCodes,
    }
    const res = await client.post<{ rates: SendcloudRate[] }>('rates', body)
    return (res.rates ?? []).map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new SendcloudClient(credentials)
    const res = await client.post<SendcloudLabel>('labels', {
      shipment_id: data.shipmentId ?? data.id,
      format: data.format ?? 'PDF',
    })
    return transformLabel(res)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  // GET /shipping_methods without `limit` returns every method ("if not set all
  // results are returned"). Methods are grouped into carriers, so the grouped
  // collection is paged locally rather than paging methods upstream.
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new SendcloudClient(credentials)
    const res = await client.get<SendcloudShippingMethodsResponse>('shipping_methods')
    const methods: SendcloudShippingMethod[] = res.shipping_methods ?? []
    return pageLocally(groupShippingMethodsByCarrier(methods), params)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new SendcloudClient(credentials)
    const res = await client.get<{ shipping_method: SendcloudShippingMethod }>(
      `shipping_methods/${encodeURIComponent(id)}`,
    )
    return transformCarrier(res.shipping_method)
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────

  // GET /user/addresses/sender is unpaginated: it returns all saved sender
  // addresses, so the caller's page is sliced locally.
  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new SendcloudClient(credentials)
    const res = await client.get<SendcloudSenderAddressesResponse>('user/addresses/sender')
    const addresses: SendcloudSenderAddress[] = res.sender_addresses ?? []
    return pageLocally(addresses, params).map(transformWarehouse)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new SendcloudClient(credentials)
    const res = await client.get<{ sender_address: SendcloudSenderAddress }>(
      `user/addresses/sender/${encodeURIComponent(id)}`,
    )
    return transformWarehouse(res.sender_address)
  }
}
