// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: manifest — GHN has no public manifest/handover API endpoint; manifests are managed in-app only

import {
  simpleApiKey,
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
  reportUpstreamPage,
  DEFAULT_PAGE_LIMIT,
} from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Order } from '../../schema/order'
import type { Carrier } from '../../schema/carrier'
import type { Warehouse } from '../../schema/warehouse'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { GhnClient } from './client'

import { transformTracking, type GhnTrackingResponse } from './transform/tracking'
import { transformShipment, type GhnShipmentRaw } from './transform/shipment'
import { transformOrder, type GhnOrderRaw } from './transform/order'
import { transformWarehouse, type GhnShopRaw, type GhnShopListResponse } from './transform/warehouse'
import { transformCarrier, type GhnServiceRaw } from './transform/carrier'
import { transformLabel, type GhnPrintTokenResponse } from './transform/label'

interface GhnAdapterConfig { sandbox?: boolean }
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class GhnAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'ghn'
  readonly version = '1'

  constructor(config: GhnAdapterConfig = {}) {

    void config
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
    const client = new GhnClient(credentials)
    const raw = await client.get<GhnTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking({ ...raw, tracking_number: raw.tracking_number ?? trackingNumber })
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new GhnClient(credentials)
    const raw = await client.post<GhnShipmentRaw>('shipments', {
      reference: data.reference,
      service_code: data.serviceCode,
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
    })
    return transformShipment(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new GhnClient(credentials)
    const pkg = params.packages[0]
    const res = await client.post<{ rates?: Array<Record<string, unknown>> }>('rates', {
      origin: {
        city: params.originAddress.city,
        postal_code: params.originAddress.postalCode,
        country: params.originAddress.country,
      },
      destination: {
        city: params.destinationAddress.city,
        postal_code: params.destinationAddress.postalCode,
        country: params.destinationAddress.country,
      },
      weight: pkg?.weight?.value,
      weight_unit: pkg?.weight?.unit ?? 'kg',
    })
    const list = res.rates ?? []
    return list.map((r) => ({
      carrierId: 'ghn',
      serviceCode: (r.service_code as string | undefined) ?? (r.code as string | undefined),
      serviceName: (r.service_name as string | undefined) ?? (r.name as string | undefined),
      currency: (r.currency as string | undefined) ?? 'USD',
      totalAmount: typeof r.total === 'number' ? r.total : typeof r.amount === 'number' ? r.amount : undefined,
      transitDays: typeof r.transit_days === 'number' ? r.transit_days : undefined,
      metadata: r as Record<string, unknown>,
    }))
  }

  // ── Orders ──────────────────────────────────────────────────────────────────

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new GhnClient(credentials)
    const res = await client.post<{ data?: GhnOrderRaw }>('shipping-order/detail', { order_code: id })
    return transformOrder(res.data ?? {})
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new GhnClient(credentials)
    const raw = await client.post<{ data?: GhnOrderRaw }>('shipping-order/create', {
      to_name: data.destinationAddress?.name,
      to_phone: data.destinationAddress?.phone,
      to_address: data.destinationAddress?.street1,
      to_ward_code: data.destinationAddress?.postalCode,
      to_district_id: undefined,
      weight: undefined,
      payment_type_id: 2,
      required_note: 'CHOXEMHANGKHONGTHU',
      service_type_id: data.requestedServiceCode ? undefined : 2,
      service_id: data.requestedServiceCode ? Number(data.requestedServiceCode) : undefined,
      note: data.notes,
      client_order_code: data.orderNumber,
    })
    return transformOrder(raw.data ?? {})
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new GhnClient(credentials)
    await client.post<unknown>('switch-status/cancel', { order_codes: [id] })
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────

  /**
   * shop/all pages by `offset` + `limit`, and each response's `last_offset`
   * is the "Offset cursor for the next page"
   * (https://developer.ghn.vn/en/docs/shop/get-shop). It is walked as a
   * cursor, never computed as page × limit. No maximum page size is
   * documented, so the caller's limit is sent as is. No explicit end signal
   * is documented either: a short page, or a `last_offset` that does not
   * move, is the end.
   */
  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new GhnClient(credentials)
    const limit = params.limit ?? DEFAULT_PAGE_LIMIT
    const key = cursorPagerKey(connectionScope('ghn', credentials), 'shops', { limit })
    const { items, hasMore } = await pageByCursor<GhnShopRaw, number>(
      key,
      params.page,
      async (cursor) => {
        const offset = cursor ?? 0
        const res = await client.post<{ data?: GhnShopListResponse }>('shop/all', { offset, limit })
        const shops = res.data?.shops ?? []
        const last = res.data?.last_offset
        const next =
          shops.length >= limit && typeof last === 'number' && last !== offset ? last : null
        return { items: shops, next }
      },
    )
    reportUpstreamPage(params, { hasMore })
    return items.map(transformWarehouse)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new GhnClient(credentials)
    const res = await client.post<{ data?: GhnShopListResponse }>('shop/all', { offset: 0, limit: 200 })
    const shops = res.data?.shops ?? []
    const shop = shops.find((s: GhnShopRaw) => String(s._id) === id) ?? shops[0] ?? {}
    return transformWarehouse(shop)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  /**
   * available-services is not paged ("data is an array of available
   * services", https://developer.ghn.vn/en/docs/master-data/get-service), and
   * the services fold into one carrier row: that row is the whole collection.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new GhnClient(credentials)
    const res = await client.post<{ data?: GhnServiceRaw[] }>('shipping-order/available-services', {
      shop_id: 0,
      from_district: 0,
      to_district: 0,
    })
    const services = res.data ?? []
    return pageLocally([transformCarrier(services)], params)
  }

  async getCarrier(credentials: Credentials, _id: string): Promise<Carrier> {
    const client = new GhnClient(credentials)
    const res = await client.post<{ data?: GhnServiceRaw[] }>('shipping-order/available-services', {
      shop_id: 0,
      from_district: 0,
      to_district: 0,
    })
    return transformCarrier(res.data ?? [])
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const orderCode = data.shipmentId ?? data.trackingNumber ?? ''
    const client = new GhnClient(credentials)
    const res = await client.post<{ data?: GhnPrintTokenResponse }>('a5/gen-token', {
      order_codes: [orderCode],
    })
    const token = res.data?.token ?? ''
    return transformLabel({ orderCode, token, createdAt: new Date().toISOString() })
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new GhnClient(credentials)
    const res = await client.post<{ data?: GhnPrintTokenResponse }>('a5/gen-token', {
      order_codes: [id],
    })
    const token = res.data?.token ?? ''
    return transformLabel({ orderCode: id, token, createdAt: new Date().toISOString() })
  }
}
