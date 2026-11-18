import type { Shipment, ShipmentStatus, ShipmentMode } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'
import { SHIPMENT_STATUS_MAP, MODE_MAP } from '../constants'

export interface WarpBookingResponse {
  booked?: boolean
  shipment_id?: string
  shipment_number?: string
  order_id?: string
  order_number?: string
  tracking_number?: string
  lane_id?: string
  tracking_dashboard?: string
  service?: {
    pricing?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface WarpShipmentResponse {
  shipment_id?: string
  shipment_number?: string
  tracking_number?: string
  order_id?: string
  order_number?: string
  mode?: string
  status?: string
  origin_zip?: string
  destination_zip?: string
  pickup_date?: string
  delivery_date?: string
  pallet_count?: number
  price_usd?: number
  booked_at?: string
  cancelled_at?: string | null
  pickup_address?: {
    city?: string
    state?: string
    zipCode?: string
    street?: string
    [key: string]: unknown
  }
  delivery_address?: {
    city?: string
    state?: string
    zipCode?: string
    street?: string
    [key: string]: unknown
  }
  tracking_dashboard?: string
  [key: string]: unknown
}

function mapShipmentStatus(code: string | undefined): ShipmentStatus {
  if (!code) return 'UNKNOWN'
  return (SHIPMENT_STATUS_MAP[code] as ShipmentStatus) ?? 'UNKNOWN'
}

function mapMode(raw: string | undefined): ShipmentMode | undefined {
  if (!raw) return undefined
  return (MODE_MAP[raw] as ShipmentMode) ?? undefined
}

export function transformShipmentFromBooking(raw: WarpBookingResponse): Shipment {
  return {
    id: raw.shipment_id ?? undefined,
    status: 'LABEL_CREATED',
    trackingNumber: raw.tracking_number ?? raw.shipment_number ?? undefined,
    carrierId: 'warp',
    reference: raw.order_number ?? undefined,
    labelUrl: raw.tracking_dashboard ?? undefined,
    createdAt: toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformShipment(raw: WarpShipmentResponse): Shipment {
  const originAddr = raw.pickup_address
    ? {
        city: raw.pickup_address.city ?? undefined,
        state: raw.pickup_address.state ?? undefined,
        postalCode: raw.pickup_address.zipCode ?? raw.origin_zip ?? undefined,
        street1: raw.pickup_address.street ?? undefined,
        country: 'US' as const,
      }
    : raw.origin_zip
      ? { postalCode: raw.origin_zip, country: 'US' as const }
      : undefined

  const destAddr = raw.delivery_address
    ? {
        city: raw.delivery_address.city ?? undefined,
        state: raw.delivery_address.state ?? undefined,
        postalCode: raw.delivery_address.zipCode ?? raw.destination_zip ?? undefined,
        street1: raw.delivery_address.street ?? undefined,
        country: 'US' as const,
      }
    : raw.destination_zip
      ? { postalCode: raw.destination_zip, country: 'US' as const }
      : undefined

  const cost =
    raw.price_usd !== undefined && raw.price_usd !== null
      ? { amount: Math.round(raw.price_usd * 100), currency: 'USD' as const }
      : undefined

  return {
    id: raw.shipment_id ?? undefined,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.tracking_number ?? raw.shipment_number ?? undefined,
    carrierId: 'warp',
    mode: mapMode(raw.mode),
    originAddress: originAddr,
    destinationAddress: destAddr,
    reference: raw.order_number ?? undefined,
    cost,
    estimatedDeliveryAt: toISODate(raw.delivery_date),
    labelUrl: raw.tracking_dashboard ?? undefined,
    createdAt: toISODate(raw.booked_at),
    metadata: raw as Record<string, unknown>,
  }
}
