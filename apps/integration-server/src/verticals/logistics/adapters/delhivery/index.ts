import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'
import type { Warehouse } from '../../schema/warehouse'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { DelhiveryClient } from './client'

import { transformTracking, type DelhiveryTrackingResponse } from './transform/tracking'
import { transformShipment, type DelhiveryShipment } from './transform/shipment'
import { transformOrder, type DelhiveryOrderPackage, type DelhiveryOrderResponse } from './transform/order'
import { transformWarehouse, type DelhiveryWarehouse } from './transform/warehouse'
import { transformRate, type DelhiveryRateResponse } from './transform/rate'
import { transformLabel, type DelhiveryPackingSlip } from './transform/label'

// ── Resource coverage ──────────────────────────────────────────────
// Available:  shipment, trackingevent, order, warehouse, rate, label
// Unavailable: carrier — Delhivery is itself the sole carrier; no carrier listing endpoint exists
// Unavailable: manifest — Delhivery has no separate manifest resource; manifestation is the order-creation act (POST /api/cmu/create.json)

interface DelhiveryAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class DelhiveryAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'delhivery'
  readonly version = '1'

  constructor(_config: DelhiveryAdapterConfig = {}) {}

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

  async getTrackingEvents(credentials: Credentials, waybill: string): Promise<TrackingEvent[]> {
    const client = new DelhiveryClient(credentials)
    const raw = await client.get<DelhiveryTrackingResponse>('packages/json/', {
      waybill,
    })
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new DelhiveryClient(credentials)
    const raw = await client.post<DelhiveryShipment>('fm/request/new/', {
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address_line1: data.originAddress.street1,
            address_line2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postal_code: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
          }
        : undefined,
      recipient: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            address_line1: data.destinationAddress.street1,
            address_line2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
          }
        : undefined,
      weight: data.totalWeight?.value,
      weight_unit: data.totalWeight?.unit ?? 'kg',
      service_code: data.serviceCode,
      reference: data.reference,
    })
    return transformShipment(raw)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────
  // Endpoint: POST https://track.delhivery.com/api/cmu/create.json

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new DelhiveryClient(credentials)
    const dest = data.destinationAddress
    const origin = data.originAddress

    const shipment = {
      name: dest?.name ?? '',
      add: dest?.street1 ?? '',
      city: dest?.city ?? '',
      state: dest?.state ?? '',
      pin: dest?.postalCode ?? '',
      phone: dest?.phone ?? '',
      payment_mode: 'Prepaid',
      order: data.orderNumber ?? data.id ?? '',
      seller_name: origin?.name ?? '',
      seller_add: origin?.street1 ?? '',
      seller_city: origin?.city ?? '',
      seller_state: origin?.state ?? '',
      seller_pin: origin?.postalCode ?? '',
      seller_phone: origin?.phone ?? '',
    }

    const raw = await client.post<DelhiveryOrderResponse>(
      'api/cmu/create.json',
      `format=json&data=${encodeURIComponent(JSON.stringify({ shipments: [shipment], pickup_location: { name: origin?.name ?? '' } }))}`,
    )
    const packages = raw.packages ?? []
    const pkg = packages[0] ?? ({} as DelhiveryOrderPackage)
    return transformOrder(pkg)
  }

  async getOrder(credentials: Credentials, waybill: string): Promise<Order> {
    const client = new DelhiveryClient(credentials)
    const raw = await client.get<DelhiveryOrderResponse>('api/v1/packages/', {
      waybill,
    })
    const packages = raw.packages ?? []
    const pkg = packages[0] ?? ({} as DelhiveryOrderPackage)
    return transformOrder(pkg)
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────
  // Endpoint: POST https://track.delhivery.com/api/backend/clientwarehouse/create/
  // Note: No list/get endpoint exists; only create and edit are documented.

  async getWarehouse(credentials: Credentials, name: string): Promise<Warehouse> {
    const client = new DelhiveryClient(credentials)
    // Delhivery has no GET-by-ID for warehouses; attempt an edit with the name to retrieve details.
    // In practice callers who created a warehouse can store the echo response.
    // We perform a best-effort retrieve via a noop edit with the name.
    const raw = await client.post<DelhiveryWarehouse>(
      'api/backend/clientwarehouse/edit/',
      { name },
    )
    return transformWarehouse(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────
  // Endpoint: GET https://track.delhivery.com/api/kinko/v1/invoice/charges/.json
  // Params: md (E/S), cgm (weight grams), o_pin, d_pin, ss (Delivered/RTO/DTO)

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new DelhiveryClient(credentials)
    const oPin = params.originAddress?.postalCode ?? ''
    const dPin = params.destinationAddress?.postalCode ?? ''
    const totalGrams = params.packages.reduce((sum, pkg) => {
      if (!pkg.weight) return sum
      const { value, unit } = pkg.weight
      switch (unit) {
        case 'g':  return sum + value
        case 'kg': return sum + value * 1000
        case 'lb': return sum + value * 453.592
        case 'oz': return sum + value * 28.3495
        default:   return sum + value
      }
    }, 0)

    const modes = ['E', 'S']
    const rates: Rate[] = []

    for (const md of modes) {
      try {
        const raw = await client.get<DelhiveryRateResponse>(
          'api/kinko/v1/invoice/charges/.json',
          { md, cgm: Math.ceil(totalGrams), o_pin: oPin, d_pin: dPin, ss: 'Delivered' },
        )
        rates.push(transformRate(raw, { md }))
      } catch {
        // surface/express may not be available for all pin-code pairs
      }
    }

    return rates
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  // Endpoint: GET https://track.delhivery.com/api/p/packing_slip?wbns=<waybill>

  async getLabel(credentials: Credentials, waybill: string): Promise<Label> {
    const client = new DelhiveryClient(credentials)
    const raw = await client.get<DelhiveryPackingSlip>('api/p/packing_slip', {
      wbns: waybill,
    })
    return transformLabel(raw)
  }
}
