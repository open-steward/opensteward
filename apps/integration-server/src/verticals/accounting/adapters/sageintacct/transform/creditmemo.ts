import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface IntacctCreditMemo {
  RECORDNO: string
  RECORDID: string
  CUSTOMERID: string
  TOTALENTERED: string
  TOTALPAID: string
  TOTALDUE: string
  CURRENCY: string
  WHENCREATED: string
  WHENDUE: string
  STATE: 'Draft' | 'Posted' | 'Paid' | 'Reversed'
  [key: string]: unknown
}

function mapStatus(raw: IntacctCreditMemo): CreditMemoStatus {
  const totalDue = parseFloat(raw.TOTALDUE)
  const totalPaid = parseFloat(raw.TOTALPAID)
  switch (raw.STATE) {
    case 'Draft':
      return 'DRAFT'
    case 'Posted':
      if (totalDue === 0) return 'PAID'
      if (totalPaid > 0 && totalDue > 0) return 'PARTIALLY_PAID'
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Reversed':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformCreditMemo(raw: IntacctCreditMemo): CreditMemo {
  return {
    id: raw.RECORDNO,
    status: mapStatus(raw),
    creditmemoNumber: raw.RECORDID || undefined,
    contactId: raw.CUSTOMERID || undefined,
    currency: raw.CURRENCY || undefined,
    totalAmount: parseFloat(raw.TOTALENTERED),
    paidAmount: parseFloat(raw.TOTALPAID),
    balanceAmount: parseFloat(raw.TOTALDUE),
    postedAt: raw.WHENCREATED ? new Date(raw.WHENCREATED) : undefined,
    dueAt: raw.WHENDUE ? new Date(raw.WHENDUE) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
