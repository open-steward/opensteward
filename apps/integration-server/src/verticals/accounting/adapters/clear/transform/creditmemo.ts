import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface ClearCreditNoteLineItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  taxable_value: number
  cgst_amount: number
  sgst_amount: number
  igst_amount: number
  cess_amount: number
  total_amount: number
  account_id: string
  [key: string]: unknown
}

export interface ClearCreditNote {
  id: string
  credit_note_number: string
  credit_note_date: string
  total_taxable_value: number
  total_tax_amount: number
  grand_total: number
  balance_amount: number
  customer_id: string
  customer_name: string
  status: string
  line_items: ClearCreditNoteLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status.toLowerCase()) {
    case 'draft':
      return 'DRAFT'
    case 'authorized':
      return 'AUTHORIZED'
    case 'partial':
      return 'PARTIALLY_PAID'
    case 'paid':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: ClearCreditNoteLineItem): Lineitem {
  const taxAmount =
    (item.cgst_amount || 0) +
    (item.sgst_amount || 0) +
    (item.igst_amount || 0) +
    (item.cess_amount || 0)
  return {
    id: item.id,
    accountId: item.account_id || undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.quantity,
    totalAmount: item.total_amount,
    taxAmount: taxAmount || undefined,
  }
}

export function transformCreditMemo(raw: ClearCreditNote): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    creditmemoNumber: raw.credit_note_number,
    contactId: raw.customer_id || undefined,
    totalAmount: raw.grand_total,
    taxAmount: raw.total_tax_amount,
    balanceAmount: raw.balance_amount,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.credit_note_date ? new Date(raw.credit_note_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
