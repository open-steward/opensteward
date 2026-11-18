import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface FreeAgentCreditNote {
  url: string
  contact: string
  invoice_number: string
  reference: string
  dated_on: string
  currency: string
  total_value: string
  paid_value: string
  due_value: string
  status: 'Draft' | 'Sent' | 'Paid' | 'Void'
  [key: string]: unknown
}

function extractId(url: string): string {
  return url.split('/').pop() ?? url
}

function mapStatus(raw: FreeAgentCreditNote): CreditMemoStatus {
  switch (raw.status) {
    case 'Draft': return 'DRAFT'
    case 'Sent': return 'AUTHORIZED'
    case 'Paid': return 'PAID'
    case 'Void': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformCreditMemo(raw: FreeAgentCreditNote): CreditMemo {
  return {
    id: extractId(raw.url),
    status: mapStatus(raw),
    creditmemoNumber: raw.invoice_number || undefined,
    contactId: raw.contact ? extractId(raw.contact) : undefined,
    currency: raw.currency || undefined,
    totalAmount: parseFloat(raw.total_value) || undefined,
    balanceAmount: parseFloat(raw.due_value) || undefined,
    paidAmount: isNaN(parseFloat(raw.paid_value)) ? undefined : parseFloat(raw.paid_value),
    postedAt: raw.dated_on ? new Date(raw.dated_on) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
