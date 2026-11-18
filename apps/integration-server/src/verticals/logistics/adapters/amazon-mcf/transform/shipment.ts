import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

export interface McfShipment {
  amazonShipmentId?: string
  fulfillmentShipmentStatus?: string | null
  shippingSpeedCategory?: string | null
  destinationAddress?: Record<string, unknown> | null
  fulfillmentShipmentPackage?: Array<{
    packageNumber?: number
    carrierCode?: string | null
    trackingNumber?: string | null
    estimatedArrivalDate?: string | null
  }>
  shippingDateTime?: string | null
  estimatedArrivalDateTime?: string | null
  weight?: { value?: number | null; unit?: string | null } | null
  [key: string]: unknown
}

export function mapMcfShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'PENDING':
      return 'PENDING'
    case 'SHIPPED':
      return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'CANCELLED_BY_FULFILLER':
    case 'CANCELLED_BY_SELLER':
    case 'CANCELLED':
      return 'CANCELLED'
    case 'UNDELIVERABLE':
    case 'EXCEPTION':
      return 'EXCEPTION'
    case 'RETURNED':
      return 'RETURNED'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: McfShipment): Shipment {
  const firstPkg = raw.fulfillmentShipmentPackage?.[0]
  const unitRaw = raw.weight?.unit?.toLowerCase() ?? 'kg'
  const unit = (['oz', 'lb', 'g', 'kg'].includes(unitRaw) ? unitRaw : 'kg') as
    | 'oz'
    | 'lb'
    | 'g'
    | 'kg'

  return {
    id: raw.amazonShipmentId,
    status: mapMcfShipmentStatus(raw.fulfillmentShipmentStatus),
    trackingNumber: firstPkg?.trackingNumber ?? undefined,
    carrierId: 'amazon-mcf',
    serviceCode: raw.shippingSpeedCategory ?? undefined,
    destinationAddress: toAddress(raw.destinationAddress ?? null),
    totalWeight: raw.weight?.value != null ? toWeight(raw.weight.value, unit) : undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedArrivalDateTime),
    createdAt: toISODate(raw.shippingDateTime),
    metadata: raw as Record<string, unknown>,
  }
}
