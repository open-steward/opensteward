import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem, Address } from '../../../schema/shared'
import { toMinorUnits, fromMinorUnits, prefixedId, unprefixedId, toCalendarDate } from '../../shared/transform'

export interface FortnoxSalesOrderRow {
  RowId: number
  ArticleNumber: string
  Description: string
  Price: number
  OrderedQuantity: number
  Total: number
  VAT: number
  AccountNumber: string
  Discount: number
}

export interface FortnoxSalesOrder {
  DocumentNumber: string
  CustomerNumber: string
  CustomerName: string
  Currency: string
  Total: number
  OrderDate: string
  Status: string
  DeliveryAddress1: string
  DeliveryAddress2: string
  DeliveryCity: string
  DeliveryZipCode: string
  DeliveryCountryCode: string
  Address1: string
  Address2: string
  City: string
  ZipCode: string
  CountryCode: string
  OrderRows: FortnoxSalesOrderRow[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  if (status === 'invoiced') return 'COMPLETED'
  if (status === 'cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: FortnoxSalesOrderRow): Lineitem {
  return {
    id: String(row.RowId),
    accountId: row.AccountNumber || undefined,
    itemId: row.ArticleNumber || undefined,
    itemDescription: row.Description || undefined,
    unitAmount: toMinorUnits(row.Price),
    unitQuantity: row.OrderedQuantity,
    totalAmount: toMinorUnits(row.Total),
    taxAmount: toMinorUnits(row.VAT),
    discountAmount: toMinorUnits(row.Discount) || undefined,
  }
}

function mapShippingAddress(raw: FortnoxSalesOrder): Address | undefined {
  if (!raw.DeliveryAddress1 && !raw.DeliveryCity) return undefined
  return {
    address1: raw.DeliveryAddress1 || undefined,
    address2: raw.DeliveryAddress2 || undefined,
    city: raw.DeliveryCity || undefined,
    postalCode: raw.DeliveryZipCode || undefined,
    country: raw.DeliveryCountryCode || undefined,
  }
}

function mapBillingAddress(raw: FortnoxSalesOrder): Address | undefined {
  if (!raw.Address1 && !raw.City) return undefined
  return {
    address1: raw.Address1 || undefined,
    address2: raw.Address2 || undefined,
    city: raw.City || undefined,
    postalCode: raw.ZipCode || undefined,
    country: raw.CountryCode || undefined,
  }
}

export function transformSalesOrder(raw: FortnoxSalesOrder): SalesOrder {
  return {
    id: raw.DocumentNumber,
    status: mapStatus(raw.Status),
    contactId: prefixedId('cust', raw.CustomerNumber),
    currency: raw.Currency || undefined,
    totalAmount: toMinorUnits(raw.Total),
    lineItems: raw.OrderRows ? raw.OrderRows.map(mapLineitem) : null,
    billingAddress: mapBillingAddress(raw),
    shippingAddress: mapShippingAddress(raw),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// Canonical SalesOrder → Fortnox body (for create)
export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    CustomerNumber: unprefixedId('cust', order.contactId),
    Currency: order.currency,
    OrderDate: toCalendarDate(order.postedAt),
    OrderRows: order.lineItems?.map((li) => ({
      ArticleNumber: li.itemId,
      Description: li.itemDescription,
      Price: fromMinorUnits(li.unitAmount),
      OrderedQuantity: li.unitQuantity,
      AccountNumber: li.accountId,
    })),
  }
}
