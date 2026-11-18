import type { InvoiceLineItem } from '../../../schema/invoice'
import { pickCurrency, strMap } from './shared'

export interface RawSquarePaymentRequest {
  uid?: string
  request_type?: string
  request_method?: string
  due_date?: string
  computed_amount_money?: { amount?: number; currency?: string }
  [k: string]: unknown
}

export function transformInvoiceLineItem(
  raw: RawSquarePaymentRequest,
  invoiceId: string,
): InvoiceLineItem {
  const currency = pickCurrency(raw.computed_amount_money?.currency)
  return {
    id: String(raw.uid ?? ''),
    externalId: String(raw.uid ?? ''),
    invoiceId,
    description: raw.request_type ?? raw.request_method,
    amount: raw.computed_amount_money?.amount ?? 0,
    currency,
    periodEnd: raw.due_date,
    metadata: strMap({ request_method: raw.request_method }),
  }
}
