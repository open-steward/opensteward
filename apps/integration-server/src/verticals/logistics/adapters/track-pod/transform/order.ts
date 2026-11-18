import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress } from '../../shared/transform'
import { toIsoDatetime } from '@opensteward/shared'

/**
 * Raw Track-POD order as returned by GET /Order/Number/{number} etc.
 * Only the fields we actually use are declared; the rest land in metadata via [key: string].
 */
export interface TrackPodOrder {
  Id?: string | null
  Number?: string | null
  TrackId?: string | null
  Date?: string | null
  Status?: string | null
  ContactName?: string | null
  Phone?: string | null
  Email?: string | null
  Address?: string | null
  AddressLat?: number | null
  AddressLon?: number | null
  AddressZone?: string | null
  TimeSlotFrom?: string | null
  TimeSlotTo?: string | null
  Note?: string | null
  Client?: string | null
  Shipper?: string | null
  Depot?: string | null
  Weight?: number | null
  Volume?: number | null
  Pallets?: number | null
  COD?: number | null
  Barcode?: string | null
  GoodsList?: TrackPodGoodsItem[] | null
  CustomFields?: Array<{ Key?: string | null; Value?: string | null }> | null
  [key: string]: unknown
}

export interface TrackPodGoodsItem {
  OrderLineId?: string | null
  GoodsId?: string | null
  GoodsName?: string | null
  GoodsUnit?: string | null
  Quantity?: number | null
  Cost?: number | null
  Note?: string | null
  OrderLineBarcode?: string | null
  GoodsBarcode?: string | null
  [key: string]: unknown
}

function mapStatus(raw: string | null | undefined): OrderStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'delivered' || s === 'collected') return 'DELIVERED'
  if (s === 'not delivered' || s === 'not collected' || s === 'rejected') return 'RETURNED'
  if (s === 'partially') return 'SHIPPED'
  if (s === 'in progress' || s === 'active') return 'SHIPPED'
  if (s === 'unscheduled' || s === 'pending') return 'PENDING'
  if (s === 'scheduled') return 'AWAITING_SHIPMENT'
  if (s === 'cancelled' || s === 'canceled') return 'CANCELLED'
  return 'PROCESSING'
}

export function transformOrder(raw: TrackPodOrder): Order {
  // Build a synthetic address object from flat fields
  const addressRaw: Record<string, unknown> = {
    name: raw.ContactName,
    phone: raw.Phone,
    email: raw.Email,
    street1: raw.Address,
  }

  return {
    id: raw.Id ?? raw.TrackId ?? undefined,
    orderNumber: raw.Number ?? undefined,
    status: mapStatus(raw.Status),
    destinationAddress: toAddress(addressRaw),
    notes: raw.Note ?? undefined,
    orderAt: toIsoDatetime(raw.Date) ? new Date(toIsoDatetime(raw.Date)!) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function buildNewOrder(data: Partial<Order>): Record<string, unknown> {
  return {
    Number: data.orderNumber,
    Note: data.notes,
    ContactName: data.destinationAddress?.name,
    Phone: data.destinationAddress?.phone,
    Email: data.destinationAddress?.email,
    Address: data.destinationAddress?.street1,
  }
}
