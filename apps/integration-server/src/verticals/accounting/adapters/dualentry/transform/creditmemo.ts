/**
 * DualEntry credit-note → canonical CreditMemo.
 *
 * DualEntry exposes credit notes at GET/POST /public/v2/credit-notes/.
 * A credit note is the mirror of an invoice — it reduces the amount owed
 * by the customer. The response shape mirrors DualentryInvoice closely.
 */
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'
import { parseDecimal, toMinorUnits } from '../../shared/transform'

export interface DualentryCreditNoteItem {
  id: number
  position: number
  item_id: number | null
  memo: string | null
  rate: string
  quantity: string
  net_amount: string
  tax_amount: string
  gross_amount: string
  amount: string
  [key: string]: unknown
}

export interface DualentryCreditNote {
  id: number
  number: number | null
  company_id: number | null
  customer_id: number | null
  customer_name: string | null
  currency_iso_4217_code: string | null
  amount: string
  amount_due: string
  paid_total: string
  date: string | null
  due_date: string | null
  memo: string | null
  reference_number: string | null
  record_status: 'draft' | 'posted' | 'archived' | string
  items?: DualentryCreditNoteItem[]
  [key: string]: unknown
}

function mapStatus(raw: DualentryCreditNote): CreditMemoStatus {
  if (raw.record_status === 'archived') return 'VOIDED'
  const amountDue = parseDecimal(raw.amount_due) ?? 0
  const paidTotal = parseDecimal(raw.paid_total) ?? 0
  if (raw.record_status === 'posted') {
    if (paidTotal > 0 && amountDue === 0) return 'PAID'
    if (paidTotal > 0 && amountDue > 0) return 'PARTIALLY_PAID'
    return 'AUTHORIZED'
  }
  return 'DRAFT'
}

function mapLineitem(item: DualentryCreditNoteItem): Lineitem {
  return {
    id: String(item.id),
    itemId: item.item_id != null ? String(item.item_id) : undefined,
    itemDescription: item.memo || undefined,
    unitAmount: toMinorUnits(item.rate),
    unitQuantity:
      parseDecimal(item.quantity) != null
        ? Math.round(parseDecimal(item.quantity)!)
        : undefined,
    totalAmount: toMinorUnits(item.gross_amount),
    taxAmount: toMinorUnits(item.tax_amount),
  }
}

export function transformCreditMemo(raw: DualentryCreditNote): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    creditmemoNumber: raw.number != null ? String(raw.number) : undefined,
    contactId: raw.customer_id != null ? `cust_${raw.customer_id}` : undefined,
    currency: raw.currency_iso_4217_code || undefined,
    totalAmount: toMinorUnits(raw.amount),
    balanceAmount: toMinorUnits(raw.amount_due),
    paidAmount: toMinorUnits(raw.paid_total) || undefined,
    notes: raw.memo || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
