import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface BCSalesCreditMemoLine {
  id: string
  description?: string
  quantity: number
  unitPrice: number
  taxAmount: number
  totalAmountIncludingTax: number
  [key: string]: unknown
}

export interface BCSalesCreditMemo {
  id: string
  number: string
  customerId?: string
  customerName?: string
  postingDate?: string
  invoiceDate?: string
  dueDate?: string
  currencyCode?: string
  totalAmountIncludingTax: number
  totalTaxAmount?: number
  remainingAmountIncludingTax?: number
  status: 'Draft' | 'In Review' | 'Open' | 'Paid' | 'Canceled' | 'Corrective'
  salesCreditMemoLines?: BCSalesCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(status: BCSalesCreditMemo['status']): CreditMemoStatus {
  switch (status) {
    case 'Draft':
    case 'In Review':
      return 'DRAFT'
    case 'Open':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Canceled':
    case 'Corrective':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: BCSalesCreditMemoLine): Lineitem {
  return {
    id: line.id,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    taxAmount: line.taxAmount,
    totalAmount: line.totalAmountIncludingTax,
  }
}

export function transformCreditMemo(raw: BCSalesCreditMemo): CreditMemo {
  return {
    id: raw.id,
    creditmemoNumber: raw.number || undefined,
    contactId: raw.customerId || undefined,
    currency: raw.currencyCode || undefined,
    status: mapStatus(raw.status),
    totalAmount: raw.totalAmountIncludingTax,
    taxAmount: raw.totalTaxAmount,
    balanceAmount: raw.remainingAmountIncludingTax,
    lineItems: (raw.salesCreditMemoLines ?? []).map(mapLineitem),
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
