import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem, Address } from '../../../schema/shared'

export interface VismaOrderRow {
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

export interface VismaOrder {
  Id: string
  CustomerId: string
  CustomerNumber: string
  OrderDate: string
  DeliveryDate: string
  Status: number
  CurrencyCode: string
  TotalAmount: number
  TotalVatAmount: number
  YourReference: string
  OurReference: string
  InvoiceAddress1: string
  InvoiceAddress2: string
  InvoiceCity: string
  InvoicePostalCode: string
  InvoiceCountryCode: string
  DeliveryAddress1: string
  DeliveryAddress2: string
  DeliveryCity: string
  DeliveryPostalCode: string
  DeliveryCountryCode: string
  Rows: VismaOrderRow[]
  CreatedUtc: string
  ModifiedUtc: string
  [key: string]: unknown
}

// Visma order Status: 0 = Draft, 1 = Active/Sent, 2 = Completed/Invoiced, 3 = Voided/Cancelled
function mapStatus(status: number): OrderStatus {
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

function mapLineitem(row: VismaOrderRow): Lineitem {
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

function mapBillingAddress(raw: VismaOrder): Address | undefined {
  if (!raw.InvoiceAddress1 && !raw.InvoiceCity) return undefined
  return {
    address1: raw.InvoiceAddress1 || undefined,
    address2: raw.InvoiceAddress2 || undefined,
    city: raw.InvoiceCity || undefined,
    postalCode: raw.InvoicePostalCode || undefined,
    country: raw.InvoiceCountryCode || undefined,
  }
}

function mapShippingAddress(raw: VismaOrder): Address | undefined {
  if (!raw.DeliveryAddress1 && !raw.DeliveryCity) return undefined
  return {
    address1: raw.DeliveryAddress1 || undefined,
    address2: raw.DeliveryAddress2 || undefined,
    city: raw.DeliveryCity || undefined,
    postalCode: raw.DeliveryPostalCode || undefined,
    country: raw.DeliveryCountryCode || undefined,
  }
}

export function transformOrder(raw: VismaOrder): Order {
  return {
    id: raw.Id,
    status: mapStatus(raw.Status),
    type: 'SALES',
    contactId: raw.CustomerId || undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: raw.TotalAmount,
    lineItems: (raw.Rows ?? []).map(mapLineitem),
    billingAddress: mapBillingAddress(raw),
    shippingAddress: mapShippingAddress(raw),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    createdAt: raw.CreatedUtc ? new Date(raw.CreatedUtc) : undefined,
    updatedAt: raw.ModifiedUtc ? new Date(raw.ModifiedUtc) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    CustomerId: order.contactId,
    CurrencyCode: order.currency,
    OrderDate: toCalendarDate(order.postedAt),
    InvoiceAddress1: order.billingAddress?.address1,
    InvoiceCity: order.billingAddress?.city,
    InvoicePostalCode: order.billingAddress?.postalCode,
    InvoiceCountryCode: order.billingAddress?.country,
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
