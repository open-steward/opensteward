import type { Bill, BillStatus } from '../../../schema/bill'

// FastBill calls bills/incoming invoices "expenses" in its API.
export interface FastbillBill {
  EXPENSE_ID: string
  EXPENSE_NUMBER: string
  EXPENSE_DATE: string
  DUE_DATE: string
  TOTAL: number
  VAT_AMOUNT: number
  SUB_TOTAL: number
  OPEN_AMOUNT: number
  IS_PAID: boolean
  CURRENCY_CODE: string
  SUPPLIER_ID: string
  [key: string]: unknown
}

function mapStatus(raw: FastbillBill): BillStatus {
  if (raw.IS_PAID) return 'PAID'
  return 'AUTHORIZED'
}

export function transformBill(raw: FastbillBill): Bill {
  return {
    id: String(raw.EXPENSE_ID),
    status: mapStatus(raw),
    billNumber: raw.EXPENSE_NUMBER || undefined,
    contactId: raw.SUPPLIER_ID ? String(raw.SUPPLIER_ID) : undefined,
    currency: raw.CURRENCY_CODE || undefined,
    totalAmount: raw.TOTAL,
    taxAmount: raw.VAT_AMOUNT,
    balanceAmount: raw.OPEN_AMOUNT,
    postedAt: raw.EXPENSE_DATE ? new Date(raw.EXPENSE_DATE) : undefined,
    dueAt: raw.DUE_DATE ? new Date(raw.DUE_DATE) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export type FastBillBill = FastbillBill
