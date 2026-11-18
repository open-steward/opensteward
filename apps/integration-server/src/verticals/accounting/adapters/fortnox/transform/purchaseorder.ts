import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem, Address } from '../../../schema/shared'
import { toMinorUnits, fromMinorUnits, prefixedId, unprefixedId, toCalendarDate } from '../../shared/transform'

export interface FortnoxPurchaseOrderRow {
  RowId: number
  ArticleNumber: string
  Description: string
  Price: number
  OrderedQuantity: number
  Total: number
  AccountNumber: string
}

export interface FortnoxPurchaseOrder {
  DocumentNumber: string
  SupplierNumber: string
  SupplierName: string
  Currency: string
  TotalWithVAT: number
  OrderDate: string
  Status: string
  DeliveryAddress1: string
  DeliveryAddress2: string
  DeliveryCity: string
  DeliveryZipCode: string
  DeliveryCountryCode: string
  OurReference: string
  YourReference: string
  PurchaseOrderRows: FortnoxPurchaseOrderRow[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  if (status === 'received') return 'COMPLETED'
  if (status === 'cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: FortnoxPurchaseOrderRow): Lineitem {
  return {
    id: String(row.RowId),
    accountId: row.AccountNumber || undefined,
    itemId: row.ArticleNumber || undefined,
    itemDescription: row.Description || undefined,
    unitAmount: toMinorUnits(row.Price),
    unitQuantity: row.OrderedQuantity,
    totalAmount: toMinorUnits(row.Total),
  }
}

function mapShippingAddress(raw: FortnoxPurchaseOrder): Address | undefined {
  if (!raw.DeliveryAddress1 && !raw.DeliveryCity) return undefined
  return {
    address1: raw.DeliveryAddress1 || undefined,
    address2: raw.DeliveryAddress2 || undefined,
    city: raw.DeliveryCity || undefined,
    postalCode: raw.DeliveryZipCode || undefined,
    country: raw.DeliveryCountryCode || undefined,
  }
}

export function transformPurchaseOrder(raw: FortnoxPurchaseOrder): PurchaseOrder {
  return {
    id: raw.DocumentNumber,
    status: mapStatus(raw.Status),
    contactId: prefixedId('supp', raw.SupplierNumber),
    currency: raw.Currency || undefined,
    totalAmount: toMinorUnits(raw.TotalWithVAT),
    lineItems: raw.PurchaseOrderRows ? raw.PurchaseOrderRows.map(mapLineitem) : null,
    shippingAddress: mapShippingAddress(raw),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// Canonical PurchaseOrder → Fortnox body (for create)
export function untransformPurchaseOrder(
  order: Partial<PurchaseOrder>,
): Record<string, unknown> {
  return {
    SupplierNumber: unprefixedId('supp', order.contactId),
    Currency: order.currency,
    OrderDate: toCalendarDate(order.postedAt),
    PurchaseOrderRows: order.lineItems?.map((li) => ({
      ArticleNumber: li.itemId,
      Description: li.itemDescription,
      Price: fromMinorUnits(li.unitAmount),
      OrderedQuantity: li.unitQuantity,
      AccountNumber: li.accountId,
    })),
  }
}
