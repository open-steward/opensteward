import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate } from '../../shared/transform'

// ── Raw GoFreight types ──────────────────────────────────────────────────────

export interface GoFreightHouseBill {
  ref?: string
  hbl_number?: string
  mbl_ref?: string
  status?: string
  shipper_ref?: string
  consignee_ref?: string
  description_of_goods?: string
  total_pieces?: number
  total_weight?: number
  total_weight_unit?: string
  total_cbm?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface GoFreightHouseBillListResponse {
  results?: GoFreightHouseBill[]
  count?: number
  next?: string | null
  previous?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const ORDER_STATUS_MAP: Record<string, OrderStatus> = {
  pending: 'PENDING',
  processing: 'PROCESSING',
  on_hold: 'ON_HOLD',
  awaiting_shipment: 'AWAITING_SHIPMENT',
  in_transit: 'SHIPPED',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
  returned: 'RETURNED',
}

function mapOrderStatus(raw: string | undefined): OrderStatus {
  if (!raw) return 'UNKNOWN'
  return ORDER_STATUS_MAP[raw.toLowerCase()] ?? 'UNKNOWN'
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformHouseBill(raw: GoFreightHouseBill): Order {
  return {
    id: raw.ref ?? undefined,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.hbl_number ?? raw.ref ?? undefined,
    shipmentIds: raw.mbl_ref ? [raw.mbl_ref] : undefined,
    notes: raw.description_of_goods ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
