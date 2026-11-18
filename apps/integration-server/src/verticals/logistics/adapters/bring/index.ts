// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Bring is the sole carrier; no carrier-listing endpoint exists
// Unavailable: label     — Labels are embedded in booking response only; no standalone label API
// Unavailable: manifest  — No manifest endpoint in the Bring API
// Unavailable: warehouse — Warehousing API is write-only (send orders); no GET for warehouse info

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { BringClient } from './client'

import { transformTracking, type BringTrackingResponse } from './transform/tracking'
import { transformShipment, type BringBookingResponse } from './transform/shipment'
import { transformRates, type BringShippingGuideResponse } from './transform/rate'
import { transformOrder, type BringOrderResponse } from './transform/order'

interface BringAdapterConfig {
  clientUrl?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class BringAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'bring'
  readonly version = '1'
  private clientUrl: string | undefined

  constructor(_config: BringAdapterConfig = {}) {
    this.clientUrl = _config.clientUrl
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
    const client = new BringClient(credentials, this.clientUrl)
    const raw = await client.get<BringTrackingResponse>(`tracking/api/v2/trackingNumbers/${trackingNumber}.json`)
    return transformTracking(raw, trackingNumber)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new BringClient(credentials, this.clientUrl)
    const body = {
      language: 'EN',
      withPrice: true,
      withExpectedDelivery: true,
      withGuiInformation: true,
      consignments: [
        {
          fromPostalCode: params.originAddress.postalCode,
          toPostalCode: params.destinationAddress.postalCode,
          shippingDate: {
            day: new Date().getDate(),
            month: new Date().getMonth() + 1,
            year: new Date().getFullYear(),
          },
          packages: params.packages.map((pkg) => ({
            id: '1',
            weight: pkg.weight?.value,
          })),
        },
      ],
    }
    const raw = await client.post<BringShippingGuideResponse>(
      'shippingguide/api/v2/products',
      body,
    )
    return transformRates(raw)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    // id is expected as "{custno}/{ordno}"
    const client = new BringClient(credentials, this.clientUrl)
    const raw = await client.get<BringOrderResponse>(`po/api/v1/omorder/${id}`)
    return transformOrder(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new BringClient(credentials, this.clientUrl)
    const raw = await client.post<BringBookingResponse>('booking-api/api/booking', {
      consignments: [
        {
          shippingDateTime: new Date().toISOString(),
          parties: {
            sender: data.originAddress
              ? {
                  name: data.originAddress.name,
                  addressLine: data.originAddress.street1,
                  addressLine2: data.originAddress.street2,
                  postalCode: data.originAddress.postalCode,
                  city: data.originAddress.city,
                  countryCode: data.originAddress.country,
                  contact: {
                    name: data.originAddress.name,
                    email: data.originAddress.email,
                    phoneNumber: data.originAddress.phone,
                  },
                }
              : undefined,
            recipient: data.destinationAddress
              ? {
                  name: data.destinationAddress.name,
                  addressLine: data.destinationAddress.street1,
                  addressLine2: data.destinationAddress.street2,
                  postalCode: data.destinationAddress.postalCode,
                  city: data.destinationAddress.city,
                  countryCode: data.destinationAddress.country,
                  contact: {
                    name: data.destinationAddress.name,
                    email: data.destinationAddress.email,
                    phoneNumber: data.destinationAddress.phone,
                  },
                }
              : undefined,
          },
          product: {
            id: data.serviceCode ?? 'SERVICEPAKKE',
            customerNumber: data.reference,
          },
          packages: [
            {
              weightInKg: data.totalWeight?.value,
              dimensions: data.dimensions
                ? {
                    lengthInCm: data.dimensions.length,
                    widthInCm: data.dimensions.width,
                    heightInCm: data.dimensions.height,
                  }
                : undefined,
            },
          ],
        },
      ],
    })
    const consignment = raw.consignments?.[0]
    if (!consignment) {
      throw new Error('No consignment returned from Bring')
    }
    return transformShipment(consignment)
  }
}
