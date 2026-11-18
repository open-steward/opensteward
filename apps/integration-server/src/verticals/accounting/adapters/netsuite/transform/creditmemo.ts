import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface NetSuiteCreditMemo {
  id?: string | number
  tranId?: string
  entity?: string | number
  total?: number
  amountRemaining?: number
  currency?: string
  tranDate?: string
  status?: string
  [key: string]: unknown
}

function mapStatus(status: string | undefined): CreditMemoStatus {
  const s = (status ?? '').toLowerCase()
  if (s.includes('applied') || s.includes('closed')) return 'PAID'
  if (s.includes('void') || s.includes('cancel')) return 'VOIDED'
  if (s.includes('open')) return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformCreditMemo(raw: NetSuiteCreditMemo): CreditMemo {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    creditmemoNumber: raw.tranId || undefined,
    contactId: raw.entity !== undefined ? String(raw.entity) : undefined,
    status: mapStatus(raw.status),
    totalAmount: raw.total,
    balanceAmount: raw.amountRemaining,
    currency: raw.currency || undefined,
    postedAt: raw.tranDate ? new Date(raw.tranDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
