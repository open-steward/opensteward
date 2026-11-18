import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'
import { toMinorUnits } from '../../shared/transform'

/** Safely parse a KashFlow date string into a Date. Never throws. */
function toDate(val: unknown): Date | undefined {
  const iso = toIsoDatetime(val)
  return iso ? new Date(iso) : undefined
}

// KashFlow REST API v2 — Purchase (bill / supplier invoice)
// Docs: https://www.kashflow.com/developers/rest-api/api-purchases/

export interface KashflowPurchaseLineItem {
  Number?: number
  Description?: string
  Quantity?: number
  Rate?: number
  VATLevel?: number
  VATAmount?: number
  NominalCode?: number
  NominalName?: string
  ProductCode?: string
  ProductName?: string
  ProjectNumber?: number
  [key: string]: unknown
}

export interface KashflowPurchaseCurrency {
  Code?: string
  [key: string]: unknown
}

export interface KashflowPurchase {
  Number?: number
  Id?: string
  // Supplier
  SupplierCode?: string
  SupplierId?: number
  SupplierName?: string
  SupplierReference?: string
  // Dates
  IssuedDate?: string
  DueDate?: string
  PaidDate?: string
  // Amounts
  GrossAmount?: number
  NetAmount?: number
  VATAmount?: number
  TotalPaidAmount?: number
  // Status: "Unpaid" | "Paid" | "Overpaid" | "Overdue" | "NA"
  Status?: string
  OverdueDays?: number
  // Currency
  Currency?: KashflowPurchaseCurrency
  // Lines
  LineItems?: KashflowPurchaseLineItem[]
  // Misc
  Permalink?: string
  [key: string]: unknown
}

function mapStatus(raw: KashflowPurchase): BillStatus {
  const s = (raw.Status ?? '').toLowerCase()
  if (s === 'paid' || s === 'overpaid') return 'PAID'
  if (s === 'overdue') return 'OVERDUE'
  if (s === 'unpaid') {
    if (
      typeof raw.TotalPaidAmount === 'number' &&
      raw.TotalPaidAmount > 0 &&
      typeof raw.GrossAmount === 'number' &&
      raw.TotalPaidAmount < raw.GrossAmount
    ) {
      return 'PARTIALLY_PAID'
    }
    return 'AUTHORIZED'
  }
  return 'DRAFT'
}

function mapLineItem(li: KashflowPurchaseLineItem): Lineitem {
  // KashFlow returns amounts as decimal pounds (e.g. 100.00); convert to minor units (pence).
  const unitAmount = toMinorUnits(li.Rate)
  const taxAmount = toMinorUnits(li.VATAmount)
  const totalAmount =
    li.Rate !== undefined && li.Quantity !== undefined
      ? toMinorUnits(li.Rate * li.Quantity + (li.VATAmount ?? 0))
      : undefined
  return {
    id: li.Number !== undefined ? String(li.Number) : undefined,
    accountId: li.NominalCode !== undefined ? String(li.NominalCode) : undefined,
    itemId: li.ProductCode || undefined,
    itemName: li.ProductName || li.NominalName || undefined,
    itemDescription: li.Description || undefined,
    unitAmount,
    unitQuantity: li.Quantity,
    taxAmount,
    totalAmount,
  }
}

export function transformBill(raw: KashflowPurchase): Bill {
  // KashFlow returns amounts as decimal pounds (e.g. 1100.00); convert to minor units (pence).
  const totalAmount = toMinorUnits(raw.GrossAmount)
  const taxAmount = toMinorUnits(raw.VATAmount)
  const paidAmount = toMinorUnits(raw.TotalPaidAmount)
  const balanceAmount =
    totalAmount !== undefined && paidAmount !== undefined
      ? totalAmount - paidAmount
      : undefined

  return {
    id: raw.Number !== undefined ? String(raw.Number) : raw.Id ?? undefined,
    status: mapStatus(raw),
    billNumber: raw.Number !== undefined ? String(raw.Number) : undefined,
    contactId: raw.SupplierCode || undefined,
    currency: raw.Currency?.Code || undefined,
    totalAmount,
    taxAmount,
    paidAmount,
    balanceAmount,
    url: raw.Permalink || undefined,
    lineItems: (raw.LineItems ?? []).map(mapLineItem),
    postedAt: toDate(raw.IssuedDate),
    dueAt: toDate(raw.DueDate),
    paidAt: toDate(raw.PaidDate),
    metadata: raw as Record<string, unknown>,
  }
}
