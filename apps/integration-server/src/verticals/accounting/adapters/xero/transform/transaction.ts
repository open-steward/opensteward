import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'
import { mapLineAmountTypes, toCalendarDate, toMinorUnits, toUtcDate } from '../../shared/transform'

export interface XeroBankTransactionLineItem {
  /** Xero supplies one; it simply was never mapped, so transaction lines
   *  were the only ones in the vertical with no id to reference. */
  LineItemID?: string
  Description: string
  UnitAmount: number
  Quantity: number
  LineAmount: number
  AccountCode: string
  AccountID: string
}

export interface XeroBankTransaction {
  BankTransactionID: string
  Type: string
  Contact: { ContactID: string; Name: string }
  BankAccount: { AccountID: string; Code: string }
  DateString: string
  Total: number
  TotalTax: number
  CurrencyCode: string
  Reference: string
  IsReconciled: boolean
  Status: 'AUTHORISED' | 'DELETED'
  LineItems: XeroBankTransactionLineItem[]
  /** Xero's last-modified instant. A real moment, not a calendar date. */
  UpdatedDateUTC?: string
  /** `Inclusive` | `Exclusive` | `NoTax` — whether line amounts include tax. */
  LineAmountTypes?: string
  [key: string]: unknown
}

function mapLineItems(raw: XeroBankTransaction): TransactionLineitem[] {
  return (raw.LineItems ?? []).map((li) => ({
    // Xero supplies a LineItemID here; it simply was never mapped, which left
    // transaction lines the only ones in the vertical with no id to reference.
    id: li.LineItemID || undefined,
    accountId: li.AccountID || undefined,
    accountCode: li.AccountCode || undefined,
    description: li.Description || undefined,
    unitAmount: toMinorUnits(li.UnitAmount),
    unitQuantity: li.Quantity,
    totalAmount: toMinorUnits(li.LineAmount),
  }))
}

export function transformTransaction(raw: XeroBankTransaction): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.Contact?.ContactID) {
    contacts.push({ id: raw.Contact.ContactID, name: raw.Contact.Name || undefined })
  }

  return {
    id: raw.BankTransactionID,
    accountId: raw.BankAccount?.AccountID || undefined,
    type: raw.Type || undefined,
    reference: raw.Reference || undefined,
    currency: raw.CurrencyCode || undefined,
    taxAmount: toMinorUnits(raw.TotalTax || undefined),
    totalAmount: toMinorUnits(raw.Total),
    contacts: contacts.length > 0 ? contacts : undefined,
    lineAmountsIncludeTax: mapLineAmountTypes(raw.LineAmountTypes),
    lineItems: mapLineItems(raw),
    // `DateString` is a calendar DATE, and it belongs on `postedAt`, not on
    // `createdAt`. Two bugs in one line: it invented a midnight UTC instant
    // (so the same source date rendered `2026-06-22` via list_expenses and
    // `2026-06-22T00:00:00.000Z` here, for the same underlying record), and it
    // filled a field meaning "when the record was created" with the date the
    // transaction was posted. Xero reports no creation timestamp for bank
    // transactions, so `createdAt` is now honestly absent.
    postedAt: toCalendarDate(raw.DateString),
    // A genuine instant, so NOT routed through toCalendarDate. This is the
    // value `updated_after` filters on, and truncating it to a date would
    // reopen the incremental-sync gap it exists to close.
    updatedAt: toUtcDate(raw.UpdatedDateUTC),
    metadata: raw as Record<string, unknown>,
  }
}
