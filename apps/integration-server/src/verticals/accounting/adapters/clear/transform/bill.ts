import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface ClearBillLineItem {
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

export interface ClearBill {
  id: string
  bill_number: string
  bill_date: string
  due_date: string
  total_taxable_value: number
  total_tax_amount: number
  grand_total: number
  balance_amount: number
  currency: string
  supplier_id: string
  supplier_name: string
  gstin_supplier: string
  status: string
  line_items: ClearBillLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status.toLowerCase()) {
    case 'draft':
      return 'DRAFT'
    case 'pending':
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

function mapLineitem(item: ClearBillLineItem): Lineitem {
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

export function transformBill(raw: ClearBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    billNumber: raw.bill_number,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grand_total,
    taxAmount: raw.total_tax_amount,
    balanceAmount: raw.balance_amount,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.bill_date ? new Date(raw.bill_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
