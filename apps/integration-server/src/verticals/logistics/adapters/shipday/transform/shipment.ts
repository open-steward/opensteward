import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'
import type { ShipdayOrder } from './order'

/**
 * Shipday models deliveries as orders; we project an order onto the canonical
 * Shipment shape so that shipment-oriented integrations can consume Shipday
 * data without loss.
 */

function mapStatus(raw: string | null | undefined): ShipmentStatus {
  if (!raw) return 'UNKNOWN'
  const s = String(raw).toUpperCase()
  if (s === 'ASSIGNED' || s === 'ACCEPTED') return 'LABEL_CREATED'
  if (s === 'STARTED' || s === 'PICKED_UP') return 'IN_TRANSIT'
  if (s === 'OUT_FOR_DELIVERY') return 'OUT_FOR_DELIVERY'
  if (s === 'DELIVERED') return 'DELIVERED'
  if (s === 'CANCELLED' || s === 'CANCELED') return 'CANCELLED'
  if (s === 'RETURNED') return 'RETURNED'
  return 'UNKNOWN'
}

export function transformShipment(raw: ShipdayOrder): Shipment {
  const deliveryAddress = raw.customer?.address ?? null
  const pickupAddress = raw.pickup?.address ?? raw.pickupAddress ?? null

  return {
    id: raw.orderId != null ? String(raw.orderId) : (raw.orderNumber ?? undefined),
    status: mapStatus(raw.status),
    trackingNumber: raw.orderNumber ?? (raw.orderId != null ? String(raw.orderId) : undefined),
    carrierId: 'shipday',
    reference: raw.orderNumber ?? undefined,
    destinationAddress: deliveryAddress
      ? {
          name: raw.customer?.name ?? raw.customerName ?? undefined,
          street1: deliveryAddress.street ?? undefined,
          city: deliveryAddress.city ?? undefined,
          state: deliveryAddress.state ?? undefined,
          postalCode: deliveryAddress.zip ?? undefined,
          country: deliveryAddress.country ?? undefined,
          phone: raw.customer?.phone_number ?? raw.customerPhoneNumber ?? undefined,
          email: raw.customer?.email ?? raw.customerEmail ?? undefined,
        }
      : raw.customerAddress
        ? {
            name: raw.customerName ?? undefined,
            street1: raw.customerAddress,
            phone: raw.customerPhoneNumber ?? undefined,
            email: raw.customerEmail ?? undefined,
          }
        : undefined,
    originAddress: pickupAddress
      ? {
          name: raw.pickup?.name ?? raw.pickupName ?? undefined,
          street1: (pickupAddress as { street?: string | null }).street ?? undefined,
          city: (pickupAddress as { city?: string | null }).city ?? undefined,
          state: (pickupAddress as { state?: string | null }).state ?? undefined,
          postalCode: (pickupAddress as { zip?: string | null }).zip ?? undefined,
          country: (pickupAddress as { country?: string | null }).country ?? undefined,
          phone: raw.pickup?.phone_number ?? raw.pickupPhoneNumber ?? undefined,
        }
      : undefined,
    estimatedDeliveryAt: toISODate(raw.expectedDeliveryDate),
    actualDeliveryAt: toISODate(raw.deliveryTime),
    createdAt: toISODate(raw.createdAt ?? raw.orderTime),
    updatedAt: toISODate(raw.updatedAt),
    notes: undefined,
    metadata: raw as Record<string, unknown>,
  }
}
