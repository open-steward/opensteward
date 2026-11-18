import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

/**
 * Convert a Bigcapital float major-unit amount to integer minor units (cents).
 * Returns undefined when the value is not a finite number.
 */
function toMinor(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !isFinite(value)) return undefined
  return Math.round(value * 100)
}

/**
 * Bigcapital models sale estimates (quotes) as the pre-sale order stage.
 * They carry customer, line items, amounts, and lifecycle status (approved,
 * rejected, converted to invoice) that maps onto the canonical SalesOrder.
 *
 * Source endpoint: GET /api/sale-estimates  and  GET /api/sale-estimates/{id}
 * OpenAPI schema: SaleEstimateResponseDto
 */
export interface BigcapitalEstimateEntry {
  index: number
  itemId?: number
  rate?: number
  quantity?: number
  discount?: number
  discountType?: string
  description?: string
  taxRateId?: number
  sellAccountId?: number
  [key: string]: unknown
}

export interface BigcapitalSaleEstimate {
  id: number
  estimateNumber?: string
  estimateDate: string
  expirationDate?: string
  customerId: number
  currencyCode?: string
  note?: string
  reference?: string
  amount?: number
  entries: BigcapitalEstimateEntry[]
  // lifecycle timestamps — null means that stage hasn't occurred
  deliveredAt?: string | null
  approvedAt?: string | null
  rejectedAt?: string | null
  convertedToInvoiceId?: number | null
  convertedToInvoiceAt?: string | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapStatus(raw: BigcapitalSaleEstimate): SalesOrderStatus {
  if (raw.rejectedAt) return 'CANCELLED'
  if (raw.convertedToInvoiceId) return 'COMPLETED'
  if (raw.approvedAt) return 'ACTIVE'
  if (raw.deliveredAt) return 'ACTIVE'
  return 'DRAFT'
}

function mapEntry(entry: BigcapitalEstimateEntry): Lineitem {
  return {
    id: String(entry.index),
    itemId: entry.itemId != null ? String(entry.itemId) : undefined,
    itemDescription: entry.description || undefined,
    unitAmount: toMinor(entry.rate),
    unitQuantity: entry.quantity ?? undefined,
    discountAmount: toMinor(entry.discount),
  }
}

export function transformSalesOrder(raw: BigcapitalSaleEstimate): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    contactId: raw.customerId != null ? String(raw.customerId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: toMinor(raw.amount),
    lineItems: (raw.entries ?? []).map(mapEntry),
    postedAt: raw.estimateDate ? new Date(raw.estimateDate) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    customerId: order.contactId != null ? Number(order.contactId) : undefined,
    currencyCode: order.currency,
    estimateDate: toCalendarDate(order.postedAt),
    entries: order.lineItems?.map((li, idx) => ({
      index: idx + 1,
      itemId: li.itemId != null ? Number(li.itemId) : undefined,
      description: li.itemDescription,
      rate: li.unitAmount != null ? li.unitAmount / 100 : undefined,
      quantity: li.unitQuantity,
      discount: li.discountAmount != null ? li.discountAmount / 100 : undefined,
    })),
  }
}
