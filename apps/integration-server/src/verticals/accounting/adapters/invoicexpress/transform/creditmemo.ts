import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface InvoiceXpressCreditMemoStatus {
  name: string
  [key: string]: unknown
}

export interface InvoiceXpressCreditMemo {
  id: number
  status: InvoiceXpressCreditMemoStatus
  sequence_number: string
  date: string
  due_date: string
  total: number
  tax_amount: number
  currency: string
  client: { id: number; [key: string]: unknown }
  [key: string]: unknown
}

function mapStatus(statusName: string): CreditMemoStatus {
  switch (statusName) {
    case 'draft': return 'DRAFT'
    case 'sent': return 'AUTHORIZED'
    case 'settled': return 'PAID'
    case 'canceled': return 'VOIDED'
    case 'second_copy': return 'AUTHORIZED'
    default: return 'DRAFT'
  }
}

export function transformCreditMemo(raw: InvoiceXpressCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status?.name ?? ''),
    creditmemoNumber: raw.sequence_number || undefined,
    contactId: raw.client?.id ? String(raw.client.id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_amount || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
