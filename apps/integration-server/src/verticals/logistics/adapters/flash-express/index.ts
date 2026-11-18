import { customForm, pageLocally } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'
import type { Rate } from '../../schema/rate'
import type { Warehouse } from '../../schema/warehouse'

import { buildAuthUrl, exchangeApiCredentials, refreshCredentials as doRefresh } from './auth'
import { FlashExpressClient } from './client'

import { transformTracking, type FlashExpressRoutesData } from './transform/tracking'
import { transformShipment, type FlashExpressOrder } from './transform/shipment'
import { transformOrder, type FlashExpressOrderResponse } from './transform/order'
import { transformRate, type FlashExpressEstimateRateData } from './transform/rate'
import { transformWarehouse, type FlashExpressWarehouse } from './transform/warehouse'

// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: carrier   — Flash Express is a single-carrier network; no carrier listing endpoint exists
// Unavailable: label     — POST /open/v1/orders/{pno}/pre_print returns a binary PDF stream, not a JSON label record
// Unavailable: manifest  — No manifest or batch submission endpoints documented in the Flash Express API

interface FlashExpressAdapterConfig {
  /** Use the documented "Training ENV" host instead of production. */
  sandbox?: boolean
}

/**
 * Every request is signed with the merchant number and the merchant's secret
 * key (https://open-docs.flashexpress.com/, "The Security Reference"):
 * "mchId | string(32) | true | merchant No." and "About The security
 * key:Please contact the official support staff to obtain or reset."
 */
const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'mchId',
      label: 'Merchant number (mchId)',
      type: 'text',
      required: true,
      helpText: 'Your Flash Express merchant No., e.g. AAXXXX.',
    },
    {
      name: 'secretKey',
      label: 'Secret key',
      type: 'password',
      required: true,
      helpText: 'The security key Flash Express support issued for signing API requests.',
    },
  ],
  exchange: async (fields: Record<string, string>): Promise<Credentials> => {
    const mchId = (fields['mchId'] ?? '').trim()
    const secretKey = (fields['secretKey'] ?? '').trim()
    if (!mchId) throw new Error('Merchant number (mchId) is required.')
    if (!secretKey) throw new Error('Secret key is required.')
    return exchangeApiCredentials(mchId, secretKey)
  },
})

export class FlashExpressAdapter implements LogisticsAdapter {
  // Connect Link support — merchant number plus secret key.

  credentialFields = CREDENTIAL_FORM.credentialFields

  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'flash-express'
  readonly version = '1'

  private readonly sandbox: boolean

  constructor(config: FlashExpressAdapterConfig = {}) {
    this.sandbox = config.sandbox === true
  }

  private client(credentials: Credentials): FlashExpressClient {
    return new FlashExpressClient(credentials, { sandbox: this.sandbox })
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'Flash Express connects with a merchant number and a secret key; use the credential form.',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  // "Tracking order", POST /open/v1/orders/{pno}/routes
  // (https://open-docs.flashexpress.com/#tracking-order-orders-pno-routes).
  // The pno path variable is "not involved in the signature"; the body is
  // mchId, nonceStr and sign only.

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const data = await this.client(credentials).post<FlashExpressRoutesData | null>(
      `open/v1/orders/${encodeURIComponent(trackingNumber)}/routes`,
    )
    if (!data) {
      throw Object.assign(new Error(`Flash Express has no routes for ${trackingNumber}`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    return transformTracking(data)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = this.client(credentials)
    const raw = await client.post<FlashExpressOrder>('orders', {
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address_line1: data.originAddress.street1,
            address_line2: data.originAddress.street2,
            city: data.originAddress.city,
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
            address_line1: data.destinationAddress.street1,
            address_line2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
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
  // Derived from shipment creation (POST /open/v3/orders). Flash Express has
  // no dedicated order-listing endpoint; orders are managed by tracking number.

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = this.client(credentials)
    const requestBody = {
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address_line1: data.originAddress.street1,
            address_line2: data.originAddress.street2,
            city: data.originAddress.city,
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
            address_line1: data.destinationAddress.street1,
            address_line2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      reference: data.orderNumber,
    }
    const raw = await client.post<FlashExpressOrderResponse>('open/v3/orders', requestBody)
    return transformOrder(raw, requestBody)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────
  // POST /open/v1/orders/estimate_rate

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = this.client(credentials)
    const body: Record<string, unknown> = {
      srcProvinceId: (params as Record<string, unknown>).srcProvinceId,
      dstProvinceId: (params as Record<string, unknown>).dstProvinceId,
      weight: params.packages.reduce((sum, pkg) => {
        if (pkg.weight?.unit === 'g') return sum + (pkg.weight.value ?? 0)
        if (pkg.weight?.unit === 'kg') return sum + (pkg.weight.value ?? 0) * 1000
        return sum
      }, 0),
    }
    const data = await client.post<FlashExpressEstimateRateData>(
      'open/v1/orders/estimate_rate',
      body,
    )
    return [transformRate(data)]
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────
  // getAllWarehouses, POST /open/v1/warehouses
  // (https://open-docs.flashexpress.com/#getallwarehouses-getallwarehouses-warehouses).
  // The documented request is mchId, nonceStr and sign only: no page, size or
  // filter, so `data` is every warehouse and is paged here.

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const data = await this.client(credentials).post<FlashExpressWarehouse[] | null>(
      'open/v1/warehouses',
    )
    // The docs show `data` as the warehouse array and say nothing of an empty
    // account. Anything else is thrown: served as an empty page, pageLocally
    // would tell the sync the collection is complete and it would drop cached rows.
    if (!Array.isArray(data)) {
      throw Object.assign(
        new Error('Flash Express open/v1/warehouses answered code 1 without a warehouse array'),
        { statusCode: 502, code: 'UPSTREAM_ERROR' },
      )
    }
    return pageLocally(data.map(transformWarehouse), params)
  }
}
