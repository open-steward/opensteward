import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'

/**
 * A Route4Me order record (from the /order.php endpoint).
 * Orders represent delivery requests that can be attached to routes.
 */
export interface Route4MeOrder {
  order_id?: string | number | null
  order_status_id?: number | null
  order_status?: string | null
  tracking_number?: string | null
  ext_field_custom_data?: string | null
  /** ISO-8601 or epoch timestamp */
  order_date?: string | number | null
  /** Delivery date */
  local_time_window_start?: number | null
  local_time_window_end?: number | null
  address_1?: string | null
  address_alias?: string | null
  address_city?: string | null
  address_state_id?: string | null
  address_country_id?: string | null
  address_zip?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  email?: string | null
  member_id?: string | number | null
  day_scheduled_for_YYYYMMDD?: string | null
  [key: string]: unknown
}

function mapOrderStatus(
  statusId: number | null | undefined,
  statusStr: string | null | undefined,
): OrderStatus {
  const s = statusStr?.toLowerCase() ?? ''
  if (s.includes('cancel')) return 'CANCELLED'
  if (s.includes('delivered') || s.includes('complete')) return 'DELIVERED'
  if (s.includes('shipped') || s.includes('transit')) return 'SHIPPED'
  if (s.includes('pending') || s === '') {
    switch (statusId) {
      case 0: return 'PENDING'
      case 1: return 'PROCESSING'
      case 2: return 'AWAITING_SHIPMENT'
      case 3: return 'SHIPPED'
      case 4: return 'DELIVERED'
      case 5: return 'CANCELLED'
    }
  }
  return 'PENDING'
}

export function transformOrder(raw: Route4MeOrder): Order {
  const id = raw.order_id != null ? String(raw.order_id) : undefined

  return {
    id,
    status: mapOrderStatus(raw.order_status_id, raw.order_status),
    orderNumber: id,
    customerId: raw.member_id != null ? String(raw.member_id) : undefined,
    destinationAddress: toAddress({
      address1: raw.address_1,
      name: [raw.first_name, raw.last_name].filter(Boolean).join(' ') || raw.address_alias,
      city: raw.address_city,
      state: raw.address_state_id,
      country_code: raw.address_country_id,
      zip: raw.address_zip,
      phone: raw.phone,
      email: raw.email,
    }),
    notes: raw.ext_field_custom_data ?? undefined,
    orderAt: toISODate(raw.order_date),
    createdAt: toISODate(raw.order_date),
    metadata: raw as Record<string, unknown>,
  }
}
