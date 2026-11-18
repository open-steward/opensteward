import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'
import type { XeroLineItem } from './invoice'
import { mapLineAmountTypes, toUtcDate, toMinorUnits , toCalendarDate} from '../../shared/transform'

export interface XeroCreditNote {
  CreditNoteID: string
  CreditNoteNumber: string
  Contact: { ContactID: string }
  DateString: string
  DueDateString: string
  Total: number
  TotalTax: number
  AppliedAmount: number
  RemainingCredit: number
  CurrencyCode: string
  Status: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'PAID' | 'VOIDED' | 'DELETED'
  Type: 'ACCRECCREDIT' | 'ACCPAYCREDIT'
  LineItems: XeroLineItem[]
  /** Xero's last-modified instant. A real moment, not a calendar date. */
  UpdatedDateUTC?: string
  /** `Inclusive` | `Exclusive` | `NoTax` — whether line amounts include tax. */
  LineAmountTypes?: string
  [key: string]: unknown
}

function mapStatus(raw: XeroCreditNote): CreditMemoStatus {
  switch (raw.Status) {
    case 'DRAFT': return 'DRAFT'
    case 'SUBMITTED': return 'AUTHORIZED'
    case 'AUTHORISED':
      if (raw.AppliedAmount > 0 && raw.RemainingCredit > 0) return 'PARTIALLY_PAID'
      if (raw.RemainingCredit === 0) return 'PAID'
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

export function transformCreditMemo(raw: XeroCreditNote): CreditMemo {
  return {
    id: raw.CreditNoteID,
    status: mapStatus(raw),
    creditmemoNumber: raw.CreditNoteNumber || undefined,
    contactId: raw.Contact?.ContactID || undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: toMinorUnits(raw.Total),
    taxAmount: toMinorUnits(raw.TotalTax),
    paidAmount: toMinorUnits(raw.AppliedAmount || undefined),
    balanceAmount: toMinorUnits(raw.RemainingCredit),
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
