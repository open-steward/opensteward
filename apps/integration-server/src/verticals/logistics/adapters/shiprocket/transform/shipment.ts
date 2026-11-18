import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate, toWeight } from '../../shared/transform'

export interface ShiprocketShipment {
  id: number
  order_id: number | null
  awb_code: string | null
  courier_company_id: number | null
  courier_name: string | null
  status: string | null
  pickup_scheduled_date: string | null
  delivered_date: string | null
  weight: number | null
  dimensions: string | null
  billing_customer_name: string | null
  billing_address: string | null
  billing_address_2: string | null
  billing_city: string | null
  billing_state: string | null
  billing_pincode: string | null
  billing_country: string | null
  billing_phone: string | null
  billing_email: string | null
  shipping_customer_name: string | null
  shipping_address: string | null
  shipping_address_2: string | null
  shipping_city: string | null
  shipping_state: string | null
  shipping_pincode: string | null
  shipping_country: string | null
  shipping_phone: string | null
  shipping_email: string | null
  etd: string | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null): ShipmentStatus {
  switch (status) {
    case 'PICKUP_SCHEDULED': return 'LABEL_CREATED'
    case 'PICKED_UP':        return 'IN_TRANSIT'
    case 'IN_TRANSIT':       return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY': return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':        return 'DELIVERED'
    case 'RTO':              return 'RETURNED'
    case 'LOST':             return 'EXCEPTION'
    default:                 return 'UNKNOWN'
  }
}

export function transformShipment(raw: ShiprocketShipment): Shipment {
  return {
    id: String(raw.id),
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.awb_code ?? undefined,
    carrierId: raw.courier_name ?? undefined,
    originAddress: toAddress({
      name: raw.billing_customer_name,
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
      name: raw.shipping_customer_name,
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
    estimatedDeliveryAt: toISODate(raw.etd),
    actualDeliveryAt: toISODate(raw.delivered_date),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
