import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, toDimensions, parseDecimal } from '../../shared/transform'
import { transformDirection, type EnviaYaDirection } from './address'

export interface EnviaYaParcel {
  quantity?: number | null
  weight?: number | string | null
  weight_unit?: string | null
  length?: number | string | null
  height?: number | string | null
  width?: number | string | null
  dimension_unit?: string | null
  content?: string | null
  value?: number | string | null
  value_currency?: string | null
  [key: string]: unknown
}

export interface EnviaYaRate {
  carrier?: string | null
  carrier_service_code?: string | null
  total_amount?: number | string | null
  net_total_amount?: number | string | null
  currency?: string | null
  [key: string]: unknown
}

export interface EnviaYaShipment {
  enviaya_shipment_number?: string | null
  enviaya_id?: string | null
  carrier_shipment_number?: string | null
  carrier?: string | null
  carrier_service_code?: string | null
  shipment_status?: string | null
  status?: string | null
  label_url?: string | null
  label_share_link?: string | null
  estimated_delivery?: string | null
  expected_delivery_date?: string | null
  actual_delivery_date?: string | null
  origin_direction?: EnviaYaDirection | null
  destination_direction?: EnviaYaDirection | null
  shipment?: {
    parcels?: EnviaYaParcel[] | null
    insured_value?: number | string | null
    insured_value_currency?: string | null
    [key: string]: unknown
  } | null
  rate?: EnviaYaRate | null
  reference?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'label_created':
    case 'booked':
      return 'LABEL_CREATED'
    case 'in_transit':
    case 'transit':
      return 'IN_TRANSIT'
    case 'out_for_delivery':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'exception':
    case 'error':
      return 'EXCEPTION'
    case 'returned':
    case 'return_to_sender':
      return 'RETURNED'
    case 'cancelled':
    case 'voided':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

function weightUnit(unit: string | null | undefined): 'oz' | 'lb' | 'g' | 'kg' {
  switch ((unit ?? '').toLowerCase()) {
    case 'lb':
    case 'lbs':
      return 'lb'
    case 'g':
    case 'gr':
      return 'g'
    case 'oz':
      return 'oz'
    default:
      return 'kg'
  }
}

function dimUnit(unit: string | null | undefined): 'in' | 'cm' {
  return (unit ?? '').toLowerCase() === 'in' ? 'in' : 'cm'
}

export function transformShipment(raw: EnviaYaShipment): Shipment {
  const id = raw.enviaya_shipment_number ?? raw.enviaya_id ?? undefined
  const parcel = raw.shipment?.parcels?.[0] ?? null
  const rate = raw.rate ?? null
  const statusRaw = raw.shipment_status ?? raw.status ?? undefined

  return {
    id,
    status: mapShipmentStatus(statusRaw),
    trackingNumber: raw.carrier_shipment_number ?? undefined,
    carrierId: raw.carrier ?? undefined,
    serviceCode: raw.carrier_service_code ?? undefined,
    originAddress: transformDirection(raw.origin_direction),
    destinationAddress: transformDirection(raw.destination_direction),
    totalWeight: parcel
      ? toWeight(parcel.weight, weightUnit(parcel.weight_unit))
      : undefined,
    dimensions: parcel
      ? toDimensions(parcel.length, parcel.width, parcel.height, dimUnit(parcel.dimension_unit))
      : undefined,
    labelUrl: raw.label_url ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery ?? raw.expected_delivery_date),
    actualDeliveryAt: toISODate(raw.actual_delivery_date),
    cost: rate && rate.total_amount != null
      ? {
          amount: parseDecimal(rate.total_amount) ?? 0,
          currency: (rate.currency as string | undefined) ?? 'MXN',
        }
      : undefined,
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
