import type { CreditMemo } from '../../../schema/creditmemo'
import { nonempty, parseDecimal } from '../../shared/transform'

export interface AccounteerCreditMemoLineItem {
  id?: string
  description?: string
  quantity?: number
  unit_price?: number
  amount?: number
  [key: string]: unknown
}

export interface AccounteerCreditMemo {
  id: string
  credit_note_number?: string
  contact_id?: string
  status?: string
  currency?: string
  total_amount?: number
  remaining_credit?: number
  date?: string
  line_items?: AccounteerCreditMemoLineItem[]
  [key: string]: unknown
}

function mapStatus(raw?: string): CreditMemo['status'] {
  switch (raw?.toLowerCase()) {
    case 'draft': return 'DRAFT'
    case 'authorised':
    case 'authorized':
    case 'open': return 'AUTHORIZED'
    case 'paid':
    case 'fully_used': return 'PAID'
    case 'voided': return 'VOIDED'
    default: return 'unknown'
  }
}

export function transformCreditMemo(raw: AccounteerCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    creditmemoNumber: raw.credit_note_number || undefined,
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    status: mapStatus(raw.status),
    currency: raw.currency || undefined,
    totalAmount: parseDecimal(raw.total_amount),
    balanceAmount: parseDecimal(raw.remaining_credit),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    lineItems: nonempty(
      (raw.line_items ?? []).map((li) => ({
        id: li.id ? String(li.id) : undefined,
        itemDescription: li.description || undefined,
        unitQuantity: li.quantity,
        unitAmount: parseDecimal(li.unit_price),
        totalAmount: parseDecimal(li.amount),
      })),
    ),
    metadata: raw as Record<string, unknown>,
  }
}
