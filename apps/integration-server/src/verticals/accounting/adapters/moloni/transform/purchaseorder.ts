import type { PurchaseOrder } from '../../../schema/purchaseorder'

export interface MoloniPurchaseOrder {
  document_id: number
  date: string
  supplier_id: number
  net_value: number
  currency_code: string
  status: number
  [key: string]: unknown
}

export function transformPurchaseOrder(raw: MoloniPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.document_id),
    contactId: raw.supplier_id ? String(raw.supplier_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.net_value,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
