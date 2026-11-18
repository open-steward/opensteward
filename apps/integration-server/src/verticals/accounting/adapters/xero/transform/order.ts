import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'
import type { XeroLineItem } from './invoice'
import type { XeroPurchaseOrder } from './purchaseorder'
import { mapLineAmountTypes, toUtcDate, toMinorUnits , toCalendarDate} from '../../shared/transform'

/**
 * Xero has no sales-order entity and no order-union endpoint of its own:
 * PurchaseOrders is the only order-like document it exposes. `order` is the
 * canonical union view across a platform's order-like documents, so here it
 * reads the exact same `GET /PurchaseOrders` endpoint `purchaseorder` does —
 * both resources return the same records — tagged `type: 'PURCHASE'` rather
 * than inferred, since Xero has nothing to infer a SALES half from.
 *
 * Quotes (sales quotes, `QuoteStatusCodes` DRAFT/SENT/DECLINED/ACCEPTED/
 * INVOICED/DELETED) are a different lifecycle entirely and are not read here;
 * they have their own canonical resource, `quote` (transform/quote.ts).
 */

function mapStatus(status: XeroPurchaseOrder['Status']): OrderStatus {
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

export function transformOrder(raw: XeroPurchaseOrder): Order {
  return {
    id: raw.PurchaseOrderID,
    status: mapStatus(raw.Status),
    type: 'PURCHASE',
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
