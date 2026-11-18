import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface FakturoidOrderLine {
  id: number
  name: string
  quantity: number
  unit_price: number
  vat_rate: number
  unit_price_without_vat: number
  unit_price_with_vat: number
  [key: string]: unknown
}

export interface FakturoidOrder {
  id: number
  number: string
  subject_id: number
  status: string
  issued_on: string
  total: number
  currency: string
  vat_price: number
  lines: FakturoidOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  switch (status) {
    case 'completed':
    case 'invoiced':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    case 'draft':
      return 'DRAFT'
    default:
      return 'ACTIVE'
  }
}

function mapLineitem(row: FakturoidOrderLine): Lineitem {
  return {
    id: String(row.id),
    itemDescription: row.name || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.unit_price_with_vat * row.quantity,
    taxAmount: (row.unit_price_with_vat - row.unit_price_without_vat) * row.quantity || undefined,
  }
}

export function transformOrder(raw: FakturoidOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.subject_id ? String(raw.subject_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.issued_on ? new Date(raw.issued_on) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    subject_id: order.contactId ? Number(order.contactId) : undefined,
    currency: order.currency,
    issued_on: toCalendarDate(order.postedAt),
    lines: order.lineItems?.map((li) => ({
      name: li.itemDescription,
      unit_price: li.unitAmount,
      quantity: li.unitQuantity,
    })),
  }
}
