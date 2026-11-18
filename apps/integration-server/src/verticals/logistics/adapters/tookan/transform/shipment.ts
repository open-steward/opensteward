import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate } from '../../shared/transform'

export interface TookanShipment {
  job_id: number | string
  job_status?: number | null
  order_id?: string | null
  job_pickup_address?: string | null
  job_address?: string | null
  customer_username?: string | null
  customer_phone?: string | null
  job_description?: string | null
  job_pickup_datetime?: string | null
  job_delivery_datetime?: string | null
  [key: string]: unknown
}

function mapStatus(s: number | null | undefined): ShipmentStatus {
  switch (s) {
    case 0: case 9: return 'LABEL_CREATED'
    case 1: case 4: return 'IN_TRANSIT'
    case 8:         return 'OUT_FOR_DELIVERY'
    case 2:         return 'DELIVERED'
    case 3:         return 'EXCEPTION'
    case 6: case 7: return 'CANCELLED'
    case 10:        return 'EXCEPTION'
    default:        return 'UNKNOWN'
  }
}

export function transformShipment(raw: TookanShipment): Shipment {
  return {
    id: String(raw.job_id),
    status: mapStatus(raw.job_status ?? undefined),
    trackingNumber: raw.order_id ?? String(raw.job_id),
    carrierId: 'tookan',
    originAddress: raw.job_pickup_address ? toAddress({ street1: raw.job_pickup_address }) : undefined,
    destinationAddress: raw.job_address
      ? toAddress({ street1: raw.job_address, name: raw.customer_username, phone: raw.customer_phone })
      : undefined,
    notes: raw.job_description ?? undefined,
    createdAt: toISODate(raw.job_pickup_datetime),
    updatedAt: toISODate(raw.job_delivery_datetime),
    metadata: raw as Record<string, unknown>,
  }
}
