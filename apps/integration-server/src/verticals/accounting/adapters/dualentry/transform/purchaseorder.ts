import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'
import { parseDecimal, toMinorUnits } from '../../shared/transform'

export interface DualentryPurchaseOrderItem {
  id: number
  item_id: number | null
  position: number
  memo: string | null
  quantity: string
  rate: string
  net_amount: string
  tax_amount: string
  gross_amount: string
  amount: string
  [key: string]: unknown
}

export interface DualentryPurchaseOrder {
  id: number
  internal_id: number
  number: number | null
  date: string | null
  company_id: number | null
  vendor_id: number | null
  vendor_name: string | null
  currency_iso_4217_code: string | null
  amount: string
  billed_total: string | null
  due_total: string | null
  memo: string | null
  record_status: 'draft' | 'posted' | 'archived' | string
  billed_status: string | null
  reference_number: string | null
  items: DualentryPurchaseOrderItem[]
  [key: string]: unknown
}

function mapStatus(raw: DualentryPurchaseOrder): PurchaseOrderStatus {
  if (raw.record_status === 'archived') return 'CANCELLED'
  if (raw.billed_status === 'billed') return 'COMPLETED'
  if (raw.record_status === 'posted') return 'ACTIVE'
  return 'DRAFT'
}

function mapLineitem(item: DualentryPurchaseOrderItem): Lineitem {
  return {
    id: String(item.id),
    itemId: item.item_id != null ? String(item.item_id) : undefined,
    itemDescription: item.memo || undefined,
    unitAmount: toMinorUnits(item.rate),
    unitQuantity: parseDecimal(item.quantity) != null ? Math.round(parseDecimal(item.quantity)!) : undefined,
    totalAmount: toMinorUnits(item.gross_amount),
    taxAmount: toMinorUnits(item.tax_amount),
  }
}

export function transformPurchaseOrder(raw: DualentryPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    // contactId uses the compound prefix required by getContact()
    contactId: raw.vendor_id != null ? `vend_${raw.vendor_id}` : undefined,
    currency: raw.currency_iso_4217_code || undefined,
    totalAmount: toMinorUnits(raw.amount),
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
