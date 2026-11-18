import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface MisaAmisCreditNoteDetail {
  id: string
  description: string
  unit: string
  quantity: number
  unit_price: number
  amount: number
  vat_rate: number
  vat_amount: number
  account_id: string
  account_code: string
  [key: string]: unknown
}

export interface MisaAmisCreditNote {
  id: string
  credit_note_number: string
  credit_note_date: string
  total_amount: number
  vat_amount: number
  total_payment: number
  remaining_amount: number
  partner_id: string
  partner_name: string
  status: number
  credit_note_details: MisaAmisCreditNoteDetail[]
  [key: string]: unknown
}

function mapStatus(status: number): CreditMemoStatus {
  switch (status) {
    case 0:
      return 'DRAFT'
    case 1:
      return 'AUTHORIZED'
    case 2:
      return 'PAID'
    case 3:
      return 'VOIDED'
    case 4:
      return 'PARTIALLY_PAID'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(row: MisaAmisCreditNoteDetail): Lineitem {
  return {
    id: row.id || undefined,
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
    taxAmount: row.vat_amount || undefined,
  }
}

export function transformCreditMemo(raw: MisaAmisCreditNote): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    creditmemoNumber: raw.credit_note_number || undefined,
    contactId: raw.partner_id || undefined,
    totalAmount: raw.total_payment,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.remaining_amount,
    lineItems: (raw.credit_note_details ?? []).map(mapLineitem),
    postedAt: raw.credit_note_date ? new Date(raw.credit_note_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
