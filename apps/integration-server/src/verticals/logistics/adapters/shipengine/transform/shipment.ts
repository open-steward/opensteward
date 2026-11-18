import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, toDimensions, parseDecimal } from '../../shared/transform'
import { transformAddress, type ShipEngineAddress } from './address'

export interface ShipEngineWeight {
  value: number
  unit: string  // 'pound', 'ounce', 'gram', 'kilogram'
}

export interface ShipEngineDimensions {
  unit: string  // 'inch', 'centimeter'
  length: number | null
  width: number | null
  height: number | null
}

export interface ShipEngineMonetaryValue {
  currency: string
  amount: number
}

export interface ShipEnginePackage {
  package_id?: string | null
  tracking_number?: string | null
  weight?: ShipEngineWeight | null
  dimensions?: ShipEngineDimensions | null
  [key: string]: unknown
}

export interface ShipEngineShipment {
  shipment_id: string
  shipment_status: string
  ship_date?: string | null
  created_at?: string | null
  modified_at?: string | null
  shipment_number?: string | null
  reference?: string | null
  external_shipment_id?: string | null
  ship_from?: ShipEngineAddress | null
  ship_to?: ShipEngineAddress | null
  return_to?: ShipEngineAddress | null
  warehouse_id?: string | null
  carrier_id?: string | null
  carrier_code?: string | null
  service_code?: string | null
  tracking_number?: string | null
  label_id?: string | null
  packages?: ShipEnginePackage[]
  total_weight?: ShipEngineWeight | null
  insurance_amount?: ShipEngineMonetaryValue | null
  shipping_amount?: ShipEngineMonetaryValue | null
  other_amount?: ShipEngineMonetaryValue | null
  estimated_delivery_date?: string | null
  actual_delivery_date?: string | null
  label_download?: {
    href?: string | null
    pdf?: string | null
    png?: string | null
    zpl?: string | null
  } | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string): ShipmentStatus {
  switch (status) {
    case 'pending':              return 'PENDING'
    case 'label_created':        return 'LABEL_CREATED'
    case 'in_transit':           return 'IN_TRANSIT'
    case 'out_for_delivery':     return 'OUT_FOR_DELIVERY'
    case 'delivered':            return 'DELIVERED'
    case 'available_for_pickup': return 'OUT_FOR_DELIVERY'
    case 'return_to_sender':
    case 'returned':             return 'RETURNED'
    case 'cancelled':            return 'CANCELLED'
    case 'exception':
    case 'failure':
    case 'error':                return 'EXCEPTION'
    default:                     return 'UNKNOWN'
  }
}

function mapWeightUnit(unit: string): 'oz' | 'lb' | 'g' | 'kg' {
  switch (unit) {
    case 'ounce':     return 'oz'
    case 'pound':     return 'lb'
    case 'gram':      return 'g'
    case 'kilogram':  return 'kg'
    default:          return 'oz'
  }
}

function mapDimensionUnit(unit: string): 'in' | 'cm' {
  return unit === 'centimeter' ? 'cm' : 'in'
}

export function transformShipment(raw: ShipEngineShipment): Shipment {
  const pkg = raw.packages?.[0]
  const weight = raw.total_weight ?? pkg?.weight ?? null
  const dims = pkg?.dimensions ?? null

  return {
    id: raw.shipment_id,
    status: mapShipmentStatus(raw.shipment_status ?? ''),
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: raw.carrier_id ?? raw.carrier_code ?? undefined,
    serviceCode: raw.service_code ?? undefined,
    warehouseId: raw.warehouse_id ?? undefined,
    originAddress: raw.ship_from ? transformAddress(raw.ship_from) : undefined,
    destinationAddress: raw.ship_to ? transformAddress(raw.ship_to) : undefined,
    returnAddress: raw.return_to ? transformAddress(raw.return_to) : undefined,
    totalWeight: weight
      ? toWeight(weight.value, mapWeightUnit(weight.unit ?? 'ounce'))
      : undefined,
    dimensions: dims
      ? toDimensions(
          dims.length,
          dims.width,
          dims.height,
          mapDimensionUnit(dims.unit ?? 'inch'),
        )
      : undefined,
    labelUrl: raw.label_download?.href ?? raw.label_download?.pdf ?? undefined,
    cost: raw.shipping_amount
      ? {
          amount: parseDecimal(raw.shipping_amount.amount) ?? 0,
          currency: raw.shipping_amount.currency ?? 'USD',
        }
      : undefined,
    reference: raw.reference ?? raw.external_shipment_id ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_date),
    actualDeliveryAt: toISODate(raw.actual_delivery_date),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.modified_at),
    metadata: raw as Record<string, unknown>,
  }
}
