import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, toDimensions, parseDecimal } from '../../shared/transform'
import { transformAddress, type Parcel2GoAddress } from './address'

/**
 * Parcel2Go shipment / order-line object.
 * Parcel2Go models each booked parcel as an "order line."
 */
export interface Parcel2GoShipment {
  /** Order line ID — the primary shipment identifier. */
  OrderLineId?: string | null
  /** Parent order ID. */
  OrderId?: string | null
  /** Carrier tracking number (populated after collection). */
  TrackingNumber?: string | null
  /** Current status string. */
  Status?: string | null
  /** Carrier name. */
  CourierName?: string | null
  /** Service slug (e.g. "evri-parcelshop"). */
  Slug?: string | null
  /** Total price in GBP. */
  TotalPrice?: number | string | null
  /** Collection / origin address. */
  CollectionAddress?: Parcel2GoAddress | null
  /** Delivery / destination address. */
  DeliveryAddress?: Parcel2GoAddress | null
  /** Weight in kg. */
  Weight?: number | null
  /** Length in cm. */
  Length?: number | null
  /** Width in cm. */
  Width?: number | null
  /** Height in cm. */
  Height?: number | null
  /** Label URL if available. */
  LabelUrl?: string | null
  /** Estimated delivery date. */
  EstimatedDeliveryDate?: string | null
  /** ISO string when created. */
  CreatedAt?: string | null
  /** ISO string when last updated. */
  UpdatedAt?: string | null
  [key: string]: unknown
}

function mapStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const lower = status.toLowerCase()
  if (lower.includes('delivered')) return 'DELIVERED'
  if (lower.includes('out_for_delivery') || lower.includes('out for delivery')) return 'OUT_FOR_DELIVERY'
  if (lower.includes('in_transit') || lower.includes('in transit') || lower.includes('collected')) return 'IN_TRANSIT'
  if (lower.includes('label') || lower.includes('booked') || lower.includes('awaiting')) return 'LABEL_CREATED'
  if (lower.includes('pending')) return 'PENDING'
  if (lower.includes('return')) return 'RETURNED'
  if (lower.includes('cancel')) return 'CANCELLED'
  if (lower.includes('exception') || lower.includes('fail')) return 'EXCEPTION'
  return 'UNKNOWN'
}

export function transformShipment(raw: Parcel2GoShipment): Shipment {
  return {
    id: raw.OrderLineId ?? raw.OrderId ?? undefined,
    status: mapStatus(raw.Status),
    trackingNumber: raw.TrackingNumber ?? undefined,
    carrierId: raw.CourierName ?? undefined,
    serviceCode: raw.Slug ?? undefined,
    originAddress: raw.CollectionAddress ? transformAddress(raw.CollectionAddress) : undefined,
    destinationAddress: raw.DeliveryAddress ? transformAddress(raw.DeliveryAddress) : undefined,
    totalWeight: raw.Weight != null ? toWeight(raw.Weight, 'kg') : undefined,
    dimensions:
      raw.Length != null && raw.Width != null && raw.Height != null
        ? toDimensions(raw.Length, raw.Width, raw.Height, 'cm')
        : undefined,
    labelUrl: raw.LabelUrl ?? undefined,
    cost:
      raw.TotalPrice != null
        ? { amount: parseDecimal(raw.TotalPrice) ?? 0, currency: 'GBP' }
        : undefined,
    estimatedDeliveryAt: toISODate(raw.EstimatedDeliveryDate),
    createdAt: toISODate(raw.CreatedAt),
    updatedAt: toISODate(raw.UpdatedAt),
    mode: 'parcel',
    metadata: raw as Record<string, unknown>,
  }
}
