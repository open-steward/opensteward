import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'

export interface BringgOrder {
  id: number | string
  status?: number | string | null
  external_id?: string | null
  team_id?: number | string | null
  customer?: { id?: number | string | null; name?: string | null; phone?: string | null; email?: string | null } | null
  way_points?: Array<{
    address?: string | null
    lat?: number | null
    lng?: number | null
    customer_name?: string | null
    phone?: string | null
    email?: string | null
    city?: string | null
    state?: string | null
    zipcode?: string | null
    house_number?: string | null
    street?: string | null
    done?: boolean | null
    scheduled_at?: string | null
  }> | null
  title?: string | null
  note?: string | null
  scheduled_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

// Bringg task statuses: 0=Created, 1=Assigned, 2=OnTheWay, 3=CheckedIn, 4=Done,
// 5=Late, 6=Accepted, 7=Cancelled, 8=Rejected
function mapStatus(s: number | string | null | undefined): OrderStatus {
  const v = typeof s === 'string' ? s.toLowerCase() : s
  switch (v) {
    case 0: case 'created':     return 'PENDING'
    case 1: case 'assigned':
    case 6: case 'accepted':    return 'PROCESSING'
    case 2: case 'on_the_way':
    case 3: case 'checked_in':  return 'SHIPPED'
    case 4: case 'done':        return 'DELIVERED'
    case 7: case 'cancelled':
    case 'canceled':            return 'CANCELLED'
    case 8: case 'rejected':    return 'CANCELLED'
    default:                    return 'UNKNOWN'
  }
}

function wpToAddress(wp: NonNullable<BringgOrder['way_points']>[number]) {
  const street1 = [wp.house_number, wp.street].filter(Boolean).join(' ') || wp.address || undefined
  return toAddress({
    name: wp.customer_name,
    street1,
    city: wp.city,
    state: wp.state,
    postalCode: wp.zipcode,
    phone: wp.phone,
    email: wp.email,
  })
}

export function transformOrder(raw: BringgOrder): Order {
  const wps = raw.way_points ?? []
  const pickup = wps.length > 1 ? wps[0] : undefined
  const dropoff = wps.length > 0 ? wps[wps.length - 1] : undefined

  return {
    id: String(raw.id),
    status: mapStatus(raw.status ?? undefined),
    orderNumber: raw.external_id ?? String(raw.id),
    customerId: raw.customer?.id != null ? String(raw.customer.id) : undefined,
    warehouseId: raw.team_id != null ? String(raw.team_id) : undefined,
    shipmentIds: undefined,
    originAddress: pickup ? wpToAddress(pickup) : undefined,
    destinationAddress: dropoff ? wpToAddress(dropoff) : undefined,
    notes: raw.note ?? raw.title ?? undefined,
    orderAt: toISODate(raw.scheduled_at ?? raw.created_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
