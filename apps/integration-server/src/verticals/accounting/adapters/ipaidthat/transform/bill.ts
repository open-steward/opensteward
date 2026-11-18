import type { Bill, BillStatus } from '../../../schema/bill'

export interface IpaidthatBillItem {
  id: number
  name: string
  unit_price: number
  quantity: number
  tax_percent: number
  [key: string]: unknown
}

// iPaidThat represents purchase invoices as invoices with type='other' or 'invoice'.
// Bills (supplier invoices) are tracked in the same /invoices endpoint.
export interface IpaidthatBill {
  id: string
  number: string
  generated_number: string
  issue_date: string
  due_date: string
  status: string
  type: string
  sender: { id: string } | string
  items: IpaidthatBillItem[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'not paid': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: IpaidthatBill): Bill {
  const supplierId =
    typeof raw.sender === 'object' && raw.sender !== null
      ? String(raw.sender.id)
      : typeof raw.sender === 'string'
        ? raw.sender
        : undefined

  const items = raw.items ?? []
  const totalAmount = items.reduce((s, i) => {
    const lineTotal = (i.unit_price ?? 0) * (i.quantity ?? 1)
    return s + lineTotal * (1 + (i.tax_percent ?? 0) / 100)
  }, 0)
  const taxAmount = items.reduce((s, i) => {
    const lineTotal = (i.unit_price ?? 0) * (i.quantity ?? 1)
    return s + lineTotal * ((i.tax_percent ?? 0) / 100)
  }, 0)

  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.generated_number || raw.number || undefined,
    contactId: supplierId,
    totalAmount,
    taxAmount,
    balanceAmount: undefined,
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
