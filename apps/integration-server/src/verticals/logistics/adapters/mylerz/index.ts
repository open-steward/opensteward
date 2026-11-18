// ── Resource coverage ──────────────────────────────────────────────
// Available:   trackingevent, shipment, order, warehouse, label, rate
// Unavailable: carrier — Mylerz is a single self-contained carrier; no /carriers endpoint exists in the API
// Unavailable: manifest — the Mylerz API has no manifest/pickup-manifest management endpoint

import { customForm, pageLocally } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment, ShipmentStatus } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'
import type { Warehouse } from '../../schema/warehouse'
import type { Label } from '../../schema/label'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh, requestToken } from './auth'
import { MylerzClient, unwrapDescriptive, type MylerzDescriptive } from './client'
import { transformTracking, type MylerzTrackingValue } from './transform/tracking'
import { toAddress, toISODate } from '../shared/transform'
import {
  transformOrder,
  transformPackageDetails,
  type MylerzOrdersResponse,
  type MylerzPackageDetailsRaw,
} from './transform/order'
import { transformWarehouse, type MylerzWarehouseRaw } from './transform/warehouse'
import { transformLabel, type MylerzAWBResponse } from './transform/label'
import { transformRate, type MylerzRateRaw } from './transform/rate'

interface MylerzAdapterConfig {
  sandbox?: boolean
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

// The official Mylerz WooCommerce plugin asks the merchant for a Mylerz
// username and password and exchanges them at /token (see auth.ts).
const CREDENTIAL_FORM = customForm({
  fields: [
    { name: 'username', label: 'Mylerz username', type: 'text', required: true },
    { name: 'password', label: 'Mylerz password', type: 'password', required: true },
  ],
  exchange: async (input) => {
    const username = (input?.['username'] ?? '').trim()
    const password = input?.['password'] ?? ''
    if (!username || !password) throw new Error('Mylerz username and password are required.')
    return requestToken(username, password)
  },
})

interface MylerzShipmentRaw {
  id?: string
  shipment_id?: string
  waybill?: string | null
  tracking_number?: string | null
  status?: string | null
  service_code?: string | null
  weight?: number | null
  weight_unit?: string | null
  sender?: Record<string, unknown> | null
  recipient?: Record<string, unknown> | null
  label_url?: string | null
  reference?: string | null
  cod_amount?: number | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toUpperCase()
  if (s.includes('DELIVERED')) return 'DELIVERED'
  if (s.includes('OUT_FOR_DELIVERY') || s.includes('OUT FOR DELIVERY') || s.includes('COURIER'))
    return 'OUT_FOR_DELIVERY'
  if (
    s.includes('TRANSIT') ||
    s.includes('TRANSFERRED') ||
    s.includes('ARRIVED') ||
    s.includes('DEPARTED')
  )
    return 'IN_TRANSIT'
  if (s.includes('CANCEL')) return 'CANCELLED'
  if (s.includes('RETURN')) return 'RETURNED'
  if (s.includes('EXCEPTION') || s.includes('FAIL') || s.includes('UNDELIVERED')) return 'EXCEPTION'
  if (
    s.includes('CREATED') ||
    s.includes('LABEL') ||
    s.includes('MANIFEST') ||
    s.includes('PENDING') ||
    s.includes('REGISTERED')
  )
    return 'LABEL_CREATED'
  return 'UNKNOWN'
}

function transformShipment(raw: MylerzShipmentRaw): Shipment {
  const weightUnit = (raw.weight_unit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'
  return {
    id: raw.id ?? raw.shipment_id ?? '',
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.tracking_number ?? raw.waybill ?? undefined,
    carrierId: 'mylerz',
    serviceCode: raw.service_code ?? undefined,
    originAddress: toAddress(raw.sender),
    destinationAddress: toAddress(raw.recipient),
    totalWeight: raw.weight != null ? { value: raw.weight, unit: weightUnit } : undefined,
    labelUrl: raw.label_url ?? undefined,
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export class MylerzAdapter implements LogisticsAdapter {
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'mylerz'
  readonly version = '1'

  constructor(config: MylerzAdapterConfig = {}) {
    void config
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ────────────────────────────────────────────────────────────────

  // https://integration.mylerz.net/Help lists 44 routes and no shipment
  // collection: the only shipment-named route is "GET api/packages/GetTrackShipmentUrl",
  // and packages are read one AWB at a time ("GET api/packages/GetPackageDetails?AWB={AWB}").

  async listShipments(_credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    throw notSupported(
      'Mylerz cannot list shipments: its integration API (https://integration.mylerz.net/Help) has no shipment or package collection route; packages are read one AWB at a time.',
    )
  }

  async getShipment(_credentials: Credentials, _id: string): Promise<Shipment> {
    throw notSupported(
      'Mylerz cannot read a shipment: its integration API (https://integration.mylerz.net/Help) has no shipment route; a package is read by AWB through getOrder.',
    )
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new MylerzClient(credentials)
    const raw = await client.post<MylerzShipmentRaw>('shipments', {
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

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new MylerzClient(credentials)
    await client.put<unknown>(`shipments/${id}/cancel`, {})
  }

  // ── Tracking Events ──────────────────────────────────────────────────────────

  // GET api/packages/GetPackageTrackingDetailsByBarCode?barcode={barcode}; the
  // Value's PackageStatusLog is the package's status history.

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new MylerzClient(credentials)
    const path = 'packages/GetPackageTrackingDetailsByBarCode'
    const res = await client.get<MylerzDescriptive<MylerzTrackingValue>>(path, {
      barcode: trackingNumber,
    })
    const value = unwrapDescriptive(path, res)
    return value ? transformTracking(value, trackingNumber) : []
  }

  // ── Orders ───────────────────────────────────────────────────────────────────
  // In the Mylerz API, orders are represented as packages within pickup orders.
  // GET api/packages/GetPackageDetails?AWB={AWB} returns a single package/order.

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new MylerzClient(credentials)
    const path = 'packages/GetPackageDetails'
    const res = await client.get<MylerzDescriptive<MylerzPackageDetailsRaw>>(path, { AWB: id })
    const value = unwrapDescriptive(path, res)
    if (!value) {
      throw Object.assign(new Error(`Mylerz package ${id} not found`), { statusCode: 404 })
    }
    return transformPackageDetails(value, id)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new MylerzClient(credentials)
    const res = await client.post<MylerzOrdersResponse>('Orders/AddOrders', {
      WarehouseName: data.warehouseId,
      Reference: data.orderNumber,
      Description: data.notes,
      COD_Value: data.totalAmount,
      Customer_Name: data.destinationAddress?.name,
      Mobile_No: data.destinationAddress?.phone,
      Address: data.destinationAddress?.street1,
    })
    const pkg = (res.Packages ?? [])[0] ?? {}
    return transformOrder(pkg, res.PickupOrderCode)
  }

  // ── Warehouses ───────────────────────────────────────────────────────────────
  // GET api/Orders/GetWarehouses
  // (https://integration.mylerz.net/Help/Api/GET-api-Orders-GetWarehouses):
  // "URI Parameters None." and "Body Parameters None.", so every warehouse
  // comes back at once, under Value, and is paged here.

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new MylerzClient(credentials)
    const path = 'Orders/GetWarehouses'
    const res = await client.get<MylerzDescriptive<MylerzWarehouseRaw[]>>(path)
    const rows = unwrapDescriptive(path, res) ?? []
    return pageLocally(rows.map(transformWarehouse), params)
  }

  // ── Labels ───────────────────────────────────────────────────────────────────
  // POST api/packages/GetAWB {Barcode} returns the AWB as base64 PDF bytes.

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new MylerzClient(credentials)
    const path = 'packages/GetAWB'
    const res = await client.post<MylerzAWBResponse>(path, { Barcode: id })
    unwrapDescriptive(path, res)
    return transformLabel(res, id)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new MylerzClient(credentials)
    const barcode = data.shipmentId ?? data.id
    const raw = await client.post<MylerzAWBResponse>('Packages/GetAWB', {
      Barcode: barcode,
      ReferenceNumber: data.shipmentId,
    })
    return transformLabel(raw, barcode)
  }

  // ── Rates ────────────────────────────────────────────────────────────────────
  // POST /Packages/GetExpectedCharges — confirmed via Mylerz API v1.3.1 docs.

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new MylerzClient(credentials)
    const pkg = params.packages[0]
    const raw = await client.post<MylerzRateRaw>('Packages/GetExpectedCharges', {
      CODValue: 0,
      WarehouseName: undefined,
      CustomerZoneCode: params.destinationAddress?.state,
      PackageWeight: pkg?.weight?.value,
      IsFulfillment: false,
    })
    return [transformRate(raw)]
  }

  // ── Webhooks ─────────────────────────────────────────────────────────────────

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return false
  }
}
