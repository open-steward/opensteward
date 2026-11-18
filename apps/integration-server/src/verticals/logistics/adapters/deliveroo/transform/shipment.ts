import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate } from '../../shared/transform'

/**
 * Raw Deliveroo order as returned by POST /signature/v2/orders
 * or GET /signature/v1/orders/{id}.
 */
export interface DeliverooOrderRaw {
  id?: string | null
  status?: string | null
  restaurant_id?: string | null
  customer?: Record<string, unknown> | null
  address?: Record<string, unknown> | null
  items?: Array<Record<string, unknown>> | null
  partner_fee_fractional?: number | null
  currency?: string | null
  delivery_eta?: string | null
  created_at?: string | null
  updated_at?: string | null
  tracking_url?: string | null
  [key: string]: unknown
}

/**
 * Map Deliveroo order/delivery status to canonical ShipmentStatus.
 *
 * Deliveroo status lifecycle:
 *   pending → placed → accepted → rider_assigned → rider_arrived
 *   → rider_in_transit → rider_nearby → delivered
 *   Terminal negatives: canceled, rejected, undeliverable
 */
function mapStatus(s: string | null | undefined): ShipmentStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'pending':
    case 'placed':
      return 'PENDING'
    case 'accepted':
    case 'confirmed':
    case 'rider_assigned':
      return 'LABEL_CREATED'
    case 'rider_arrived':
    case 'rider_in_transit':
      return 'IN_TRANSIT'
    case 'rider_nearby':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'rejected':
    case 'canceled':
    case 'cancelled':
    case 'undeliverable':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: DeliverooOrderRaw): Shipment {
  const addrRaw = raw.address ?? null
  const customerRaw = raw.customer ?? null

  // Deliveroo address object uses street/postcode fields
  const addressNormalised: Record<string, unknown> = addrRaw
    ? {
        address1: (addrRaw as Record<string, unknown>).address1 ?? (addrRaw as Record<string, unknown>).street,
        address_line1: (addrRaw as Record<string, unknown>).address_line1,
        city: (addrRaw as Record<string, unknown>).city,
        state: (addrRaw as Record<string, unknown>).state ?? (addrRaw as Record<string, unknown>).region,
        postal_code: (addrRaw as Record<string, unknown>).postcode ?? (addrRaw as Record<string, unknown>).postal_code,
        country: (addrRaw as Record<string, unknown>).country_code ?? (addrRaw as Record<string, unknown>).country,
        ...(addrRaw as Record<string, unknown>),
      }
    : {}

  const customerNormalised: Record<string, unknown> = customerRaw
    ? {
        full_name:
          (customerRaw as Record<string, unknown>).full_name ??
          (customerRaw as Record<string, unknown>).name,
        phone: (customerRaw as Record<string, unknown>).phone_number ?? (customerRaw as Record<string, unknown>).phone,
        email: (customerRaw as Record<string, unknown>).email,
        ...addressNormalised,
      }
    : {}

  const totalAmount =
    raw.partner_fee_fractional != null ? raw.partner_fee_fractional : undefined
  const currency =
    typeof raw.currency === 'string' && raw.currency.length === 3
      ? (raw.currency as string)
      : undefined

  return {
    id: raw.id ?? undefined,
    status: mapStatus(raw.status),
    trackingNumber: raw.id ?? undefined,
    carrierId: 'deliveroo',
    destinationAddress: toAddress(Object.keys(customerNormalised).length ? customerNormalised : null),
    labelUrl: typeof raw.tracking_url === 'string' ? raw.tracking_url : undefined,
    estimatedDeliveryAt: toISODate(raw.delivery_eta),
    cost:
      totalAmount != null && currency != null
        ? { amount: totalAmount, currency }
        : undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
