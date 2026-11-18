/**
 * Epos Now Transaction -> canonical Order.
 *
 * In Epos Now, "Transactions" are sales/orders. Each transaction contains
 * TransactionItems (line items) and Tenders (payments). Money is in decimal.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
} from '../../../schema/order'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ──────────────────────────────────────────────────────────────

export interface RawEposNowTransactionItem {
  Id?: number
  ProductId?: number
  ProductName?: string
  Quantity?: number
  UnitPrice?: number
  TotalPrice?: number
  DiscountAmount?: number
  [key: string]: unknown
}

export interface RawEposNowTender {
  Id?: number
  Amount?: number
  TenderTypeId?: number
  TenderTypeName?: string
  [key: string]: unknown
}

export interface RawEposNowTransaction {
  Id?: number
  TransactionNumber?: string
  CustomerId?: number | null
  StaffId?: number | null
  LocationId?: number | null
  DeviceId?: number | null
  TotalAmount?: number
  TotalTax?: number
  DiscountAmount?: number
  TransactionItems?: RawEposNowTransactionItem[]
  Tenders?: RawEposNowTender[]
  Voided?: boolean
  Completed?: boolean
  DateTime?: string
  CreatedDate?: string
  LastUpdatedDate?: string
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapFinancialStatus(raw: RawEposNowTransaction): OrderFinancialStatus | undefined {
  if (raw.Voided) return 'VOIDED'
  if (raw.Completed) return 'PAID'
  return 'PENDING'
}

function mapLineItem(raw: RawEposNowTransactionItem, currency: string): LineItem {
  const productId = raw.ProductId != null ? String(raw.ProductId) : undefined
  return {
    id: String(raw.Id ?? ''),
    productId,
    variantId: productId,
    title: raw.ProductName ?? '',
    quantity: raw.Quantity ?? 1,
    price: {
      amount: majorToMinor(raw.UnitPrice ?? 0, currency),
      currency,
    },
    totalDiscount: raw.DiscountAmount != null
      ? { amount: majorToMinor(raw.DiscountAmount, currency), currency }
      : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformOrder(raw: RawEposNowTransaction): Order {
  const currency = 'GBP'
  const lineItems = (raw.TransactionItems ?? []).map((li) => mapLineItem(li, currency))
  const transactionIds = (raw.Tenders ?? [])
    .filter((t) => t.Id != null)
    .map((t) => String(t.Id))

  return {
    id: String(raw.Id ?? ''),
    orderNumber: raw.TransactionNumber ?? undefined,
    name: raw.TransactionNumber ? `#${raw.TransactionNumber}` : undefined,
    customerId: raw.CustomerId != null ? String(raw.CustomerId) : undefined,
    currency,
    totalPrice: raw.TotalAmount != null
      ? { amount: majorToMinor(raw.TotalAmount, currency), currency }
      : undefined,
    totalTax: raw.TotalTax != null
      ? { amount: majorToMinor(raw.TotalTax, currency), currency }
      : undefined,
    totalDiscounts: raw.DiscountAmount != null
      ? { amount: majorToMinor(raw.DiscountAmount, currency), currency }
      : undefined,
    financialStatus: mapFinancialStatus(raw),
    fulfillmentStatus: 'UNFULFILLED',
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    transactionIds: transactionIds.length > 0 ? transactionIds : undefined,
    createdAt: raw.CreatedDate ?? raw.DateTime ?? undefined,
    updatedAt: raw.LastUpdatedDate ?? undefined,
    processedAt: raw.DateTime ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order -> Epos Now transaction body for create. */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    TransactionItems: order.lineItems?.map((li) => ({
      ProductId: li.productId != null ? Number(li.productId) : undefined,
      ProductName: li.title,
      Quantity: li.quantity,
      UnitPrice: li.price?.amount,
    })),
  }
}
