import type { InvoiceLineItem } from '../../../schema/invoice'
import { pickCurrency, strMap } from './shared'

export interface RawRazorpayLineItem {
  id?: string
  name?: string
  description?: string
  amount?: number
  unit_amount?: number
  quantity?: number
  currency?: string
  [k: string]: unknown
}

export function transformInvoiceLineItem(
  raw: RawRazorpayLineItem,
  invoiceId: string,
): InvoiceLineItem {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    invoiceId,
    description: raw.name ?? raw.description,
    quantity: raw.quantity,
    unitAmount: raw.unit_amount,
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    metadata: strMap({}),
  }
}
