import type { InvoiceLineItem } from '../../../schema/invoice'
import { toIso, strMap } from './shared'

export interface RawStripeInvoiceLineItem {
  id: string
  object: 'line_item'
  description?: string | null
  quantity?: number
  unit_amount?: number | null
  amount: number
  currency: string
  price?: { id?: string; product?: string } | null
  subscription?: string | null
  invoice?: string | null
  period?: { start?: number; end?: number } | null
  proration?: boolean
  metadata?: Record<string, string> | null
  [key: string]: unknown
}

export function transformInvoiceLineItem(
  raw: RawStripeInvoiceLineItem,
  invoiceId?: string,
): InvoiceLineItem {
  return {
    id: raw.id,
    externalId: raw.id,
    invoiceId: invoiceId ?? raw.invoice ?? '',
    description: raw.description ?? undefined,
    quantity: raw.quantity,
    unitAmount: raw.unit_amount ?? undefined,
    amount: raw.amount,
    currency: raw.currency.toUpperCase(),
    priceId: raw.price?.id,
    productId: raw.price?.product,
    subscriptionId: raw.subscription ?? undefined,
    periodStart: toIso(raw.period?.start),
    periodEnd: toIso(raw.period?.end),
    proration: raw.proration,
    metadata: strMap(raw.metadata),
  }
}
