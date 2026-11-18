import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toAddress, toWeight } from '../../shared/transform'

export interface PickrrShipment {
  order_pk: number | string | null
  tracking_id: string | null
  order_service_used: string | null
  status: string | null
  to_name: string | null
  to_phone_number: string | null
  to_email: string | null
  to_address: string | null
  to_city: string | null
  to_state: string | null
  to_pincode: string | null
  to_country: string | null
  from_name: string | null
  from_phone_number: string | null
  from_address: string | null
  from_city: string | null
  from_state: string | null
  from_pincode: string | null
  from_country: string | null
  item_name: string | null
  weight: number | null
  label_url: string | null
  estimated_delivery_date: string | null
  delivered_date: string | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toLowerCase()
  if (s.includes('delivered') && !s.includes('rto')) return 'DELIVERED'
  if (s.includes('cancel')) return 'CANCELLED'
  if (s.includes('rto') || s.includes('return')) return 'RETURNED'
  if (s.includes('out_for_delivery') || s.includes('out for delivery')) return 'OUT_FOR_DELIVERY'
  if (s.includes('in_transit') || s.includes('in transit') || s.includes('dispatched')) return 'IN_TRANSIT'
  if (s.includes('pickup') || s.includes('label') || s.includes('ready')) return 'LABEL_CREATED'
  if (s.includes('exception') || s.includes('lost') || s.includes('damage')) return 'EXCEPTION'
  return 'UNKNOWN'
}

export function transformShipment(raw: PickrrShipment): Shipment {
  return {
    id: String(raw.order_pk ?? raw.tracking_id ?? ''),
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.tracking_id ?? undefined,
    carrierId: raw.order_service_used ?? undefined,
    originAddress: toAddress({
      name: raw.from_name,
      phone: raw.from_phone_number,
      street1: raw.from_address,
      city: raw.from_city,
      state: raw.from_state,
      postalCode: raw.from_pincode,
      country: raw.from_country ?? 'India',
    }),
    destinationAddress: toAddress({
      name: raw.to_name,
      phone: raw.to_phone_number,
      email: raw.to_email,
      street1: raw.to_address,
      city: raw.to_city,
      state: raw.to_state,
      postalCode: raw.to_pincode,
      country: raw.to_country ?? 'India',
    }),
    totalWeight: toWeight(raw.weight, 'kg'),
    labelUrl: raw.label_url ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_date),
    actualDeliveryAt: toISODate(raw.delivered_date),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
