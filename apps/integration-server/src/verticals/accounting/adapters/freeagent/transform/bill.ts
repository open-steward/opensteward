import type { Bill, BillStatus } from '../../../schema/bill'

export interface FreeAgentBill {
  url: string
  contact: string
  reference: string
  dated_on: string
  payment_terms_in_days: number
  currency: string
  net_value: string
  total_value: string
  paid_value: string
  due_value: string
  status: 'Draft' | 'Scheduled' | 'Sent' | 'Email Scheduled' | 'Overdue' | 'Partly Paid' | 'Paid' | 'Void'
  [key: string]: unknown
}

function extractId(url: string): string {
  return url.split('/').pop() ?? url
}

function mapStatus(raw: FreeAgentBill): BillStatus {
  switch (raw.status) {
    case 'Draft':
    case 'Scheduled': return 'DRAFT'
    case 'Sent':
    case 'Email Scheduled': return 'AUTHORIZED'
    case 'Overdue': return 'OVERDUE'
    case 'Partly Paid': return 'PARTIALLY_PAID'
    case 'Paid': return 'PAID'
    case 'Void': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: FreeAgentBill): Bill {
  const paymentTermsDays = raw.payment_terms_in_days ?? 0
  const postedAt = raw.dated_on ? new Date(raw.dated_on) : undefined
  const dueAt = postedAt && paymentTermsDays
    ? new Date(postedAt.getTime() + paymentTermsDays * 86400 * 1000)
    : undefined

  return {
    id: extractId(raw.url),
    status: mapStatus(raw),
    contactId: raw.contact ? extractId(raw.contact) : undefined,
    currency: raw.currency || undefined,
    totalAmount: parseFloat(raw.total_value) || undefined,
    balanceAmount: parseFloat(raw.due_value) || undefined,
    paidAmount: isNaN(parseFloat(raw.paid_value)) ? undefined : parseFloat(raw.paid_value),
    postedAt,
    dueAt,
    metadata: raw as Record<string, unknown>,
  }
}
