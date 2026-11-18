import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate, toWeight } from '../../shared/transform'

export interface ShipKaroShipment {
  id?: number | string | null
  order_id?: number | string | null
  awb_code?: string | null
  carrier_id?: number | string | null
  courier_name?: string | null
  service_code?: string | null
  status?: string | null
  pickup_scheduled_date?: string | null
  delivered_date?: string | null
  weight?: number | null
  length?: number | null
  breadth?: number | null
  height?: number | null
  label_url?: string | null
  etd?: string | null
  // Sender / origin
  billing_name?: string | null
  billing_address?: string | null
  billing_address_2?: string | null
  billing_city?: string | null
  billing_state?: string | null
  billing_pincode?: string | null
  billing_country?: string | null
  billing_phone?: string | null
  billing_email?: string | null
  // Recipient / destination
  shipping_name?: string | null
  shipping_address?: string | null
  shipping_address_2?: string | null
  shipping_city?: string | null
  shipping_state?: string | null
  shipping_pincode?: string | null
  shipping_country?: string | null
  shipping_phone?: string | null
  shipping_email?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'PICKUP_SCHEDULED':
    case 'LABEL_CREATED':
      return 'LABEL_CREATED'
    case 'PICKED_UP':
    case 'IN_TRANSIT':
      return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'RTO':
    case 'RTO_INITIATED':
    case 'RTO_DELIVERED':
    case 'RETURNED':
      return 'RETURNED'
    case 'LOST':
    case 'EXCEPTION':
      return 'EXCEPTION'
    case 'CANCELLED':
    case 'CANCELED':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: ShipKaroShipment): Shipment {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.awb_code ?? undefined,
    carrierId: raw.courier_name ?? (raw.carrier_id != null ? String(raw.carrier_id) : undefined),
    serviceCode: raw.service_code ?? undefined,
    originAddress: toAddress({
      name: raw.billing_name,
      street1: raw.billing_address,
      street2: raw.billing_address_2,
      city: raw.billing_city,
      state: raw.billing_state,
      postalCode: raw.billing_pincode,
      country: raw.billing_country,
      phone: raw.billing_phone,
      email: raw.billing_email,
    }),
    destinationAddress: toAddress({
      name: raw.shipping_name,
      street1: raw.shipping_address,
      street2: raw.shipping_address_2,
      city: raw.shipping_city,
      state: raw.shipping_state,
      postalCode: raw.shipping_pincode,
      country: raw.shipping_country,
      phone: raw.shipping_phone,
      email: raw.shipping_email,
    }),
    totalWeight: toWeight(raw.weight, 'kg'),
    labelUrl: raw.label_url ?? undefined,
    estimatedDeliveryAt: toISODate(raw.etd),
    actualDeliveryAt: toISODate(raw.delivered_date),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
