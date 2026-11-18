/**
 * Manager purchase-order-form → canonical PurchaseOrder transform.
 *
 * API endpoints:
 *   GET  /api2/pending-purchase-orders          — list (pending/open only)
 *   GET  /api2/purchase-order-form/{key}        — single record
 *   POST /api2/purchase-order-form              — create
 *   PUT  /api2/purchase-order-form/{key}        — update
 *
 * Docs: https://manager.readme.io/reference/getpendingpurchaseorders.md
 *       https://manager.readme.io/reference/getpurchaseorderform.md
 *
 * Manager amounts are plain floats in the document currency.
 * Canonical Amount is z.number().int() (minor units / cents), so all floats
 * must be multiplied by 100 and rounded before being stored.
 *
 * NOTE: The list endpoint is /pending-purchase-orders — it returns only open
 * (not yet fully received/billed) purchase orders.  Manager does not expose a
 * separate "all purchase orders" list endpoint; pending-purchase-orders is the
 * only general-purpose list.
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

/** Convert a Manager decimal float (e.g. 125.50) to integer minor units (12550). */
function toMinorUnits(value: number | null | undefined): number | undefined {
  if (value == null) return undefined
  return Math.round(value * 100)
}

export interface ManagerPurchaseOrderLine {
  item?: string
  account?: string
  lineDescription?: string
  qty?: number
  unitPrice?: number
  taxCode?: string
  taxAmount?: { value?: number; currency?: string | null }
  amount?: { value?: number; currency?: string | null }
  [key: string]: unknown
}

export interface ManagerPurchaseOrder {
  /** UUID key used as the record id */
  key?: string
  /** ISO date string e.g. "2026-02-01" */
  date?: string
  reference?: string
  supplier?: string
  description?: string
  /** Total order amount as a money object */
  totalAmount?: { value?: number; currency?: string | null }
  /** Status e.g. "Open", "Closed", "Cancelled" */
  status?: string
  lines?: ManagerPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(raw: ManagerPurchaseOrder): PurchaseOrderStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'cancelled' || s === 'voided') return 'CANCELLED'
  if (s === 'closed' || s === 'completed' || s === 'received') return 'COMPLETED'
  if (s === 'open' || s === 'active') return 'ACTIVE'
  return 'DRAFT'
}

function mapLineitem(line: ManagerPurchaseOrderLine): Lineitem {
  return {
    itemId: line.item || undefined,
    accountId: line.account || undefined,
    itemDescription: line.lineDescription || undefined,
    unitAmount: toMinorUnits(line.unitPrice),
    unitQuantity: line.qty != null ? Math.round(line.qty) : undefined,
    taxAmount: toMinorUnits(line.taxAmount?.value),
    totalAmount: toMinorUnits(line.amount?.value),
  }
}

export function transformPurchaseOrder(raw: ManagerPurchaseOrder): PurchaseOrder {
  return {
    id: raw.key,
    status: mapStatus(raw),
    contactId: raw.supplier || undefined,
    currency: (raw.totalAmount?.currency as string) || undefined,
    totalAmount: toMinorUnits(raw.totalAmount?.value),
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
