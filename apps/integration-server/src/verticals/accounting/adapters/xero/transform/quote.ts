import type { Quote, QuoteStatus } from '../../../schema/quote'
import type { Lineitem } from '../../../schema/shared'
import type { XeroLineItem } from './invoice'
import { toUtcDate, toMinorUnits, toCalendarDate } from '../../shared/transform'

/**
 * Xero's Quotes endpoint (`GET /Quotes`).
 *
 * This endpoint was already reachable before — the pre-#454 `listOrders` read
 * it and mapped it onto orders, which is why it was repointed to
 * `/PurchaseOrders`. The endpoint itself is known-good; it simply had no
 * canonical resource to land on until now.
 *
 * `DELETED` matters: Xero returns it, and the old orders-mapped `XeroQuote`
 * type omitted the value entirely, so a deleted quote arrived as UNKNOWN.
 */
export interface XeroQuote {
  QuoteID: string
  QuoteNumber?: string
  Reference?: string
  Contact?: { ContactID?: string }
  DateString?: string
  ExpiryDateString?: string
  Status?: 'DRAFT' | 'SENT' | 'DECLINED' | 'ACCEPTED' | 'INVOICED' | 'DELETED'
  CurrencyCode?: string
  SubTotal?: number
  TotalTax?: number
  Total?: number
  TotalDiscount?: number
  Title?: string
  Summary?: string
  Terms?: string
  LineItems?: XeroLineItem[]
  /** Xero's last-modified instant. A real moment, not a calendar date. */
  UpdatedDateUTC?: string
  /** `Inclusive` | `Exclusive` | `NoTax` — whether line amounts include tax. */
  LineAmountTypes?: string
  [key: string]: unknown
}

function mapStatus(raw: XeroQuote): QuoteStatus {
  switch (raw.Status) {
    case 'DRAFT': return 'DRAFT'
    case 'SENT': return 'SENT'
    case 'ACCEPTED': return 'ACCEPTED'
    case 'DECLINED': return 'DECLINED'
    case 'INVOICED': return 'INVOICED'
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

export function transformQuote(raw: XeroQuote): Quote {
  return {
    id: raw.QuoteID,
    status: mapStatus(raw),
    quoteNumber: raw.QuoteNumber || undefined,
    reference: raw.Reference || undefined,
    contactId: raw.Contact?.ContactID || undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: toMinorUnits(raw.Total),
    subtotalAmount: toMinorUnits(raw.SubTotal),
    taxAmount: toMinorUnits(raw.TotalTax),
    discountAmount: toMinorUnits(raw.TotalDiscount),
    title: raw.Title || undefined,
    summary: raw.Summary || undefined,
    terms: raw.Terms || undefined,
    // Xero quotes return `LineAmount` tax-EXCLUSIVE no matter what
    // `LineAmountTypes` says. Verified against all three quotes in the demo
    // org: sum(LineAmount) equals SubTotal on every one, never Total,
    // including the two quotes Xero labels INCLUSIVE. On quotes the label
    // describes how amounts were entered, not what the API returns.
    // Invoices and purchase orders do honour it, so this stays local.
    lineAmountsIncludeTax: false,
    // null when Xero omitted the key, [] only when it returned an empty list —
    // "not reported" and "reported as none" are different answers, and
    // check:collection-null-policy enforces the distinction.
    lineItems: raw.LineItems ? raw.LineItems.map(mapLineItem) : null,
    // Xero names these Date/ExpiryDate — an issue date and the date the offer
    // lapses. Neither is a due date: nothing is owed on a quote.
    issuedAt: toCalendarDate(raw.DateString),
    expiresAt: toCalendarDate(raw.ExpiryDateString),
    updatedAt: toUtcDate(raw.UpdatedDateUTC),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
