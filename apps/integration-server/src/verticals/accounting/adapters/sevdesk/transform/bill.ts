import type { Bill, BillStatus } from '../../../schema/bill'

export interface SevDeskVoucher {
  id: string
  voucherNumber: string
  supplier: { id: string; objectName: string } | null
  voucherDate: string
  payDate: string | null
  currency: string
  sumNet: string
  sumGross: string
  sumTax: string
  sumDiscounts: string
  status: string
  voucherType: string
  [key: string]: unknown
}

function mapStatus(raw: SevDeskVoucher): BillStatus {
  if (raw.status === '1000') return 'VOIDED'
  if (raw.payDate) return 'PAID'
  if (raw.status === '200') return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformBill(raw: SevDeskVoucher): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.voucherNumber || undefined,
    contactId: raw.supplier?.id || undefined,
    currency: raw.currency || undefined,
    totalAmount: parseFloat(raw.sumGross) || undefined,
    taxAmount: parseFloat(raw.sumTax) || undefined,
    discountAmount: parseFloat(raw.sumDiscounts) || undefined,
    postedAt: raw.voucherDate ? new Date(raw.voucherDate) : undefined,
    paidAt: raw.payDate ? new Date(raw.payDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
