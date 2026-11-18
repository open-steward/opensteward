import type { InvoiceLineItem } from '../../../schema/invoice'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawPayPalInvoiceItem {
  id?: string
  name?: string
  description?: string
  quantity?: string
  unit_amount?: { value?: string; currency_code?: string }
  amount?: { value?: string; currency_code?: string }
  [k: string]: unknown
}

export function transformInvoiceLineItem(
  raw: RawPayPalInvoiceItem,
  invoiceId: string,
): InvoiceLineItem {
  const currency = pickCurrency(raw.unit_amount?.currency_code ?? raw.amount?.currency_code)
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    invoiceId,
    description: raw.name ?? raw.description,
    quantity: raw.quantity ? Math.round(parseFloat(raw.quantity)) : undefined,
    unitAmount: decimalToMinor(raw.unit_amount?.value),
    amount: decimalToMinor(raw.amount?.value ?? raw.unit_amount?.value),
    currency,
    metadata: strMap({}),
  }
}
