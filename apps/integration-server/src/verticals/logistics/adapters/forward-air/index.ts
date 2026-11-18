// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: carrier   — Forward Air is a single LTL carrier; no /carriers endpoint exists
// Unavailable: manifest  — No manifest API concept in Forward Air's documented web services
// Unavailable: warehouse — Forward Air operates airport terminals, not pick-and-pack warehouses; no warehouse endpoint exists

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
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ForwardAirClient } from './client'

import { transformTracking, type ForwardAirTrackingResponse } from './transform/tracking'
import { transformShipment, type ForwardAirShipmentResponse } from './transform/shipment'
import { transformRate, type ForwardAirQuoteResponse } from './transform/rate'
import { transformOrder, type ForwardAirOrderResponse } from './transform/order'
import { transformLabel, type ForwardAirDocumentResponse } from './transform/label'

interface ForwardAirAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ForwardAirAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'forward-air'
  readonly version = '1'

  constructor(_config: ForwardAirAdapterConfig = {}) {}

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
    const client = new ForwardAirClient(credentials)
    const raw = await client.get<ForwardAirTrackingResponse>(`shipments/${trackingNumber}/status`)
    return transformTracking(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ForwardAirClient(credentials)
    const raw = await client.post<ForwardAirQuoteResponse>('ltlservices/v2/rest/waybills/quote', {
      Origin: {
        OriginZipCode: params.originAddress.postalCode,
        OriginCountryCode: params.originAddress.country,
      },
      Destination: {
        DestinationZipCode: params.destinationAddress.postalCode,
        DestinationCountryCode: params.destinationAddress.country,
      },
      Dimensions: (params.packages ?? []).map((pkg) => ({
        Pieces: 1,
        Length: pkg.dimensions?.length,
        Width: pkg.dimensions?.width,
        Height: pkg.dimensions?.height,
      })),
      FreightDetails: (params.packages ?? []).map((pkg) => ({
        Weight: pkg.weight?.value,
        WeightType: pkg.weight?.unit === 'kg' ? 'KG' : 'LB',
        Pieces: 1,
      })),
    })
    return [transformRate(raw)]
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ForwardAirClient(credentials)
    const raw = await client.post<ForwardAirOrderResponse>('ltlservices/v2/rest/waybills/book', {
      OrderDetails: {
        OrderAction: 'Create',
        ShippingDate: data.orderAt
          ? (data.orderAt instanceof Date ? data.orderAt.toISOString().slice(0, 10) : String(data.orderAt))
          : undefined,
        SpecialInstructions: data.notes,
      },
      Shipper: data.originAddress
        ? {
            LocationName: data.originAddress.company,
            ContactName: data.originAddress.name,
            Address1: data.originAddress.street1,
            Address2: data.originAddress.street2,
            City: data.originAddress.city,
            State: data.originAddress.state,
            ZipCode: data.originAddress.postalCode,
            Country: data.originAddress.country,
            ContactPhone: data.originAddress.phone,
            ContactEmail: data.originAddress.email,
          }
        : undefined,
      Consignee: data.destinationAddress
        ? {
            LocationName: data.destinationAddress.company,
            ContactName: data.destinationAddress.name,
            Address1: data.destinationAddress.street1,
            Address2: data.destinationAddress.street2,
            City: data.destinationAddress.city,
            State: data.destinationAddress.state,
            ZipCode: data.destinationAddress.postalCode,
            Country: data.destinationAddress.country,
            ContactPhone: data.destinationAddress.phone,
            ContactEmail: data.destinationAddress.email,
          }
        : undefined,
    })
    return transformOrder(raw)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ForwardAirClient(credentials)
    const raw = await client.get<ForwardAirOrderResponse>(`ltlservices/v2/rest/waybills/${id}`)
    return transformOrder(raw)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new ForwardAirClient(credentials)
    const raw = await client.get<ForwardAirDocumentResponse>(
      `ltlservices/v2/rest/waybills/${id}/documents/LABEL`,
    )
    return transformLabel(raw, id)
  }

  async listLabels(credentials: Credentials): Promise<Label[]> {
    // Forward Air labels are per-waybill; there is no global list endpoint.
    // This method is declared on the interface as optional and is unsupported here.
    void credentials
    return []
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ForwardAirClient(credentials)
    const raw = await client.post<ForwardAirShipmentResponse>('shipments', {
      origin: data.originAddress
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
      destination: data.destinationAddress
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
      packages: (data.packages ?? []).map((pkg) => ({
        weight: pkg.weight?.value ?? data.totalWeight?.value ?? 1,
        length: pkg.dimensions?.length,
        width: pkg.dimensions?.width,
        height: pkg.dimensions?.height,
      })),
      serviceCode: data.serviceCode,
      reference: data.reference,
    })
    return transformShipment(raw)
  }
}
