import { toCalendarDate } from '../../shared/transform'
import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface HorizonErpBillLineItem {
  id: string
  name: string
  description: string
  qty: number
  rate: number
  amount: number
  tax_amount: number
  hsn_code: string
  account_id: string
  [key: string]: unknown
}

export interface HorizonErpBill {
  id: string
  bill_no: string
  bill_date: string
  due_date: string
  taxable_amount: number
  tax_amount: number
  total_amount: number
  due_amount: number
  status: string
  supplier_id: string
  currency: string
  line_items: HorizonErpBillLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'draft': return 'DRAFT'
    case 'open': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(item: HorizonErpBillLineItem): Lineitem {
  return {
    id: String(item.id),
    itemName: item.name || undefined,
    itemDescription: item.description || undefined,
    unitQuantity: item.qty,
    unitAmount: item.rate,
    totalAmount: item.amount,
    taxAmount: item.tax_amount,
    accountId: item.account_id || undefined,
  }
}

export function transformBill(raw: HorizonErpBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.bill_no || String(raw.id),
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.due_amount,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.bill_date ? new Date(raw.bill_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformBill(bill: Partial<Bill>): Record<string, unknown> {
  return {
    supplier_id: bill.contactId,
    currency: bill.currency,
    bill_date: toCalendarDate(bill.postedAt),
    due_date: toCalendarDate(bill.dueAt),
    bill_no: bill.billNumber,
    line_items: bill.lineItems?.map((li) => ({
      name: li.itemName,
      description: li.itemDescription,
      qty: li.unitQuantity,
      rate: li.unitAmount,
      account_id: li.accountId,
    })),
  }
}
