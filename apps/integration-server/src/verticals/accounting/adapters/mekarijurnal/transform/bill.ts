import type { Bill, BillStatus } from '../../../schema/bill'

export interface MekariJurnalBillLine {
  id: number
  product_name: string
  description: string
  quantity: number
  unit_price: number
  amount: number
  tax_amount: number
  [key: string]: unknown
}

export interface MekariJurnalBill {
  id: number
  transaction_no: string
  status: string
  transaction_date: string
  due_date: string
  total: number
  tax_amount: number
  currency_code: string
  person_id: number | string
  lines: MekariJurnalBillLine[]
  [key: string]: unknown
}

function mapBillStatus(status: string): BillStatus {
  switch (status) {
    case 'paid':
      return 'PAID'
    case 'partially_paid':
      return 'PARTIALLY_PAID'
    case 'voided':
      return 'VOIDED'
    case 'open':
      return 'AUTHORIZED'
    default:
      return 'DRAFT'
  }
}

export function transformBill(raw: MekariJurnalBill): Bill {
  return {
    id: String(raw.id),
    status: mapBillStatus(raw.status),
    billNumber: raw.transaction_no || undefined,
    contactId: raw.person_id != null ? String(raw.person_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_amount,
    lineItems: (raw.lines ?? []).map((line) => ({
      id: String(line.id),
      itemDescription: line.product_name || line.description || undefined,
      unitAmount: line.unit_price,
      unitQuantity: line.quantity,
      totalAmount: line.amount,
      taxAmount: line.tax_amount,
    })),
    postedAt: raw.transaction_date ? new Date(raw.transaction_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
