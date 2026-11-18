/**
 * DualEntry sales-order → canonical Order (derived).
 *
 * DualEntry has no generic "order" endpoint. The closest concept is
 * sales-orders at GET /public/v2/sales-orders/, which maps to
 * canonical Order with type = 'SALES'.
 *
 * This transform reuses DualentrySalesOrder (the same raw type as
 * transform/salesorder.ts) and projects it onto the Order schema.
 */
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'
import { parseDecimal, toAddress, toMinorUnits } from '../../shared/transform'
import type { DualentrySalesOrder } from './salesorder'

function mapStatus(raw: DualentrySalesOrder): OrderStatus {
  if (raw.record_status === 'archived') return 'CANCELLED'
  if (raw.invoiced_status === 'invoiced') return 'COMPLETED'
  if (raw.record_status === 'posted') return 'ACTIVE'
  return 'DRAFT'
}

function mapLineitem(item: DualentrySalesOrder['items'][number]): Lineitem {
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

export function transformOrder(raw: DualentrySalesOrder): Order {
  return {
    id: String(raw.id),
    type: 'SALES',
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
