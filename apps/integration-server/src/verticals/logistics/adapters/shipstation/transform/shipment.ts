import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, toDimensions } from '../../shared/transform'
import { transformAddress, type SSAddress } from './address'
import type { SSWeight } from './order'

export interface SSDimensions {
  units: string
  length: number
  width: number
  height: number
}

export interface SSShipment {
  shipmentId: number
  orderId: number
  orderKey: string | null
  userId: string | null
  orderNumber: string
  createDate: string
  shipDate: string
  shipmentCost: number
  insuranceCost: number
  trackingNumber: string
  isReturnLabel: boolean
  batchNumber: string | null
  carrierCode: string
  serviceCode: string
  packageCode: string
  confirmation: string | null
  warehouseId: number | null
  voided: boolean
  voidDate: string | null
  marketplaceNotified: boolean
  notifyErrorMessage: string | null
  shipTo: SSAddress | null
  weight: SSWeight | null
  dimensions: SSDimensions | null
  labelData: string | null
  formData: string | null
  [key: string]: unknown
}

function mapWeightUnit(units: string): 'oz' | 'lb' | 'g' | 'kg' {
  switch (units) {
    case 'ounces':  return 'oz'
    case 'pounds':  return 'lb'
    case 'grams':   return 'g'
    default:        return 'oz'
  }
}

function mapDimensionUnit(units: string): 'in' | 'cm' {
  return units === 'centimeters' ? 'cm' : 'in'
}

function mapShipmentStatus(raw: SSShipment): ShipmentStatus {
  if (raw.voided) return 'CANCELLED'
  if (raw.trackingNumber) return 'LABEL_CREATED'
  return 'PENDING'
}

export function transformShipment(raw: SSShipment): Shipment {
  return {
    id: String(raw.shipmentId),
    status: mapShipmentStatus(raw),
    trackingNumber: raw.trackingNumber || undefined,
    carrierId: raw.carrierCode || undefined,
    serviceCode: raw.serviceCode || undefined,
    warehouseId: raw.warehouseId != null ? String(raw.warehouseId) : undefined,
    destinationAddress: transformAddress(raw.shipTo),
    totalWeight: raw.weight
      ? toWeight(raw.weight.value, mapWeightUnit(raw.weight.units))
      : undefined,
    dimensions: raw.dimensions
      ? toDimensions(
          raw.dimensions.length,
          raw.dimensions.width,
          raw.dimensions.height,
          mapDimensionUnit(raw.dimensions.units),
        )
      : undefined,
    cost: raw.shipmentCost != null
      ? { amount: raw.shipmentCost, currency: 'USD' }
      : undefined,
    reference: raw.orderNumber || undefined,
    createdAt: toISODate(raw.createDate),
    metadata: raw as Record<string, unknown>,
  }
}
