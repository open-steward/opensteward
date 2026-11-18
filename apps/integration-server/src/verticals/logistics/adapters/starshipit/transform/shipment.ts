import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, toDimensions, parseDecimal, nonempty } from '../../shared/transform'
import { transformAddress, type StarshipitAddress } from './address'

export interface StarshipitPackage {
  weight?: number | null       // kg
  height?: number | null       // cm
  width?: number | null        // cm
  length?: number | null       // cm
  tracking_number?: string | null
  [key: string]: unknown
}

export interface StarshipitShipment {
  order_id?: string | number | null
  order_number?: string | null
  status?: string | null
  tracking_number?: string | null
  carrier_name?: string | null
  carrier_code?: string | null
  service_name?: string | null
  service_code?: string | null
  destination?: StarshipitAddress | null
  sender?: StarshipitAddress | null
  packages?: StarshipitPackage[] | null
  weight?: number | null       // kg (total)
  label_url?: string | null
  shipping_price?: number | null
  currency?: string | null
  reference?: string | null
  notes?: string | null
  order_date?: string | null
  shipped_date?: string | null
  delivered_date?: string | null
  created_date?: string | null
  updated_date?: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'pending':
    case 'new':
      return 'PENDING'
    case 'printed':
    case 'label_created':
    case 'ready_to_ship':
      return 'LABEL_CREATED'
    case 'shipped':
    case 'in_transit':
    case 'transit':
      return 'IN_TRANSIT'
    case 'out_for_delivery':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'returned':
    case 'return_to_sender':
      return 'RETURNED'
    case 'cancelled':
    case 'deleted':
      return 'CANCELLED'
    case 'exception':
    case 'failed':
    case 'undeliverable':
      return 'EXCEPTION'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: StarshipitShipment): Shipment {
  const pkgs = raw.packages ?? []
  const firstPkg = pkgs[0]

  // Use total weight if available, otherwise sum packages
  const totalWeightKg =
    raw.weight != null
      ? raw.weight
      : pkgs.reduce<number | null>((acc, p) => {
          if (p.weight == null) return acc
          return (acc ?? 0) + p.weight
        }, null)

  const dimensions =
    firstPkg != null
      ? toDimensions(firstPkg.length, firstPkg.width, firstPkg.height, 'cm')
      : undefined

  const trackingNumbers = nonempty(
    pkgs.map((p) => p.tracking_number).filter((t): t is string => !!t),
  )

  return {
    id: raw.order_id != null ? String(raw.order_id) : undefined,
    status: mapShipmentStatus(raw.status),
    trackingNumber:
      raw.tracking_number ??
      trackingNumbers?.[0] ??
      undefined,
    carrierId: raw.carrier_code ?? raw.carrier_name ?? undefined,
    serviceCode: raw.service_code ?? raw.service_name ?? undefined,
    originAddress: transformAddress(raw.sender),
    destinationAddress: transformAddress(raw.destination),
    totalWeight: toWeight(totalWeightKg, 'kg'),
    dimensions,
    labelUrl: raw.label_url ?? undefined,
    cost:
      raw.shipping_price != null
        ? {
            amount: parseDecimal(raw.shipping_price) ?? 0,
            currency: raw.currency ?? 'AUD',
          }
        : undefined,
    reference: raw.reference ?? raw.order_number ?? undefined,
    notes: raw.notes ?? undefined,
    estimatedDeliveryAt: toISODate(raw.delivered_date),
    actualDeliveryAt: toISODate(raw.delivered_date),
    createdAt: toISODate(raw.created_date ?? raw.order_date),
    updatedAt: toISODate(raw.updated_date ?? raw.shipped_date),
    metadata: raw as Record<string, unknown>,
  }
}
