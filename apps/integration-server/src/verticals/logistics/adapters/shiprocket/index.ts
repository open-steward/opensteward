import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'
import type { Warehouse } from '../../schema/warehouse'
import type { Carrier } from '../../schema/carrier'

// ── Resource coverage ──────────────────────────────────────────────
// Available: carrier, label, manifest, order, rate, shipment, trackingevent, warehouse
//   carrier — GET courier/courierListWithCounts, the company-level courier list. It takes
//   no required parameters (only an optional type=active|inactive|all filter), so the
//   earlier "no parameterless endpoint; only via serviceability" claim was wrong.

import { pageLocally } from '@opensteward/shared'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { ShiprocketClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformOrder, type ShiprocketOrder } from './transform/order'
import { transformShipment, type ShiprocketShipment } from './transform/shipment'
import { transformTracking, type ShiprocketTrackingData } from './transform/tracking'
import { transformRate, type ShiprocketRateResponse } from './transform/rate'
import { transformLabel, type ShiprocketLabelResponse } from './transform/label'
import { transformManifest, type ShiprocketManifestResponse } from './transform/manifest'
import { transformWarehouse, type ShiprocketPickupAddress, type ShiprocketPickupListResponse } from './transform/warehouse'
import { transformCarrier, type ShiprocketCourier, type ShiprocketCourierListResponse } from './transform/carrier'

type ShiprocketAdapterConfig = Record<string, unknown>

interface ShiprocketOrderListResponse {
  data: ShiprocketOrder[]
  [key: string]: unknown
}

interface ShiprocketShipmentListResponse {
  data: ShiprocketShipment[]
  [key: string]: unknown
}

/**
 * GET settings/company/pickup ("Get All Pickup Locations"). The documented
 * answer nests the rows under data.shipping_address. An answer without that
 * array is refused rather than read as an empty account: pageLocally would
 * otherwise report an empty, complete collection and the sync would drop
 * every cached location.
 */
async function fetchPickupLocations(client: ShiprocketClient): Promise<ShiprocketPickupAddress[]> {
  const res = await client.get<ShiprocketPickupListResponse>('settings/company/pickup')
  const rows = res?.data?.shipping_address
  if (!Array.isArray(rows)) {
    throw new Error('Shiprocket pickup locations: response has no data.shipping_address array')
  }
  return rows
}

export class ShiprocketAdapter implements LogisticsAdapter {
  readonly platform = 'shiprocket'
  readonly version = '1'

  private config: ShiprocketAdapterConfig

  constructor(config: ShiprocketAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // code is "email:password"
    const sepIdx = code.indexOf(':')
    if (sepIdx < 0) throw new Error('Shiprocket exchangeCode expects code as "email:password"')
    const email = code.slice(0, sepIdx)
    const password = code.slice(sepIdx + 1)
    return exchangeCredentials(email, password)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ShiprocketClient(credentials)
    const res = await client.get<ShiprocketOrderListResponse>('orders', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ShiprocketClient(credentials)
    const raw = await client.get<ShiprocketOrder>(`orders/show/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ShiprocketClient(credentials)
    const raw = await client.post<ShiprocketOrder>('orders/create/adhoc', {
      order_id: data.orderNumber ?? `order-${Date.now()}`,
      order_date: data.orderAt?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      pickup_location: data.notes ?? 'Primary',
      billing_customer_name: data.destinationAddress?.name ?? '',
      billing_address: data.destinationAddress?.street1 ?? '',
      billing_address_2: data.destinationAddress?.street2 ?? '',
      billing_city: data.destinationAddress?.city ?? '',
      billing_state: data.destinationAddress?.state ?? '',
      billing_pincode: data.destinationAddress?.postalCode ?? '',
      billing_country: data.destinationAddress?.country ?? 'India',
      billing_phone: data.destinationAddress?.phone ?? '',
      billing_email: data.destinationAddress?.email ?? '',
      shipping_is_billing: true,
      order_items: (data.lineItems ?? []).map((li) => ({
        name: li.name ?? '',
        sku: li.sku ?? '',
        units: li.quantity ?? 1,
        selling_price: li.unitAmount ?? 0,
      })),
      sub_total: data.subtotalAmount ?? data.totalAmount ?? 0,
      payment_method: 'Prepaid',
      length: 10,
      breadth: 10,
      height: 10,
      weight: 0.5,
    })
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new ShiprocketClient(credentials)
    await client.post<unknown>('orders/cancel', { ids: [Number(id)] })
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new ShiprocketClient(credentials)
    const res = await client.get<ShiprocketShipmentListResponse>('shipments', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return (res.data ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ShiprocketClient(credentials)
    const raw = await client.get<ShiprocketShipment>(`shipments/${id}`)
    return transformShipment(raw)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new ShiprocketClient(credentials)
    // courier/track/shipment/{shipment_id} takes a shipment id, not the AWB
    // tracking number this method is handed — courier/track/awb/{awb_code}
    // is the one keyed by tracking number.
    const raw = await client.get<ShiprocketTrackingData>(
      `courier/track/awb/${trackingNumber}`,
    )
    return transformTracking(raw, trackingNumber)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ShiprocketClient(credentials)
    const pkg = params.packages[0]
    const res = await client.get<ShiprocketRateResponse>('courier/serviceability/', {
      pickup_postcode: params.originAddress.postalCode,
      delivery_postcode: params.destinationAddress.postalCode,
      weight: pkg?.weight?.value ?? 0.5,
      cod: 0,
    })
    return (res.data?.available_courier_companies ?? []).map(transformRate)
  }

  // ── Carriers (Couriers) ────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new ShiprocketClient(credentials)
    // Company-level and unpaginated. The only filter is type=active|inactive|all
    // and it defaults to all, so nothing is sent; `isActive` carries the
    // distinction per row. Every courier comes back in one answer ("By default,
    // all the couriers are shown if no filter is used"), so the caller's page
    // is sliced from the whole list.
    const res = await client.get<ShiprocketCourierListResponse>('courier/courierListWithCounts')
    return pageLocally((res.courier_data ?? []).map(transformCarrier), params)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new ShiprocketClient(credentials)
    // No by-id route exists; list-then-find, as getWarehouse does.
    const res = await client.get<ShiprocketCourierListResponse>('courier/courierListWithCounts')
    const match = (res.courier_data ?? []).find((c: ShiprocketCourier) => String(c.id) === id)
    if (!match) throw new Error(`Shiprocket courier not found: ${id}`)
    return transformCarrier(match)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new ShiprocketClient(credentials)
    const shipmentId = data.shipmentId ? Number(data.shipmentId) : 0
    const raw = await client.post<ShiprocketLabelResponse>('courier/generate/label', {
      shipment_id: [shipmentId],
    })
    return transformLabel(raw)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new ShiprocketClient(credentials)
    const shipmentIds = data.shipmentIds ?? []
    const raw = await client.post<ShiprocketManifestResponse>('manifests/generate', {
      shipment_id: shipmentIds.map(Number),
    })
    return transformManifest(raw, shipmentIds)
  }

  // ── Warehouses (Pickup Locations) ──────────────────────────────────────────

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new ShiprocketClient(credentials)
    // "No parameters are required to use this API." The documented answer
    // nests every pickup location under data.shipping_address, with no paging
    // fields, so the caller's page is sliced from the whole list.
    const rows = await fetchPickupLocations(client)
    return pageLocally(rows.map(transformWarehouse), params)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new ShiprocketClient(credentials)
    // No by-id read is documented; list-then-find over the same answer.
    const match = (await fetchPickupLocations(client)).find(
      (p: ShiprocketPickupAddress) => String(p.id) === id,
    )
    if (!match) throw new Error(`Shiprocket pickup location not found: ${id}`)
    return transformWarehouse(match)
  }
}
