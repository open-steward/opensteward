/**
 * Manager credit-notes → canonical CreditMemo transform.
 *
 * API endpoint: GET /api2/credit-notes
 *               GET /api2/credit-notes/{key}
 *
 * Manager amounts are plain floats in the document currency.
 * Canonical Amount is z.number().int() (minor units / cents), so all floats
 * must be multiplied by 100 and rounded before being stored.
 */
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

/** Convert a Manager decimal float (e.g. 125.50) to integer minor units (12550). */
function toMinorUnits(value: number | null | undefined): number | undefined {
  if (value == null) return undefined
  return Math.round(value * 100)
}

export interface ManagerCreditNoteLine {
  item?: string
  account?: string
  lineDescription?: string
  qty?: number
  salesUnitPrice?: number
  taxCode?: string
  discount?: number
  taxAmount?: { value?: number; currency?: string | null }
  amount?: { value?: number; currency?: string | null }
  [key: string]: unknown
}

export interface ManagerCreditNote {
  key?: string
  issueDate?: string
  dueDate?: string
  reference?: string
  customer?: string
  description?: string
  creditNoteAmount?: { value?: number; currency?: string | null }
  balanceDue?: { value?: number; currency?: string | null }
  status?: string
  lines?: ManagerCreditNoteLine[]
  [key: string]: unknown
}

function mapStatus(raw: ManagerCreditNote): CreditMemoStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'void' || s === 'voided') return 'VOIDED'
  if (s === 'paidinfull' || s === 'paid') return 'PAID'
  if (s === 'partiallypaid' || s === 'partial') return 'PARTIALLY_PAID'
  if (s === 'authorized' || s === 'unpaid') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(line: ManagerCreditNoteLine): Lineitem {
  return {
    itemId: line.item || undefined,
    accountId: line.account || undefined,
    itemDescription: line.lineDescription || undefined,
    unitAmount: toMinorUnits(line.salesUnitPrice),
    unitQuantity: line.qty != null ? Math.round(line.qty) : undefined,
    taxAmount: toMinorUnits(line.taxAmount?.value),
    discountAmount: toMinorUnits(line.discount),
    totalAmount: toMinorUnits(line.amount?.value),
  }
}

export function transformCreditMemo(raw: ManagerCreditNote): CreditMemo {
  const totalAmount = toMinorUnits(raw.creditNoteAmount?.value)
  const balanceAmount = toMinorUnits(raw.balanceDue?.value)

  return {
    id: raw.key,
    status: mapStatus(raw),
    creditmemoNumber: raw.reference || raw.key,
    contactId: raw.customer || undefined,
    totalAmount,
    balanceAmount,
    paidAmount:
      totalAmount != null && balanceAmount != null ? totalAmount - balanceAmount : undefined,
    notes: raw.description || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
