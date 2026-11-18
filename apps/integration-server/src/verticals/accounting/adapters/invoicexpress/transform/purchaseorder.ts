import type { PurchaseOrder } from '../../../schema/purchaseorder'

export interface InvoiceXpressPurchaseOrder {
  id: number
  date: string
  supplier: { id: number; [key: string]: unknown }
  total: number
  currency: string
  [key: string]: unknown
}

export function transformPurchaseOrder(raw: InvoiceXpressPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    contactId: raw.supplier?.id ? String(raw.supplier.id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
