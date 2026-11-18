// ── Resource coverage ──────────────────────────────────────────────
// Unverified: carrier   — Magaya Open API docs are behind a customer-login gate; no public REST endpoint confirmed
// Unverified: label     — Magaya Open API docs are behind a customer-login gate; no public REST endpoint confirmed
// Unverified: manifest  — Magaya Open API docs are behind a customer-login gate; no public REST endpoint confirmed
// Unverified: order     — Magaya Open API docs are behind a customer-login gate; no public REST endpoint confirmed
// Unverified: rate      — Magaya Open API docs are behind a customer-login gate; no public REST endpoint confirmed
// Unverified: warehouse — Magaya Open API docs are behind a customer-login gate; no public REST endpoint confirmed

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { MagayaClient } from './client'
import { transformTracking, type MagayaShipmentTracking } from './transform/tracking'
import { SHIPMENT_STATUS_MAP } from './constants'
import type { ShipmentStatus } from '../../schema/shipment'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API Key',
  helpText: 'Found in Magaya Live → Settings → API Keys.',
})

export interface MagayaShipment {
  ShipmentID?: string | number | null
  ShipmentNumber?: string | null
  Status?: string | null
  TrackingNumber?: string | null
  HouseAirwayBill?: string | null
  MasterBill?: string | null
  Mode?: string | null
  Carrier?: string | null
  ServiceCode?: string | null
  OriginPort?: string | null
  DestinationPort?: string | null
  ShipFromAddress?: Record<string, unknown> | null
  ShipToAddress?: Record<string, unknown> | null
  Weight?: number | null
  WeightUnit?: string | null
  EstimatedDelivery?: string | null
  ActualDelivery?: string | null
  CreatedAt?: string | null
  UpdatedAt?: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  return (SHIPMENT_STATUS_MAP[status] as ShipmentStatus) ?? 'UNKNOWN'
}

function mapMode(mode: string | null | undefined): Shipment['mode'] {
  switch ((mode ?? '').toLowerCase()) {
    case 'air':   return 'air'
    case 'ocean': return 'ocean'
    case 'land':
    case 'road':
    case 'ground':
    case 'truck': return 'ftl'
    case 'rail':  return 'rail'
    default:      return 'unknown'
  }
}

function toAddress(raw: Record<string, unknown> | null | undefined): Shipment['originAddress'] {
  if (!raw) return undefined
  return {
    name: (raw.name ?? raw.full_name) as string | undefined,
    company: (raw.company ?? raw.company_name) as string | undefined,
    street1: (raw.street1 ?? raw.address1 ?? raw.address_line1) as string | undefined,
    street2: (raw.street2 ?? raw.address2 ?? raw.address_line2) as string | undefined,
    city: raw.city as string | undefined,
    state: (raw.state ?? raw.state_province) as string | undefined,
    postalCode: (raw.postalCode ?? raw.postal_code ?? raw.zip) as string | undefined,
    country: (raw.country ?? raw.country_code) as string | undefined,
    phone: (raw.phone ?? raw.phone_number) as string | undefined,
    email: raw.email as string | undefined,
  }
}

function transformShipment(raw: MagayaShipment): Shipment {
  const id = raw.ShipmentID != null ? String(raw.ShipmentID) : (raw.ShipmentNumber ?? undefined)
  const trackingNumber =
    raw.TrackingNumber ?? raw.HouseAirwayBill ?? raw.MasterBill ?? undefined
  const weightUnit = (raw.WeightUnit?.toLowerCase() ?? 'lb') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: id ?? undefined,
    status: mapShipmentStatus(raw.Status),
    trackingNumber: trackingNumber ?? undefined,
    carrierId: raw.Carrier ?? 'magaya',
    serviceCode: raw.ServiceCode ?? undefined,
    originAddress: toAddress(raw.ShipFromAddress),
    destinationAddress: toAddress(raw.ShipToAddress),
    totalWeight:
      raw.Weight != null
        ? { value: raw.Weight, unit: weightUnit }
        : undefined,
    estimatedDeliveryAt: raw.EstimatedDelivery ? new Date(raw.EstimatedDelivery) : undefined,
    actualDeliveryAt: raw.ActualDelivery ? new Date(raw.ActualDelivery) : undefined,
    mode: mapMode(raw.Mode),
    createdAt: raw.CreatedAt ? new Date(raw.CreatedAt) : undefined,
    updatedAt: raw.UpdatedAt ? new Date(raw.UpdatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export interface MagayaAdapterConfig {
  sandbox?: boolean
}

export class MagayaAdapter implements LogisticsAdapter {
  readonly platform = 'magaya'
  readonly version = '1'

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  constructor(_config: MagayaAdapterConfig = {}) {}

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

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new MagayaClient(credentials)
    const res = await client.get<{ shipments?: MagayaShipment[]; data?: MagayaShipment[] }>(
      '/shipments',
      {
        page: params.page ?? 1,
        limit: params.limit ?? 50,
        ...(params.filter ? { status: params.filter } : {}),
        ...(params.since ? { updatedSince: (params.since as Date).toISOString() } : {}),
      },
    )
    const items = res.shipments ?? res.data ?? []
    return items.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new MagayaClient(credentials)
    const raw = await client.get<MagayaShipment>(`/shipments/${encodeURIComponent(id)}`)
    return transformShipment(raw)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new MagayaClient(credentials)
    const raw = await client.get<MagayaShipmentTracking>(
      `/shipments/${encodeURIComponent(trackingNumber)}/tracking`,
    )
    return transformTracking(raw)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return false
  }
}
