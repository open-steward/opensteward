import type { Bill, BillStatus } from '../../../schema/bill'

export interface IntacctBill {
  RECORDNO: string
  RECORDID: string
  VENDORID: string
  TOTALENTERED: string
  TOTALPAID: string
  TOTALDUE: string
  CURRENCY: string
  WHENCREATED: string
  WHENDUE: string
  STATE: 'Draft' | 'Posted' | 'Paid' | 'Reversed'
  [key: string]: unknown
}

function mapStatus(raw: IntacctBill): BillStatus {
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

export function transformBill(raw: IntacctBill): Bill {
  return {
    id: raw.RECORDNO,
    status: mapStatus(raw),
    billNumber: raw.RECORDID || undefined,
    contactId: raw.VENDORID || undefined,
    currency: raw.CURRENCY || undefined,
    totalAmount: parseFloat(raw.TOTALENTERED),
    paidAmount: parseFloat(raw.TOTALPAID),
    balanceAmount: parseFloat(raw.TOTALDUE),
    postedAt: raw.WHENCREATED ? new Date(raw.WHENCREATED) : undefined,
    dueAt: raw.WHENDUE ? new Date(raw.WHENDUE) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
