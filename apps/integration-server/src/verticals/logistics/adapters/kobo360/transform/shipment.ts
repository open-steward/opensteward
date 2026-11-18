import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'
import { SHIPMENT_STATUS_MAP } from '../constants'

/**
 * Raw Kobo360 trip / shipment object returned from GET /trips or GET /trips/:id
 */
export interface Kobo360TripResponse {
  id?: string
  trip_id?: string
  reference?: string
  tracking_number?: string
  status?: string
  service_type?: string
  cargo_type?: string
  weight_kg?: number
  origin?: Record<string, unknown>
  destination?: Record<string, unknown>
  estimated_delivery_date?: string
  actual_delivery_date?: string
  created_at?: string
  updated_at?: string
  cost?: number
  currency?: string
  notes?: string
  [key: string]: unknown
}

function mapShipmentStatus(status: string | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  return (SHIPMENT_STATUS_MAP[status.toUpperCase()] as ShipmentStatus) ?? 'UNKNOWN'
}

export function transformShipment(raw: Kobo360TripResponse): Shipment {
  const id = raw.id ?? raw.trip_id ?? undefined
  return {
    id: id ? String(id) : undefined,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.tracking_number ?? raw.reference ?? undefined,
    carrierId: 'kobo360',
    serviceCode: raw.service_type ?? raw.cargo_type ?? undefined,
    originAddress: toAddress(raw.origin as Record<string, unknown> | undefined),
    destinationAddress: toAddress(raw.destination as Record<string, unknown> | undefined),
    totalWeight: raw.weight_kg != null ? toWeight(raw.weight_kg, 'kg') : undefined,
    cost:
      raw.cost != null && raw.currency
        ? { amount: Number(raw.cost), currency: String(raw.currency) }
        : undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_date),
    actualDeliveryAt: toISODate(raw.actual_delivery_date),
    notes: raw.notes ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    mode: 'ftl',
    metadata: raw as Record<string, unknown>,
  }
}
