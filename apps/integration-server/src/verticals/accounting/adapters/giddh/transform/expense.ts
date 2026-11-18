import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'
import type { GiddhVoucher, GiddhVoucherEntry } from './invoice'

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

export function transformExpense(raw: GiddhVoucher): Expense {
  return {
    id: raw.uniqueName,
    name: raw.number || undefined,
    contactId: raw.account?.uniqueName || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.taxesTotal || undefined,
    totalAmount: raw.grandTotal,
    lineItems: (raw.entries ?? []).map(mapLineitem),
    postedAt: raw.voucherDate ? new Date(raw.voucherDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
