/**
 * TCS Express logistics adapter.
 *
 * TCS Express is a Romanian courier and express delivery service offering
 * domestic and international parcel delivery. This adapter covers:
 *   - Shipments (create, get)
 *   - Tracking events (get by shipment ID)
 *
 * Auth: API key passed via the X-API-Key request header.
 * Credentials are obtained from the TCS Express developer portal.
 *
 * Response envelope: { success: true, data: {...} }
 *
 * Docs: https://www.tcsexpress.com/developer
 */
import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { TcsExpressClient } from './client'
import {
  transformTracking,
  type TcsShipment,
  type TcsApiResponse,
} from './transform/tracking'

// ── Resource coverage ──────────────────────────────────────────────────────
// Available:   shipment, trackingevent
// Unavailable: carrier   — TCS Express is a single-carrier service; no multi-carrier listing endpoint exists.
// Unavailable: label     — Labels are returned inside the booking-creation response only; no standalone list/get/void endpoint is documented.
// Unavailable: manifest  — No manifest endpoint in the TCS Express API (authentication, booking, and tracking only).
// Unavailable: order     — No order-management endpoint in the TCS Express API; the platform does not expose order listing or CRUD.
// Unverified:  rate      — The API base URL (api.tcsexpresslogistics.com) is unreachable; rate endpoint existence cannot be confirmed.
// Unavailable: warehouse — No warehouse/origin-facility endpoint in the TCS Express API.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unwrapData<T>(res: TcsApiResponse<T> | T): T {
  if (res && typeof res === 'object' && 'data' in res && (res as TcsApiResponse<T>).data !== undefined) {
    return (res as TcsApiResponse<T>).data as T
  }
  return res as T
}

function mapShipmentStatus(status: string | undefined): Shipment['status'] {
  switch ((status ?? '').toUpperCase()) {
    case 'BOOKED':
    case 'PENDING':
    case 'CREATED':
      return 'PENDING'
    case 'PICKED_UP':
    case 'IN_TRANSIT':
    case 'DISPATCHED':
    case 'IN_WAREHOUSE':
    case 'ARRIVED':
      return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'RETURNED':
    case 'RTO':
    case 'RETURN_IN_TRANSIT':
      return 'RETURNED'
    case 'FAILED':
    case 'UNDELIVERED':
    case 'CANCELLED':
    case 'LOST':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

function transformShipment(raw: TcsShipment): Shipment {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    trackingNumber: raw.consignment_number ?? raw.tracking_number,
    carrierId: 'tcs-express',
    status: mapShipmentStatus(raw.status),
    createdAt: raw.created_at ? new Date(raw.created_at as string) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at as string) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ─── Connect Link credential form ────────────────────────────────────────────

const SIMPLE_API_KEY_FORM = simpleApiKey({
  helpText: 'Your TCS Express API key, obtained from the TCS Express developer portal.',
})

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class TcsExpressAdapter implements LogisticsAdapter {
  readonly platform = 'tcs-express'
  readonly version = '1'

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return false
  }

  // ── Shipments ─────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new TcsExpressClient(credentials)
    const res = await client.post<TcsApiResponse<TcsShipment> | TcsShipment>('/shipments', {
      reference: data.reference,
      service_code: data.serviceCode,
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address1: data.originAddress.street1,
            address2: data.originAddress.street2,
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
            address1: data.destinationAddress.street1,
            address2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight?.value,
      weight_unit: data.totalWeight?.unit,
      notes: data.notes,
    })
    return transformShipment(unwrapData(res))
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new TcsExpressClient(credentials)
    const res = await client.get<TcsApiResponse<TcsShipment> | TcsShipment>(
      `/shipments/${encodeURIComponent(id)}`,
    )
    return transformShipment(unwrapData(res))
  }

  // ── Tracking Events ───────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, shipmentId: string): Promise<TrackingEvent[]> {
    const client = new TcsExpressClient(credentials)
    const res = await client.get<TcsApiResponse<TcsShipment> | TcsShipment>(
      `/shipments/${encodeURIComponent(shipmentId)}`,
    )
    return transformTracking(unwrapData(res))
  }
}
