import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface EpsilonNetCreditMemoLine {
  id: string | number
  description: string
  quantity: number
  unitPrice: number
  totalNetValue: number
  vatAmount: number
  accountCode: string
  discount: number
  [key: string]: unknown
}

export interface EpsilonNetCreditMemo {
  id: string | number
  invoiceNumber: string
  status: string
  issueDate: string
  totalNetValue: number
  totalVatAmount: number
  totalGrossValue: number
  currency: string
  counterpart: {
    vatNumber: string
    [key: string]: unknown
  }
  lines: EpsilonNetCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'Submitted':
      return 'AUTHORIZED'
    case 'Cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: EpsilonNetCreditMemoLine): Lineitem {
  return {
    id: String(line.id),
    accountId: line.accountCode || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.totalNetValue,
    taxAmount: line.vatAmount || undefined,
    discountAmount: line.discount || undefined,
  }
}

export function transformCreditMemo(raw: EpsilonNetCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.invoiceNumber || undefined,
    contactId: raw.counterpart?.vatNumber || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalGrossValue,
    taxAmount: raw.totalVatAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
