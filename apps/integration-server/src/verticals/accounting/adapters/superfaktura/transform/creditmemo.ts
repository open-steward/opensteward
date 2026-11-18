import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface SuperfakturaCreditMemoLine {
  id: string | number
  description?: string
  unit_price?: number
  quantity?: number
  total?: number
  tax?: number
  account_id?: string
  [key: string]: unknown
}

export interface SuperfakturaCreditMemo {
  id: string | number
  invoice_no?: string
  created?: string
  due?: string
  total?: number
  tax?: number
  status?: number
  client_id?: string | number
  currency?: string
  invoice_items?: SuperfakturaCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(status?: number): CreditMemoStatus {
  switch (status) {
    case 3: return 'PAID'
    case 2: return 'AUTHORIZED'
    case 4: return 'VOIDED'
    case 1: default: return 'DRAFT'
  }
}

export function transformCreditMemo(raw: SuperfakturaCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.invoice_no || undefined,
    contactId: raw.client_id ? String(raw.client_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax,
    postedAt: raw.created ? new Date(raw.created) : undefined,
    dueAt: raw.due ? new Date(raw.due) : undefined,
    lineItems: (raw.invoice_items ?? []).map(l => ({
      id: String(l.id),
      itemDescription: l.description || undefined,
      unitAmount: l.unit_price,
      unitQuantity: l.quantity,
      totalAmount: l.total,
      taxAmount: l.tax,
      accountId: l.account_id ? String(l.account_id) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
