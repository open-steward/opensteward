import { pageLocally, simpleApiKey } from '@opensteward/shared'
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
import type { Warehouse } from '../../schema/warehouse'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { GhtkClient } from './client'

import { transformTracking, type GhtkTrackingResponse } from './transform/tracking'
import { transformShipment, type GhtkShipmentRaw } from './transform/shipment'
import { transformOrder, type GhtkOrderRaw } from './transform/order'
import { transformWarehouse, type GhtkPickAddressRaw } from './transform/warehouse'
import { transformLabelFromShipment } from './transform/label'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier  — GHTK is itself the sole carrier; no carrier-list endpoint exists in the API
// Unavailable: manifest — No manifest endpoint exists in the GHTK API

interface GhtkAdapterConfig { sandbox?: boolean }
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class GhtkAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'ghtk'
  readonly version = '1'

  constructor(config: GhtkAdapterConfig = {}) {

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
    const client = new GhtkClient(credentials)
    const raw = await client.get<GhtkTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking({ ...raw, tracking_number: raw.tracking_number ?? trackingNumber })
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new GhtkClient(credentials)
    const raw = await client.post<GhtkShipmentRaw>('shipments', {
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
  // Real endpoint: GET /services/shipment/fee
  // Docs: https://api.ghtk.vn/docs/submit-order/calculate-shipping-fee/

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new GhtkClient(credentials)
    const pkg = params.packages[0]
    const res = await client.get<{ success?: boolean; fee?: Record<string, unknown> }>(
      'shipment/fee',
      {
        pick_province: params.originAddress.state ?? params.originAddress.city,
        pick_district: params.originAddress.city,
        province: params.destinationAddress.state ?? params.destinationAddress.city,
        district: params.destinationAddress.city,
        weight: pkg?.weight ? Math.round(pkg.weight.value * (pkg.weight.unit === 'kg' ? 1000 : pkg.weight.unit === 'g' ? 1 : pkg.weight.unit === 'lb' ? 453.592 : 28.3495)) : undefined,
      },
    )
    const fee = res.fee
    if (!fee) return []
    const baseAmount = typeof fee.fee === 'number' ? fee.fee : undefined
    return [
      {
        carrierId: 'ghtk',
        serviceCode: (fee.delivery_type as string | undefined) ?? undefined,
        serviceName: (fee.name as string | undefined) ?? 'GHTK Standard',
        currency: 'VND',
        totalAmount: baseAmount,
        metadata: fee as Record<string, unknown>,
      },
    ]
  }

  // ── Orders ─────────────────────────────────────────────────────────────────
  // Real endpoints:
  //   POST /services/shipment/order  → create order
  //   GET  /services/shipment/v2/{tracking_order} → get order status

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new GhtkClient(credentials)
    const res = await client.get<{ success?: boolean; order?: GhtkOrderRaw }>(`shipment/v2/${id}`)
    const raw: GhtkOrderRaw = res.order ?? (res as unknown as GhtkOrderRaw)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new GhtkClient(credentials)
    const dest = data.destinationAddress
    const res = await client.post<{ success?: boolean; order?: GhtkOrderRaw }>(
      'shipment/order',
      {
        order: {
          id: data.orderNumber,
          name: dest?.name,
          address: dest?.street1,
          province: dest?.state,
          district: dest?.city,
          ward: dest?.street2,
          tel: dest?.phone,
          email: dest?.email,
          value: data.totalAmount,
          pick_money: data.totalAmount,
          note: data.notes,
        },
        products: data.lineItems?.map((li) => ({
          name: li.name,
          weight: li.weight?.value ?? 0.1,
          quantity: li.quantity ?? 1,
          price: li.unitAmount,
        })) ?? [],
      },
    )
    const raw: GhtkOrderRaw = res.order ?? (res as unknown as GhtkOrderRaw)
    return transformOrder(raw)
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────
  // Real endpoint: GET /services/shipment/list_pick_add
  // Docs: https://api.ghtk.vn/docs/submit-order/api-get-pick-addresses/

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new GhtkClient(credentials)
    // The docs define no paging parameter (only the Token header), so one
    // response is the whole collection: page it locally.
    const res = await client.get<{ success?: boolean; data?: GhtkPickAddressRaw[] }>(
      'shipment/list_pick_add',
    )
    const list = res.data ?? []
    return pageLocally(list.map(transformWarehouse), params)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  // Derived from shipment: the GHTK label endpoint (GET /services/label/{tracking})
  // returns a binary PDF, not JSON. Label metadata is extracted from the shipment
  // response which contains label_url, tracking_number, service_code, etc.

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new GhtkClient(credentials)
    const raw = await client.get<GhtkShipmentRaw>(`shipment/v2/${id}`)
    return transformLabelFromShipment(raw)
  }
}
