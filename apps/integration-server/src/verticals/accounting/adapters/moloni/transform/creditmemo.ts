import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface MoloniCreditMemo {
  document_id: number
  date: string
  net_value: number
  client_id: number
  status: number
  taxes: Array<{ value: number; [key: string]: unknown }>
  currency_code: string
  [key: string]: unknown
}

function mapStatus(status: number): CreditMemoStatus {
  if (status === 2) return 'VOIDED'
  if (status === 1) return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformCreditMemo(raw: MoloniCreditMemo): CreditMemo {
  const taxAmount = (raw.taxes ?? []).reduce((sum, t) => sum + (t.value ?? 0), 0)

  return {
    id: String(raw.document_id),
    status: mapStatus(raw.status),
    contactId: raw.client_id ? String(raw.client_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.net_value,
    taxAmount: taxAmount || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
