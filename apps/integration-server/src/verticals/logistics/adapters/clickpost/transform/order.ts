import type { Order } from '../../../schema/order'
import { toISODate } from '../../shared/transform'

/** ClickPost order as represented in list/detail responses */
export interface ClickPostOrderDetail {
  reference_number: string | null
  waybill: string | null
  status: string | null
  clickpost_status_code: number | null
  order_type: string | null
  invoice_value: number | null
  invoice_number: string | null
  pickup_name: string | null
  pickup_address: string | null
  pickup_city: string | null
  pickup_state: string | null
  pickup_pincode: string | null
  pickup_country: string | null
  drop_name: string | null
  drop_phone: string | null
  drop_email: string | null
  drop_address: string | null
  drop_city: string | null
  drop_state: string | null
  drop_pincode: string | null
  drop_country: string | null
  items: ClickPostItem[] | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

export interface ClickPostItem {
  sku: string | null
  description: string | null
  price: number | null
  quantity: number | null
  [key: string]: unknown
}

function mapOrderStatus(
  code: number | null,
  statusStr: string | null,
): Order['status'] {
  if (code === null) {
    const s = (statusStr ?? '').toLowerCase()
    if (s.includes('cancel')) return 'CANCELLED'
    if (s.includes('delivered')) return 'DELIVERED'
    if (s.includes('transit')) return 'SHIPPED'
    return 'PENDING'
  }
  if (code === 0) return 'PENDING'
  if (code >= 1 && code <= 9) return 'AWAITING_SHIPMENT'
  if (code >= 10 && code <= 59) return 'SHIPPED'
  if (code === 60) return 'DELIVERED'
  if (code >= 70 && code <= 79) return 'PROCESSING'
  if (code >= 80 && code <= 89) return 'RETURNED'
  return 'PENDING'
}

/**
 * Transform a ClickPost order detail into a canonical Order.
 */
export function transformOrder(raw: ClickPostOrderDetail): Order {
  const lineItems = (raw.items ?? []).map((item) => ({
    sku: item.sku ?? undefined,
    name: item.description ?? undefined,
    description: item.description ?? undefined,
    quantity: item.quantity ?? undefined,
    unitAmount: item.price ?? undefined,
    totalAmount:
      item.price != null && item.quantity != null
        ? item.price * item.quantity
        : undefined,
  }))

  return {
    id: raw.reference_number ?? undefined,
    orderNumber: raw.invoice_number ?? raw.reference_number ?? undefined,
    status: mapOrderStatus(raw.clickpost_status_code ?? null, raw.status ?? null),
    originAddress: (raw.pickup_name || raw.pickup_address || raw.pickup_city)
      ? {
          name: raw.pickup_name ?? undefined,
          street1: raw.pickup_address ?? undefined,
          city: raw.pickup_city ?? undefined,
          state: raw.pickup_state ?? undefined,
          postalCode: raw.pickup_pincode ?? undefined,
          country: raw.pickup_country ?? undefined,
        }
      : undefined,
    destinationAddress: (raw.drop_name || raw.drop_address || raw.drop_city)
      ? {
          name: raw.drop_name ?? undefined,
          phone: raw.drop_phone ?? undefined,
          email: raw.drop_email ?? undefined,
          street1: raw.drop_address ?? undefined,
          city: raw.drop_city ?? undefined,
          state: raw.drop_state ?? undefined,
          postalCode: raw.drop_pincode ?? undefined,
          country: raw.drop_country ?? undefined,
        }
      : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    totalAmount: raw.invoice_value ?? undefined,
    shipmentIds: raw.waybill ? [raw.waybill] : undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
