import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem, Address } from '../../../schema/shared'

export interface VismaPurchaseOrderRow {
  LineNumber: number
  ArticleId: string
  ArticleNumber: string
  Text: string
  UnitPrice: number
  Quantity: number
  DiscountPercentage: number
  TotalAmount: number
  TotalVatAmount: number
  CostCenterItemId1: string
  ProjectId: string
  [key: string]: unknown
}

export interface VismaPurchaseOrder {
  Id: string
  SupplierId: string
  SupplierNumber: string
  OrderDate: string
  DeliveryDate: string
  Status: number
  CurrencyCode: string
  TotalAmount: number
  TotalVatAmount: number
  YourReference: string
  OurReference: string
  DeliveryAddress1: string
  DeliveryAddress2: string
  DeliveryCity: string
  DeliveryPostalCode: string
  DeliveryCountryCode: string
  Rows: VismaPurchaseOrderRow[]
  CreatedUtc: string
  ModifiedUtc: string
  [key: string]: unknown
}

// Visma order Status: 0 = Draft, 1 = Active/Sent, 2 = Completed/Received, 3 = Voided/Cancelled
function mapStatus(status: number): PurchaseOrderStatus {
  switch (status) {
    case 0:
      return 'DRAFT'
    case 2:
      return 'COMPLETED'
    case 3:
      return 'CANCELLED'
    default:
      return 'ACTIVE'
  }
}

function mapLineitem(row: VismaPurchaseOrderRow): Lineitem {
  return {
    id: String(row.LineNumber),
    itemId: row.ArticleId || row.ArticleNumber || undefined,
    itemDescription: row.Text || undefined,
    unitAmount: row.UnitPrice,
    unitQuantity: row.Quantity,
    totalAmount: row.TotalAmount,
    taxAmount: row.TotalVatAmount,
    discountAmount:
      row.DiscountPercentage
        ? row.UnitPrice * row.Quantity * row.DiscountPercentage
        : undefined,
  }
}

function mapShippingAddress(raw: VismaPurchaseOrder): Address | undefined {
  if (!raw.DeliveryAddress1 && !raw.DeliveryCity) return undefined
  return {
    address1: raw.DeliveryAddress1 || undefined,
    address2: raw.DeliveryAddress2 || undefined,
    city: raw.DeliveryCity || undefined,
    postalCode: raw.DeliveryPostalCode || undefined,
    country: raw.DeliveryCountryCode || undefined,
  }
}

export function transformPurchaseOrder(raw: VismaPurchaseOrder): PurchaseOrder {
  return {
    id: raw.Id,
    status: mapStatus(raw.Status),
    contactId: raw.SupplierId || undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: raw.TotalAmount,
    lineItems: (raw.Rows ?? []).map(mapLineitem),
    shippingAddress: mapShippingAddress(raw),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    createdAt: raw.CreatedUtc ? new Date(raw.CreatedUtc) : undefined,
    updatedAt: raw.ModifiedUtc ? new Date(raw.ModifiedUtc) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(order: Partial<PurchaseOrder>): Record<string, unknown> {
  return {
    SupplierId: order.contactId,
    CurrencyCode: order.currency,
    OrderDate: toCalendarDate(order.postedAt),
    DeliveryAddress1: order.shippingAddress?.address1,
    DeliveryCity: order.shippingAddress?.city,
    DeliveryPostalCode: order.shippingAddress?.postalCode,
    DeliveryCountryCode: order.shippingAddress?.country,
    Rows: order.lineItems?.map((li, i) => ({
      LineNumber: i + 1,
      ArticleId: li.itemId,
      Text: li.itemDescription,
      UnitPrice: li.unitAmount,
      Quantity: li.unitQuantity,
    })),
  }
}
