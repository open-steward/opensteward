import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface BexioSalesOrderPosition {
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

export interface BexioSalesOrder {
  id: number
  document_nr: string
  contact_id: number
  currency_id: number
  currency_code: string
  is_valid_from: string
  kb_item_status: string
  total_gross: number
  total_taxes: number
  positions: BexioSalesOrderPosition[]
  [key: string]: unknown
}

function mapStatus(raw: BexioSalesOrder): SalesOrderStatus {
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

function mapLineitem(row: BexioSalesOrderPosition): Lineitem {
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

export function transformSalesOrder(raw: BexioSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total_gross,
    lineItems: (raw.positions ?? []).map(mapLineitem),
    postedAt: raw.is_valid_from ? new Date(raw.is_valid_from) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
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
