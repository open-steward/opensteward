import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface BCSalesOrderForSO {
  id: string
  number: string
  customerId?: string
  customerName?: string
  orderDate?: string
  requestedDeliveryDate?: string
  currencyCode?: string
  totalAmountIncludingTax: number
  status: 'Draft' | 'Open' | 'Released' | 'Shipped' | 'Partially Shipped' | 'Invoiced'
  shipToAddressLine1?: string
  shipToAddressLine2?: string
  shipToCity?: string
  shipToState?: string
  shipToCountry?: string
  shipToPostalCode?: string
  billToAddressLine1?: string
  billToAddressLine2?: string
  billToCity?: string
  billToState?: string
  billToCountry?: string
  billToPostalCode?: string
  salesOrderLines?: Array<{
    id: string
    description?: string
    quantity: number
    unitPrice: number
    taxAmount: number
    totalAmountIncludingTax: number
    [key: string]: unknown
  }>
  [key: string]: unknown
}

function mapStatus(status: BCSalesOrderForSO['status']): SalesOrderStatus {
  switch (status) {
    case 'Draft':
      return 'DRAFT'
    case 'Shipped':
    case 'Invoiced':
      return 'COMPLETED'
    case 'Open':
    case 'Released':
    case 'Partially Shipped':
    default:
      return 'ACTIVE'
  }
}

function mapLineitem(line: NonNullable<BCSalesOrderForSO['salesOrderLines']>[number]): Lineitem {
  return {
    id: line.id,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    taxAmount: line.taxAmount,
    totalAmount: line.totalAmountIncludingTax,
  }
}

export function transformSalesOrder(raw: BCSalesOrderForSO): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.customerId || undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.totalAmountIncludingTax,
    lineItems: (raw.salesOrderLines ?? []).map(mapLineitem),
    billingAddress:
      raw.billToAddressLine1 || raw.billToCity
        ? {
            address1: raw.billToAddressLine1 || undefined,
            address2: raw.billToAddressLine2 || undefined,
            city: raw.billToCity || undefined,
            region: raw.billToState || undefined,
            postalCode: raw.billToPostalCode || undefined,
            country: raw.billToCountry || undefined,
          }
        : undefined,
    shippingAddress:
      raw.shipToAddressLine1 || raw.shipToCity
        ? {
            address1: raw.shipToAddressLine1 || undefined,
            address2: raw.shipToAddressLine2 || undefined,
            city: raw.shipToCity || undefined,
            region: raw.shipToState || undefined,
            postalCode: raw.shipToPostalCode || undefined,
            country: raw.shipToCountry || undefined,
          }
        : undefined,
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
