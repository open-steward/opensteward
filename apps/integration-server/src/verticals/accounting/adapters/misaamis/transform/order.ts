import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface MisaAmisOrderDetail {
  id: string
  description: string
  unit: string
  quantity: number
  unit_price: number
  amount: number
  vat_rate: number
  vat_amount: number
  account_id: string
  account_code: string
  [key: string]: unknown
}

export interface MisaAmisOrder {
  id: string
  order_number: string
  order_date: string
  delivery_date: string
  total_amount: number
  vat_amount: number
  total_payment: number
  partner_id: string
  partner_name: string
  status: number
  order_details: MisaAmisOrderDetail[]
  [key: string]: unknown
}

function mapStatus(status: number): OrderStatus {
  switch (status) {
    case 0:
      return 'DRAFT'
    case 1:
      return 'ACTIVE'
    case 2:
      return 'COMPLETED'
    case 3:
      return 'CANCELLED'
    default:
      return 'ACTIVE'
  }
}

function mapLineitem(row: MisaAmisOrderDetail): Lineitem {
  return {
    id: row.id || undefined,
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
    taxAmount: row.vat_amount || undefined,
  }
}

export function transformOrder(raw: MisaAmisOrder): Order {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.partner_id || undefined,
    totalAmount: raw.total_payment,
    lineItems: (raw.order_details ?? []).map(mapLineitem),
    postedAt: raw.order_date ? new Date(raw.order_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
