import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'
import type { XeroLineItem } from './invoice'
import { mapLineAmountTypes, toUtcDate, toMinorUnits , toCalendarDate} from '../../shared/transform'

export interface XeroBill {
  InvoiceID: string
  InvoiceNumber: string
  Reference: string
  Contact: { ContactID: string; Name: string }
  DateString: string
  DueDateString: string
  Total: number
  TotalTax: number
  AmountDue: number
  AmountPaid: number
  CurrencyCode: string
  Status: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'PAID' | 'VOIDED' | 'DELETED'
  LineItems: XeroLineItem[]
  /** Xero's last-modified instant. A real moment, not a calendar date. */
  UpdatedDateUTC?: string
  /** `Inclusive` | `Exclusive` | `NoTax` — whether line amounts include tax. */
  LineAmountTypes?: string
  [key: string]: unknown
}

function mapStatus(raw: XeroBill): BillStatus {
  switch (raw.Status) {
    case 'DRAFT': return 'DRAFT'
    case 'SUBMITTED': return 'SUBMITTED'
    case 'AUTHORISED':
      if (raw.AmountPaid > 0 && raw.AmountDue > 0) return 'PARTIALLY_PAID'
      if (raw.AmountDue === 0) return 'PAID'
      return 'AUTHORIZED'
    case 'PAID': return 'PAID'
    case 'VOIDED': return 'VOIDED'
    case 'DELETED': return 'DELETED'
    default: return 'DRAFT'
  }
}

function mapLineItem(li: XeroLineItem): Lineitem {
  return {
    id: li.LineItemID || undefined,
    itemId: li.ItemCode || undefined,
    itemDescription: li.Description || undefined,
    unitAmount: toMinorUnits(li.UnitAmount),
    unitQuantity: li.Quantity,
    totalAmount: toMinorUnits(li.LineAmount),
    taxAmount: toMinorUnits(li.TaxAmount || undefined),
    accountId: li.AccountID || undefined,
    accountCode: li.AccountCode || undefined,
  }
}

export function transformBill(raw: XeroBill): Bill {
  return {
    id: raw.InvoiceID,
    status: mapStatus(raw),
    billNumber: raw.InvoiceNumber || undefined,
    contactId: raw.Contact?.ContactID || undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: toMinorUnits(raw.Total),
    taxAmount: toMinorUnits(raw.TotalTax),
    balanceAmount: toMinorUnits(raw.AmountDue),
    paidAmount: toMinorUnits(raw.AmountPaid || undefined),
    lineAmountsIncludeTax: mapLineAmountTypes(raw.LineAmountTypes),
    lineItems: (raw.LineItems ?? []).map(mapLineItem),
    postedAt: toCalendarDate(raw.DateString),
    dueAt: toCalendarDate(raw.DueDateString),
    // A genuine instant, so NOT routed through toCalendarDate. This is the
    // value `updated_after` filters on, and truncating it to a date would
    // reopen the incremental-sync gap it exists to close.
    updatedAt: toUtcDate(raw.UpdatedDateUTC),
    metadata: raw as Record<string, unknown>,
  }
}
