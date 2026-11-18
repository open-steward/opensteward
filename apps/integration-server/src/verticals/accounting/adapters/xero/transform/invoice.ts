import type { Invoice, InvoiceStatus, InvoiceType } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'
import { mapLineAmountTypes, toUtcDate, toMinorUnits, fromMinorUnits, toCalendarDate } from '../../shared/transform'

export interface XeroLineItem {
  LineItemID: string
  Description: string
  UnitAmount: number
  Quantity: number
  TaxAmount: number
  LineAmount: number
  AccountCode: string
  AccountID: string
  ItemCode: string
  /** `Inclusive` | `Exclusive` | `NoTax` — whether line amounts include tax. */
  LineAmountTypes?: string
  [key: string]: unknown
}

export interface XeroInvoice {
  InvoiceID: string
  Type: 'ACCREC' | 'ACCPAY'
  Status: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'PAID' | 'VOIDED' | 'DELETED'
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
  LineItems: XeroLineItem[]
  Url: string
  /** Xero's last-modified instant. A real moment, not a calendar date. */
  UpdatedDateUTC?: string
  [key: string]: unknown
}

function mapStatus(inv: XeroInvoice): InvoiceStatus {
  switch (inv.Status) {
    case 'DRAFT': return 'DRAFT'
    case 'SUBMITTED': return 'SUBMITTED'
    case 'AUTHORISED': return inv.AmountPaid > 0 && inv.AmountDue > 0 ? 'PARTIALLY_PAID' : inv.AmountDue === 0 ? 'PAID' : 'AUTHORIZED'
    case 'PAID': return 'PAID'
    case 'VOIDED': return 'VOIDED'
    case 'DELETED': return 'DELETED'
    default: return 'DRAFT'
  }
}

function mapType(xeroType: 'ACCREC' | 'ACCPAY'): InvoiceType {
  return xeroType === 'ACCPAY' ? 'BILL' : 'INVOICE'
}

/**
 * Xero ships two identifiers per line: `AccountID` (the GUID `transformAccount`
 * emits as `Account.id`) and `AccountCode` (the chart-of-accounts code it emits
 * as `customerDefinedCode`). `accountId` must be the former or the reference
 * does not resolve — `get_accounts(id=lineItem.accountId)` 404s on the code.
 * The code is kept as `accountCode` because it is what a human recognises, but
 * it is not a join key: Xero guarantees it neither unique nor stable.
 *
 * No fallback from one to the other. A payload with no `AccountID` yields no
 * `accountId`, because an unresolvable reference is worse than an absent one.
 */
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

export function transformInvoice(raw: XeroInvoice): Invoice {
  return {
    id: raw.InvoiceID,
    type: mapType(raw.Type),
    status: mapStatus(raw),
    invoiceNumber: raw.InvoiceNumber || undefined,
    contactId: raw.Contact?.ContactID || undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: toMinorUnits(raw.Total),
    taxAmount: toMinorUnits(raw.TotalTax),
    balanceAmount: toMinorUnits(raw.AmountDue),
    paidAmount: toMinorUnits(raw.AmountPaid || undefined),
    reference: raw.Reference || undefined,
    url: raw.Url || undefined,
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

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    Type: invoice.type === 'BILL' ? 'ACCPAY' : 'ACCREC',
    Contact: invoice.contactId ? { ContactID: invoice.contactId } : undefined,
    InvoiceNumber: invoice.invoiceNumber,
    Reference: invoice.reference,
    CurrencyCode: invoice.currency,
    Date: toCalendarDate(invoice.postedAt),
    DueDate: toCalendarDate(invoice.dueAt),
    // `AccountID` and `AccountCode` are separate documented LineItem fields
    // and separate identifier spaces. This used to post `AccountCode:
    // li.accountId`, which was coherent only while `accountId` wrongly held
    // the code — fixing the read side without this would start posting GUIDs
    // into a chart-of-accounts code field. Each canonical field now goes back
    // to the Xero field it came from.
    LineItems: invoice.lineItems?.map((li) => ({
      Description: li.itemDescription,
      UnitAmount: fromMinorUnits(li.unitAmount),
      Quantity: li.unitQuantity,
      AccountID: li.accountId ?? undefined,
      AccountCode: li.accountCode ?? undefined,
      ItemCode: li.itemId,
    })),
  }
}
