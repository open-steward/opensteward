import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'
import { toMinorUnits } from '../../shared/transform'

export interface CampfireCreditMemoLine {
  id?: number | null
  description?: string | null
  quantity?: number | null
  rate?: number | null
  amount?: number | null
  tax?: number | null
  product?: number | null
  product_name?: string | null
  currency?: string | null
  [key: string]: unknown
}

// Campfire credit memo response shape (GET /coa/api/v1/credit-memo and /coa/api/v1/credit-memo/{id})
export interface CampfireCreditMemo {
  id: number
  credit_memo_number?: string | null
  credit_memo_date?: string | null
  created_at?: string | null
  last_modified_at?: string | null
  client?: number | null
  client_name?: string | null
  entity?: number | null
  currency?: string | null
  total_amount?: number | null
  amount_used?: number | null
  amount_remaining?: number | null
  status?: string | null
  notes?: string | null
  lines?: CampfireCreditMemoLine[]
  [key: string]: unknown
}

// Campfire credit memo status values: open, partially_used, used, voided
function mapStatus(raw: CampfireCreditMemo): CreditMemoStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'voided') return 'VOIDED'
  if (s === 'used') return 'PAID'
  if (s === 'partially_used') return 'PARTIALLY_PAID'
  if (s === 'open') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(line: CampfireCreditMemoLine): Lineitem {
  return {
    id: line.id != null ? String(line.id) : undefined,
    itemId: line.product != null ? String(line.product) : undefined,
    itemName: line.product_name || undefined,
    itemDescription: line.description || undefined,
    // Campfire amounts are decimal dollars; canonical is integer minor units
    unitAmount: toMinorUnits(line.rate),
    unitQuantity: line.quantity != null ? Math.round(line.quantity) : undefined,
    totalAmount: toMinorUnits(line.amount),
    taxAmount: toMinorUnits(line.tax),
  }
}

export function transformCreditMemo(raw: CampfireCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    creditmemoNumber: raw.credit_memo_number || undefined,
    contactId: raw.client != null ? String(raw.client) : undefined,
    currency: raw.currency || undefined,
    // Campfire amounts are decimal dollars; canonical is integer minor units
    totalAmount: toMinorUnits(raw.total_amount),
    paidAmount: toMinorUnits(raw.amount_used),
    balanceAmount: toMinorUnits(raw.amount_remaining),
    notes: raw.notes || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.credit_memo_date ? new Date(raw.credit_memo_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.last_modified_at ? new Date(raw.last_modified_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
