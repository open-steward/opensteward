import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface EconomicCreditNote {
  bookedInvoiceNumber: number
  draftInvoiceNumber: number
  date: string
  dueDate: string
  currency: string
  grossAmount: number
  vatAmount: number
  remainder: number
  customer: { customerNumber: number; name: string } | null
  [key: string]: unknown
}

function mapStatus(cm: EconomicCreditNote): CreditMemoStatus {
  if (cm.bookedInvoiceNumber && cm.remainder === 0) return 'PAID'
  if (cm.bookedInvoiceNumber && cm.remainder > 0) return 'PARTIALLY_PAID'
  if (cm.bookedInvoiceNumber) return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformCreditMemo(raw: EconomicCreditNote): CreditMemo {
  const number = raw.bookedInvoiceNumber || raw.draftInvoiceNumber
  return {
    id: String(number),
    status: mapStatus(raw),
    creditmemoNumber: number ? String(number) : undefined,
    contactId: raw.customer?.customerNumber ? String(raw.customer.customerNumber) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grossAmount,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.remainder,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
