import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'
import type { XeroLineItem } from './invoice'
import { mapLineAmountTypes, toUtcDate, toMinorUnits , toCalendarDate} from '../../shared/transform'

export interface XeroPurchaseOrder {
  PurchaseOrderID: string
  PurchaseOrderNumber: string
  Contact: { ContactID: string }
  DateString: string
  DeliveryDateString: string
  CurrencyCode: string
  Total: number
  TotalTax: number
  Status: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'BILLED' | 'DELETED'
  LineItems: XeroLineItem[]
  DeliveryAddress: string
  AttentionTo: string
  /** Xero's last-modified instant. A real moment, not a calendar date. */
  UpdatedDateUTC?: string
  /** `Inclusive` | `Exclusive` | `NoTax` — whether line amounts include tax. */
  LineAmountTypes?: string
  [key: string]: unknown
}

function mapStatus(status: XeroPurchaseOrder['Status']): PurchaseOrderStatus {
  switch (status) {
    case 'BILLED': return 'COMPLETED'
    case 'DELETED': return 'CANCELLED'
    default: return 'ACTIVE'
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

export function transformPurchaseOrder(raw: XeroPurchaseOrder): PurchaseOrder {
  return {
    id: raw.PurchaseOrderID,
    status: mapStatus(raw.Status),
    contactId: raw.Contact?.ContactID || undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: toMinorUnits(raw.Total),
    lineAmountsIncludeTax: mapLineAmountTypes(raw.LineAmountTypes),
    lineItems: (raw.LineItems ?? []).map(mapLineItem),
    postedAt: toCalendarDate(raw.DateString),
    // A genuine instant, so NOT routed through toCalendarDate. This is the
    // value `updated_after` filters on, and truncating it to a date would
    // reopen the incremental-sync gap it exists to close.
    updatedAt: toUtcDate(raw.UpdatedDateUTC),
    metadata: raw as Record<string, unknown>,
  }
}
