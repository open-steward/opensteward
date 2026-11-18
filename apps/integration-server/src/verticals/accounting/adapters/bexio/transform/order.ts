import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface BexioOrderPosition {
  id: string
  article_id: string
  text: string
  amount: number
  unit_price: number
  position_total: number
  tax_id: string
  tax_value: number
  account_id: string
  discount: number
  [key: string]: unknown
}

export interface BexioOrder {
  id: number
  document_nr: string
  contact_id: number
  currency_id: number
  currency_code: string
  is_valid_from: string
  kb_item_status: string
  total_gross: number
  total_taxes: number
  positions: BexioOrderPosition[]
  [key: string]: unknown
}

function mapStatus(raw: BexioOrder): OrderStatus {
  switch (raw.kb_item_status) {
    case 'done':
    case 'completed':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    case 'draft':
      return 'DRAFT'
    default:
      return 'ACTIVE'
  }
}

function mapLineitem(row: BexioOrderPosition): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id ? String(row.account_id) : undefined,
    itemId: row.article_id ? String(row.article_id) : undefined,
    itemDescription: row.text || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.amount,
    totalAmount: row.position_total,
    taxAmount: row.tax_value || undefined,
    taxrateId: row.tax_id ? String(row.tax_id) : undefined,
    discountAmount: row.discount || undefined,
  }
}

export function transformOrder(raw: BexioOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    type: 'SALES',
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total_gross,
    lineItems: (raw.positions ?? []).map(mapLineitem),
    postedAt: raw.is_valid_from ? new Date(raw.is_valid_from) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    contact_id: order.contactId ? Number(order.contactId) : undefined,
    currency_code: order.currency,
    is_valid_from: toCalendarDate(order.postedAt),
    positions: order.lineItems?.map((li) => ({
      article_id: li.itemId,
      text: li.itemDescription,
      unit_price: li.unitAmount,
      amount: li.unitQuantity,
      account_id: li.accountId,
    })),
  }
}
