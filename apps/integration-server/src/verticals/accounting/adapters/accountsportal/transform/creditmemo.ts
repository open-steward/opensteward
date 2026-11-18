import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'
import { toMinorUnits } from '../../shared/transform'

// AccountsPortal credit note wire shape
export interface APCreditNoteLine {
  id: number
  account_id: number
  description: string
  quantity: number
  unit_price: number
  net_amount: number
  tax_rate_id: number | null
  tax_amount: number
  total_amount: number
  [key: string]: unknown
}

export interface APCreditNote {
  id: number
  credit_note_number: string
  contact_id: number
  currency: string
  issue_date: string
  status: string          // 'draft' | 'approved' | 'paid' | 'part_paid' | 'void'
  net_amount: number
  tax_amount: number
  total_amount: number
  remaining_credit: number
  notes: string | null
  credit_note_lines: APCreditNoteLine[]
  created_at: string
  updated_at: string
  [key: string]: unknown
}

function mapStatus(raw: APCreditNote): CreditMemoStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'void' || s === 'voided') return 'VOIDED'
  if (s === 'paid' || raw.remaining_credit === 0) return 'PAID'
  if (s === 'part_paid' || (raw.remaining_credit > 0 && raw.remaining_credit < raw.total_amount)) return 'PARTIALLY_PAID'
  if (s === 'approved' || s === 'authorized') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLine(row: APCreditNoteLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id ? String(row.account_id) : undefined,
    itemDescription: row.description || undefined,
    unitAmount: toMinorUnits(row.unit_price),
    unitQuantity: row.quantity,
    taxAmount: toMinorUnits(row.tax_amount) || undefined,
    taxrateId: row.tax_rate_id ? String(row.tax_rate_id) : undefined,
    totalAmount: toMinorUnits(row.total_amount),
  }
}

export function transformCreditMemo(raw: APCreditNote): CreditMemo {
  // Credit notes are issued to customers; prefix 'c_' mirrors transformContact's id scheme.
  const contactId = raw.contact_id != null ? `c_${raw.contact_id}` : undefined
  const totalMinor = toMinorUnits(raw.total_amount)
  const remainingMinor = toMinorUnits(raw.remaining_credit)
  const appliedMinor =
    totalMinor != null && remainingMinor != null ? totalMinor - remainingMinor : undefined
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    creditmemoNumber: raw.credit_note_number || undefined,
    contactId,
    currency: raw.currency || undefined,
    totalAmount: totalMinor,
    taxAmount: toMinorUnits(raw.tax_amount) || undefined,
    balanceAmount: remainingMinor,
    paidAmount: appliedMinor || undefined,
    notes: raw.notes || undefined,
    lineItems: (raw.credit_note_lines ?? []).map(mapLine),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
