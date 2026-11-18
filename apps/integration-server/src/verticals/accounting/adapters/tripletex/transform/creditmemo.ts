import type { CreditMemo } from '../../../schema/creditmemo'

export interface TripletexCreditNote {
  id: number
  invoiceNumber: number
  customer?: { id: number; name: string }
  invoiceDate: string
  invoiceDueDate: string
  amountCurrency: number
  currency?: { id: string; code: string }
  isCreditNote: boolean
  [key: string]: unknown
}

export function transformCreditMemo(raw: TripletexCreditNote): CreditMemo {
  return {
    id: String(raw.id),
    status: 'AUTHORIZED',
    creditmemoNumber: raw.invoiceNumber ? String(raw.invoiceNumber) : undefined,
    contactId: raw.customer?.id ? String(raw.customer.id) : undefined,
    currency: raw.currency?.code || undefined,
    totalAmount: raw.amountCurrency,
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.invoiceDueDate ? new Date(raw.invoiceDueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
