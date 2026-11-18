import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem, Address } from '../../../schema/shared'

export interface FacturamaSalesOrderItem {
  Id: string
  ProductCode: string
  Description: string
  UnitPrice: number
  Quantity: number
  Total: number
  TaxAmount: number
  AccountCode: string
  Discount: number
  [key: string]: unknown
}

export interface FacturamaSalesOrder {
  Id: string
  ClientId: string
  ClientName: string
  Currency: string
  Total: number
  OrderDate: string
  Status: string
  ShippingStreet: string
  ShippingCity: string
  ShippingState: string
  ShippingZipCode: string
  ShippingCountry: string
  BillingStreet: string
  BillingCity: string
  BillingState: string
  BillingZipCode: string
  BillingCountry: string
  Items: FacturamaSalesOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  if (status === 'invoiced' || status === 'completed') return 'COMPLETED'
  if (status === 'cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: FacturamaSalesOrderItem): Lineitem {
  return {
    id: String(row.Id),
    accountId: row.AccountCode || undefined,
    itemId: row.ProductCode || undefined,
    itemDescription: row.Description || undefined,
    unitAmount: row.UnitPrice,
    unitQuantity: row.Quantity,
    totalAmount: row.Total,
    taxAmount: row.TaxAmount,
    discountAmount: row.Discount || undefined,
  }
}

function mapShippingAddress(raw: FacturamaSalesOrder): Address | undefined {
  if (!raw.ShippingStreet && !raw.ShippingCity) return undefined
  return {
    address1: raw.ShippingStreet || undefined,
    city: raw.ShippingCity || undefined,
    region: raw.ShippingState || undefined,
    postalCode: raw.ShippingZipCode || undefined,
    country: raw.ShippingCountry || undefined,
  }
}

function mapBillingAddress(raw: FacturamaSalesOrder): Address | undefined {
  if (!raw.BillingStreet && !raw.BillingCity) return undefined
  return {
    address1: raw.BillingStreet || undefined,
    city: raw.BillingCity || undefined,
    region: raw.BillingState || undefined,
    postalCode: raw.BillingZipCode || undefined,
    country: raw.BillingCountry || undefined,
  }
}

export function transformSalesOrder(raw: FacturamaSalesOrder): SalesOrder {
  return {
    id: String(raw.Id),
    status: mapStatus(raw.Status),
    contactId: raw.ClientId || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Total,
    lineItems: (raw.Items ?? []).map(mapLineitem),
    billingAddress: mapBillingAddress(raw),
    shippingAddress: mapShippingAddress(raw),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    ClientId: order.contactId,
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
