import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem, Address } from '../../../schema/shared'

export interface ContaAzulPurchaseOrderItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  total: number
  tax_amount: number
  product_id: string
  account_id: string
  [key: string]: unknown
}

export interface ContaAzulPurchaseOrder {
  id: string
  supplier_id: string
  currency: string
  total: number
  date: string
  status: string
  delivery_address: string
  delivery_city: string
  delivery_state: string
  delivery_postal_code: string
  delivery_country: string
  items: ContaAzulPurchaseOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  const s = (status || '').toLowerCase()
  if (s === 'completed' || s === 'received') return 'COMPLETED'
  if (s === 'cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: ContaAzulPurchaseOrderItem): Lineitem {
  return {
    id: row.id || undefined,
    accountId: row.account_id || undefined,
    itemId: row.product_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.tax_amount || undefined,
  }
}

function mapShippingAddress(raw: ContaAzulPurchaseOrder): Address | undefined {
  if (!raw.delivery_address && !raw.delivery_city) return undefined
  return {
    address1: raw.delivery_address || undefined,
    city: raw.delivery_city || undefined,
    region: raw.delivery_state || undefined,
    postalCode: raw.delivery_postal_code || undefined,
    country: raw.delivery_country || undefined,
  }
}

export function transformPurchaseOrder(raw: ContaAzulPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    shippingAddress: mapShippingAddress(raw),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(
  order: Partial<PurchaseOrder>,
): Record<string, unknown> {
  return {
    supplier_id: order.contactId,
    currency: order.currency,
    date: toCalendarDate(order.postedAt),
    items: order.lineItems?.map((li) => ({
      product_id: li.itemId,
      description: li.itemDescription,
      unit_price: li.unitAmount,
      quantity: li.unitQuantity,
      account_id: li.accountId,
    })),
  }
}
