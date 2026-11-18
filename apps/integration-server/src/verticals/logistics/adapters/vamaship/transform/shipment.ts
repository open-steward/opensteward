import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate, toWeight } from '../../shared/transform'

export interface VamashipShipment {
  id: number | null
  awb_number: string | null
  courier_name: string | null
  courier_id: number | null
  status: string | null
  service_type: string | null
  pickup_address_id: number | null
  consignee_name: string | null
  consignee_address1: string | null
  consignee_address2: string | null
  consignee_city: string | null
  consignee_state: string | null
  consignee_pincode: string | null
  consignee_country: string | null
  consignee_phone: string | null
  consignee_email: string | null
  shipper_name: string | null
  shipper_address1: string | null
  shipper_address2: string | null
  shipper_city: string | null
  shipper_state: string | null
  shipper_pincode: string | null
  shipper_country: string | null
  weight: number | null
  length: number | null
  breadth: number | null
  height: number | null
  estimated_delivery: string | null
  delivered_at: string | null
  label_url: string | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toLowerCase()
  if (s.includes('label') || s.includes('booked') || s.includes('created')) return 'LABEL_CREATED'
  if (s.includes('pick') && s.includes('schedul')) return 'LABEL_CREATED'
  if (s.includes('picked') || s.includes('transit') || s.includes('in_transit')) return 'IN_TRANSIT'
  if (s.includes('out_for_delivery') || s.includes('out for delivery')) return 'OUT_FOR_DELIVERY'
  if (s.includes('delivered')) return 'DELIVERED'
  if (s.includes('cancel')) return 'CANCELLED'
  if (s.includes('rto') || s.includes('return')) return 'RETURNED'
  if (s.includes('lost') || s.includes('damage') || s.includes('exception')) return 'EXCEPTION'
  return 'UNKNOWN'
}

export function transformShipment(raw: VamashipShipment): Shipment {
  return {
    id: String(raw.id ?? ''),
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.awb_number ?? undefined,
    carrierId: raw.courier_name ?? undefined,
    serviceCode: raw.service_type ?? undefined,
    originAddress: toAddress({
      name: raw.shipper_name,
      street1: raw.shipper_address1,
      street2: raw.shipper_address2,
      city: raw.shipper_city,
      state: raw.shipper_state,
      postalCode: raw.shipper_pincode,
      country: raw.shipper_country,
    }),
    destinationAddress: toAddress({
      name: raw.consignee_name,
      street1: raw.consignee_address1,
      street2: raw.consignee_address2,
      city: raw.consignee_city,
      state: raw.consignee_state,
      postalCode: raw.consignee_pincode,
      country: raw.consignee_country,
      phone: raw.consignee_phone,
      email: raw.consignee_email,
    }),
    totalWeight: toWeight(raw.weight, 'kg'),
    labelUrl: raw.label_url ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery),
    actualDeliveryAt: toISODate(raw.delivered_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
