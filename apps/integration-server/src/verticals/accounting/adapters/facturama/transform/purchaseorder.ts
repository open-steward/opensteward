import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem, Address } from '../../../schema/shared'

export interface FacturamaPurchaseOrderItem {
  Id: string
  ProductCode: string
  Description: string
  UnitPrice: number
  Quantity: number
  Total: number
  AccountCode: string
  [key: string]: unknown
}

export interface FacturamaPurchaseOrder {
  Id: string
  SupplierId: string
  SupplierName: string
  Currency: string
  Total: number
  OrderDate: string
  Status: string
  ShippingStreet: string
  ShippingCity: string
  ShippingState: string
  ShippingZipCode: string
  ShippingCountry: string
  Reference: string
  Items: FacturamaPurchaseOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  if (status === 'received' || status === 'completed') return 'COMPLETED'
  if (status === 'cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: FacturamaPurchaseOrderItem): Lineitem {
  return {
    id: String(row.Id),
    accountId: row.AccountCode || undefined,
    itemId: row.ProductCode || undefined,
    itemDescription: row.Description || undefined,
    unitAmount: row.UnitPrice,
    unitQuantity: row.Quantity,
    totalAmount: row.Total,
  }
}

function mapShippingAddress(raw: FacturamaPurchaseOrder): Address | undefined {
  if (!raw.ShippingStreet && !raw.ShippingCity) return undefined
  return {
    address1: raw.ShippingStreet || undefined,
    city: raw.ShippingCity || undefined,
    region: raw.ShippingState || undefined,
    postalCode: raw.ShippingZipCode || undefined,
    country: raw.ShippingCountry || undefined,
  }
}

export function transformPurchaseOrder(raw: FacturamaPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.Id),
    status: mapStatus(raw.Status),
    contactId: raw.SupplierId || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Total,
    lineItems: (raw.Items ?? []).map(mapLineitem),
    shippingAddress: mapShippingAddress(raw),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(
  order: Partial<PurchaseOrder>,
): Record<string, unknown> {
  return {
    SupplierId: order.contactId,
    Currency: order.currency,
    OrderDate: toCalendarDate(order.postedAt),
    Items: order.lineItems?.map((li) => ({
      ProductCode: li.itemId,
      Description: li.itemDescription,
      UnitPrice: li.unitAmount,
      Quantity: li.unitQuantity,
      AccountCode: li.accountId,
    })),
  }
}
