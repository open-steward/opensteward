/**
 * Medius purchase order → canonical PurchaseOrder.
 *
 * Export endpoint: GET /integration/masterdata/v1/purchaseOrders
 * Response body: PurchaseOrderExportPageDto  { purchaseOrders: PurchaseOrderDto[], … }
 *
 * PurchaseOrderDto key fields (from Medius OpenAPI spec):
 *   name, supplierId, supplierGlobalId, supplierName, companyId, companyName,
 *   currencyCode, amount (decimal), orderIdentifier, orderIdentifier2,
 *   registerDate (date-time), dueDate (date-time), isActive, reference, reference2,
 *   purchaseOrderLines[]  (PurchaseOrderLineDto)
 *
 * PurchaseOrderLineDto (PurchaseOrderLineDto from spec):
 *   lineNumber, itemNumber, itemDescription, quantity (decimal),
 *   unitPrice (decimal), isServiceBased, taxIndicator1/2
 *
 * NOTE: PurchaseOrderLineDto does NOT have an `amount` field; line total must
 * be derived as Math.round((unitPrice * quantity) * 100) when both are present.
 *
 * MONEY: All Medius amounts are decimal format. Canonical amounts are integer
 * minor units — multiply by 100 and Math.round().
 */

import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

// ── Raw Medius types ───────────────────────────────────────────────────────────

export interface MediusPurchaseOrderLine {
  lineNumber?: string
  orderIdentifier?: string
  itemNumber?: string
  // PurchaseOrderLineDto uses `itemDescription` (not `description`)
  itemDescription?: string
  description?: string
  quantity?: number
  unitPrice?: number
  /** PurchaseOrderLineDto does not have `amount`; present in some shapes. */
  amount?: number
  currencyCode?: string
  [key: string]: unknown
}

export interface MediusPurchaseOrder {
  name?: string
  supplierId?: string
  supplierGlobalId?: string
  supplierName?: string
  companyId?: string
  companyName?: string
  currencyCode?: string
  amount?: number
  orderIdentifier?: string
  orderIdentifier2?: string
  reference?: string
  reference2?: string
  registerDate?: string
  dueDate?: string
  isActive?: boolean
  purchaseOrderLines?: MediusPurchaseOrderLine[]
  mediusFlowSystemId?: string
  globalId?: string
  [key: string]: unknown
}

export interface MediusPurchaseOrderPage {
  purchaseOrders: MediusPurchaseOrder[]
  offset: number
  limit: number
  total: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Convert a Medius decimal amount to canonical integer minor units.
 * Medius returns amounts as decimal numbers (e.g. 1250.00 for $1,250.00).
 * Returns undefined when input is null/undefined (missing-rather-than-wrong).
 */
function toMinorUnits(val: number | null | undefined): number | undefined {
  if (val == null) return undefined
  return Math.round(val * 100)
}

function tryParseDate(val: unknown): Date | undefined {
  if (val === null || val === undefined || val === '') return undefined
  if (typeof val !== 'string' && typeof val !== 'number' && !(val instanceof Date)) return undefined
  const d = val instanceof Date ? val : new Date(val as string | number)
  return isNaN(d.getTime()) ? undefined : d
}

function mapStatus(raw: MediusPurchaseOrder): PurchaseOrderStatus {
  if (raw.isActive === false) return 'COMPLETED'
  return 'ACTIVE'
}

function mapLines(lines: MediusPurchaseOrderLine[] | undefined): Lineitem[] {
  if (!lines?.length) return []
  return lines.map((l) => {
    const unitAmountMinor = toMinorUnits(l.unitPrice != null ? l.unitPrice : undefined)
    const qty = l.quantity != null ? Math.round(l.quantity) : undefined
    // Derive line total from unit price × quantity when `amount` is absent
    const totalMinor = l.amount != null
      ? toMinorUnits(l.amount)
      : (unitAmountMinor != null && qty != null ? Math.round(unitAmountMinor * qty) : undefined)
    return {
      id: (typeof l.lineNumber === 'string' ? l.lineNumber : undefined)
        || (typeof l.orderIdentifier === 'string' ? l.orderIdentifier : undefined)
        || undefined,
      itemName: typeof l.itemNumber === 'string' ? l.itemNumber || undefined : undefined,
      // prefer itemDescription over description
      itemDescription: typeof l.itemDescription === 'string'
        ? l.itemDescription || undefined
        : typeof l.description === 'string' ? l.description || undefined : undefined,
      // Medius unitPrice is decimal — convert to integer minor units
      unitAmount: unitAmountMinor,
      unitQuantity: qty,
      totalAmount: totalMinor,
    }
  })
}

// ── Transform ──────────────────────────────────────────────────────────────────

export function transformPurchaseOrder(raw: MediusPurchaseOrder): PurchaseOrder {
  const lines = mapLines(raw.purchaseOrderLines)
  return {
    id: (typeof raw.orderIdentifier === 'string' ? raw.orderIdentifier : undefined)
      || (typeof raw.mediusFlowSystemId === 'string' ? raw.mediusFlowSystemId : undefined)
      || (typeof raw.globalId === 'string' ? raw.globalId : undefined)
      || undefined,
    status: mapStatus(raw),
    contactId: (typeof raw.supplierId === 'string' ? raw.supplierId : undefined)
      || (typeof raw.supplierGlobalId === 'string' ? raw.supplierGlobalId : undefined)
      || undefined,
    currency: typeof raw.currencyCode === 'string' ? raw.currencyCode || undefined : undefined,
    // Medius `amount` is decimal — convert to integer minor units
    totalAmount: toMinorUnits(raw.amount),
    lineItems: lines.length ? lines : undefined,
    postedAt: tryParseDate(raw.registerDate),
    metadata: raw as Record<string, unknown>,
  }
}
