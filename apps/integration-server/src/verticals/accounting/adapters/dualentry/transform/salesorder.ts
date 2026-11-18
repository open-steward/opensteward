/**
 * DualEntry sales-order → canonical SalesOrder.
 *
 * DualEntry exposes sales orders at GET /public/v2/sales-orders/.
 * They represent customer commitments before invoicing and progress through
 * draft → posted → archived, with a parallel invoiced_status tracking
 * how much has been converted to invoices.
 */
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'
import { parseDecimal, toAddress, toMinorUnits } from '../../shared/transform'

export interface DualentrySalesOrderItem {
  id: number
  item_id: number | null
  position: number
  memo: string | null
  quantity: string
  rate: string
  quantity_invoiced: string | null
  quantity_due: string | null
  net_amount: string
  tax_amount: string
  gross_amount: string
  amount: string
  [key: string]: unknown
}

export interface DualentrySalesOrderAddress {
  street: string | null
  second_line: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
  [key: string]: unknown
}

export interface DualentrySalesOrder {
  id: number
  internal_id: number
  number: number | null
  date: string | null
  created_at: string | null
  updated_at: string | null
  company_id: number | null
  company_name: string | null
  company_currency: string | null
  customer_id: number | null
  customer_name: string | null
  currency_iso_4217_code: string | null
  exchange_rate: string | null
  amount: string
  invoiced_total: string | null
  due_total: string | null
  memo: string | null
  reference_number: string | null
  record_status: 'draft' | 'posted' | 'archived' | string
  invoiced_status: 'invoiced' | 'uninvoiced' | 'partially_invoiced' | string | null
  approval_status: string | null
  billing_address: DualentrySalesOrderAddress | null
  shipping_address: DualentrySalesOrderAddress | null
  items: DualentrySalesOrderItem[]
  [key: string]: unknown
}

function mapStatus(raw: DualentrySalesOrder): SalesOrderStatus {
  if (raw.record_status === 'archived') return 'CANCELLED'
  if (raw.invoiced_status === 'invoiced') return 'COMPLETED'
  if (raw.record_status === 'posted') return 'ACTIVE'
  return 'DRAFT'
}

function mapLineitem(item: DualentrySalesOrderItem): Lineitem {
  return {
    id: String(item.id),
    itemId: item.item_id != null ? String(item.item_id) : undefined,
    itemDescription: item.memo || undefined,
    unitAmount: toMinorUnits(item.rate),
    unitQuantity:
      parseDecimal(item.quantity) != null
        ? Math.round(parseDecimal(item.quantity)!)
        : undefined,
    totalAmount: toMinorUnits(item.gross_amount),
    taxAmount: toMinorUnits(item.tax_amount),
  }
}

export function transformSalesOrder(raw: DualentrySalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    // contactId uses the compound prefix required by getContact()
    contactId: raw.customer_id != null ? `cust_${raw.customer_id}` : undefined,
    currency: raw.currency_iso_4217_code || undefined,
    totalAmount: toMinorUnits(raw.amount),
    lineItems: (raw.items ?? []).map(mapLineitem),
    billingAddress: raw.billing_address
      ? toAddress({
          address1: raw.billing_address.street,
          address2: raw.billing_address.second_line,
          city: raw.billing_address.city,
          region: raw.billing_address.state,
          postalCode: raw.billing_address.postal_code,
          country: raw.billing_address.country,
        })
      : undefined,
    shippingAddress: raw.shipping_address
      ? toAddress({
          address1: raw.shipping_address.street,
          address2: raw.shipping_address.second_line,
          city: raw.shipping_address.city,
          region: raw.shipping_address.state,
          postalCode: raw.shipping_address.postal_code,
          country: raw.shipping_address.country,
        })
      : undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
