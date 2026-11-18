import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'

// ─── Delhivery raw types ───────────────────────────────────────────────────
// Source: POST https://track.delhivery.com/api/cmu/create.json
//         GET  https://track.delhivery.com/api/v1/packages/?waybill=<wbn>

export interface DelhiveryOrderPackage {
  waybill: string | null
  order_id: string | null
  status: string | null
  payment_mode: string | null
  pickup_location: string | null
  seller_name: string | null
  seller_address: string | null
  seller_city: string | null
  seller_state: string | null
  seller_pin: string | null
  seller_phone: string | null
  consignee_name: string | null
  consignee_address1: string | null
  consignee_city: string | null
  consignee_state: string | null
  consignee_pincode: string | null
  consignee_phone: string | null
  item_description: string | null
  declared_value: number | null
  cod_amount: number | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

export interface DelhiveryOrderResponse {
  packages?: DelhiveryOrderPackage[] | null
  cash_pickups?: unknown[] | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapOrderStatus(status: string | null): OrderStatus {
  switch (status) {
    case 'Manifested':       return 'AWAITING_SHIPMENT'
    case 'In Transit':       return 'SHIPPED'
    case 'Dispatched':       return 'SHIPPED'
    case 'Out for delivery': return 'SHIPPED'
    case 'Delivered':        return 'DELIVERED'
    case 'Undelivered':      return 'ON_HOLD'
    case 'RTO':              return 'RETURNED'
    case 'Cancelled':        return 'CANCELLED'
    default:                 return 'PENDING'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformOrder(raw: DelhiveryOrderPackage): Order {
  const originRaw: Record<string, unknown> = {
    name: raw.seller_name,
    address_line1: raw.seller_address,
    city: raw.seller_city,
    state: raw.seller_state,
    postal_code: raw.seller_pin,
    phone: raw.seller_phone,
  }

  const destinationRaw: Record<string, unknown> = {
    name: raw.consignee_name,
    address_line1: raw.consignee_address1,
    city: raw.consignee_city,
    state: raw.consignee_state,
    postal_code: raw.consignee_pincode,
    phone: raw.consignee_phone,
  }

  return {
    id: raw.waybill ?? raw.order_id ?? undefined,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.order_id ?? undefined,
    shipmentIds: raw.waybill ? [raw.waybill] : undefined,
    originAddress: toAddress(originRaw),
    destinationAddress: toAddress(destinationRaw),
    totalAmount: raw.declared_value ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformOrderResponse(raw: DelhiveryOrderResponse): Order[] {
  const pkgs = raw.packages ?? []
  return pkgs.map((pkg) => transformOrder(pkg))
}
