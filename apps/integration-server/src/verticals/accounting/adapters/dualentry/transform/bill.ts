import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'
import { parseDecimal, toMinorUnits } from '../../shared/transform'

export interface DualentryBillExpense {
  id: number
  position: number
  account_number: number
  expense_description: string | null
  rate: string
  quantity: string
  net_amount: string
  tax_amount: string
  gross_amount: string
  amount: string
  [key: string]: unknown
}

export interface DualentryBill {
  id: number
  number: number | null
  date: string | null
  transaction_date: string | null
  due_date: string | null
  vendor_id: number | null
  vendor_name: string | null
  currency_iso_4217_code: string | null
  amount: string
  amount_due: string
  paid_total: string
  memo: string | null
  reference_number: string | null
  record_status: 'draft' | 'posted' | 'archived' | string
  expenses: DualentryBillExpense[]
  [key: string]: unknown
}

function mapStatus(raw: DualentryBill): BillStatus {
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

function mapExpenseToLineitem(exp: DualentryBillExpense): Lineitem {
  return {
    id: String(exp.id),
    accountId: exp.account_number != null ? String(exp.account_number) : undefined,
    itemDescription: exp.expense_description || undefined,
    unitAmount: toMinorUnits(exp.rate),
    unitQuantity: parseDecimal(exp.quantity) != null ? Math.round(parseDecimal(exp.quantity)!) : undefined,
    totalAmount: toMinorUnits(exp.gross_amount),
    taxAmount: toMinorUnits(exp.tax_amount),
  }
}

export function transformBill(raw: DualentryBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: raw.number != null ? String(raw.number) : undefined,
    // contactId uses the compound prefix required by getContact()
    contactId: raw.vendor_id != null ? `vend_${raw.vendor_id}` : undefined,
    currency: raw.currency_iso_4217_code || undefined,
    totalAmount: toMinorUnits(raw.amount),
    balanceAmount: toMinorUnits(raw.amount_due),
    paidAmount: toMinorUnits(raw.paid_total) || undefined,
    notes: raw.memo || undefined,
    lineItems: (raw.expenses ?? []).map(mapExpenseToLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
