import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'

// GHN Order Info response shape
// POST /shiip/public-api/v2/shipping-order/detail
// Response: { code, message, data: GhnOrderRaw }
export interface GhnOrderRaw {
  order_code?: string | null
  client_order_code?: string | null
  status?: string | null
  order_date?: string | null
  finish_date?: string | null
  // Sender
  from_name?: string | null
  from_phone?: string | null
  from_address?: string | null
  from_ward_code?: string | null
  from_district_id?: number | null
  // Recipient
  to_name?: string | null
  to_phone?: string | null
  to_address?: string | null
  to_ward_code?: string | null
  to_district_id?: number | null
  // Warehouse
  pick_warehouse_id?: number | null
  deliver_warehouse_id?: number | null
  // Amounts (VND, whole units)
  cod_amount?: number | null
  insurance_value?: number | null
  total_fee?: number | null
  // Service
  service_id?: number | null
  service_type_id?: number | null
  payment_type_id?: number | null
  weight?: number | null
  // Items
  items?: Array<{
    name?: string | null
    quantity?: number | null
    weight?: number | null
    [key: string]: unknown
  }> | null
  note?: string | null
  required_note?: string | null
  leadtime?: string | null
  [key: string]: unknown
}

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toUpperCase()
  if (s.includes('CANCEL')) return 'CANCELLED'
  if (s.includes('RETURN')) return 'RETURNED'
  if (s.includes('DELIVERED') || s.includes('FINISH')) return 'DELIVERED'
  if (s.includes('TRANSIT') || s.includes('DELIVERING') || s.includes('SORTING')) return 'SHIPPED'
  if (s.includes('READY_TO_PICK') || s.includes('WAITING')) return 'AWAITING_SHIPMENT'
  if (s.includes('PROCESSING')) return 'PROCESSING'
  return 'UNKNOWN'
}

export function transformOrder(raw: GhnOrderRaw): Order {
  const origin = (raw.from_name || raw.from_phone || raw.from_address)
    ? {
        name: raw.from_name ?? undefined,
        phone: raw.from_phone ?? undefined,
        street1: raw.from_address ?? undefined,
      }
    : undefined

  const destination = (raw.to_name || raw.to_phone || raw.to_address)
    ? {
        name: raw.to_name ?? undefined,
        phone: raw.to_phone ?? undefined,
        street1: raw.to_address ?? undefined,
      }
    : undefined

  const lineItems = raw.items
    ? raw.items.map((item) => ({
        name: item.name ?? undefined,
        quantity: typeof item.quantity === 'number' ? item.quantity : undefined,
        weight: typeof item.weight === 'number'
          ? { value: item.weight, unit: 'g' as const }
          : undefined,
      }))
    : undefined

  return {
    id: raw.order_code ?? raw.client_order_code ?? '',
    orderNumber: raw.client_order_code ?? raw.order_code ?? undefined,
    status: mapOrderStatus(raw.status),
    warehouseId: raw.pick_warehouse_id != null ? String(raw.pick_warehouse_id) : undefined,
    originAddress: toAddress(origin as Record<string, unknown>),
    destinationAddress: toAddress(destination as Record<string, unknown>),
    lineItems: lineItems && lineItems.length > 0 ? lineItems : undefined,
    totalAmount: typeof raw.total_fee === 'number' ? raw.total_fee : undefined,
    notes: raw.note ?? raw.required_note ?? undefined,
    requestedServiceCode: raw.service_id != null ? String(raw.service_id) : undefined,
    orderAt: toISODate(raw.order_date),
    deliveredAt: toISODate(raw.finish_date),
    createdAt: toISODate(raw.order_date),
    metadata: raw as Record<string, unknown>,
  }
}
