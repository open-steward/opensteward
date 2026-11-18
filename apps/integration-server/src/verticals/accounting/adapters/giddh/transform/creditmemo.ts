import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'
import type { GiddhVoucher, GiddhVoucherEntry } from './invoice'

function mapStatus(status: string): CreditMemoStatus {
  switch (status?.toLowerCase()) {
    case 'pending':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'draft':
      return 'DRAFT'
    case 'cancel':
      return 'VOIDED'
    case 'partial':
      return 'PARTIALLY_PAID'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(entry: GiddhVoucherEntry): Lineitem {
  const taxAmount = entry.taxes?.reduce((sum, t) => {
    return sum + (entry.taxableAmount * t.percent) / 100
  }, 0)

  return {
    accountId: entry.accountUniqueName || undefined,
    itemDescription: entry.description || undefined,
    unitAmount: entry.rate,
    unitQuantity: entry.quantity,
    totalAmount: entry.amount,
    taxAmount: taxAmount || undefined,
  }
}

export function transformCreditMemo(raw: GiddhVoucher): CreditMemo {
  return {
    id: raw.uniqueName,
    status: mapStatus(raw.status),
    creditmemoNumber: raw.number || undefined,
    contactId: raw.account?.uniqueName || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grandTotal,
    taxAmount: raw.taxesTotal || undefined,
    balanceAmount: raw.balanceDue || undefined,
    lineItems: (raw.entries ?? []).map(mapLineitem),
    postedAt: raw.voucherDate ? new Date(raw.voucherDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
