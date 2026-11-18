import type { CreditMemo } from '../../../schema/creditmemo'
import { nonempty, parseDecimal } from '../../shared/transform'

export interface UhasibuCreditNoteLineItem {
  id?: string
  description?: string
  quantity?: number
  unit_price?: number
  amount?: number
  tax_amount?: number
  [key: string]: unknown
}

export interface UhasibuCreditNote {
  id: string
  credit_note_number?: string
  contact_id?: string
  status?: string
  currency?: string
  tax_amount?: number
  total_amount?: number
  remaining_credit?: number
  issue_date?: string
  line_items?: UhasibuCreditNoteLineItem[]
  [key: string]: unknown
}

function mapStatus(raw?: string): CreditMemo['status'] {
  switch (raw?.toLowerCase()) {
    case 'draft': return 'DRAFT'
    case 'submitted':
    case 'authorized':
    case 'authorised': return 'AUTHORIZED'
    case 'paid':
    case 'applied': return 'PAID'
    case 'voided':
    case 'cancelled': return 'VOIDED'
    default: return 'unknown'
  }
}

export function transformCreditMemo(raw: UhasibuCreditNote): CreditMemo {
  return {
    id: String(raw.id),
    creditmemoNumber: raw.credit_note_number || undefined,
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    status: mapStatus(raw.status),
    currency: raw.currency || undefined,
    taxAmount: parseDecimal(raw.tax_amount),
    totalAmount: parseDecimal(raw.total_amount),
    balanceAmount: parseDecimal(raw.remaining_credit),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    lineItems: nonempty(
      (raw.line_items ?? []).map((li) => ({
        id: li.id ? String(li.id) : undefined,
        itemDescription: li.description || undefined,
        unitQuantity: li.quantity,
        unitAmount: parseDecimal(li.unit_price),
        totalAmount: parseDecimal(li.amount),
        taxAmount: parseDecimal(li.tax_amount),
      })),
    ),
    metadata: raw as Record<string, unknown>,
  }
}
