import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem, Address } from '../../../schema/shared'

export interface AlegraPurchaseOrderItem {
  id: number
  description: string
  quantity: number
  price: number
  total: number
  tax: number
  productId: string
  accountId: number
  [key: string]: unknown
}

export interface AlegraPurchaseOrder {
  id: number
  providerId: number
  currency: string
  total: number
  date: string
  status: string
  deliveryAddress: string
  deliveryCity: string
  deliveryDepartment: string
  deliveryCountry: string
  items: AlegraPurchaseOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  const s = (status || '').toLowerCase()
  if (s === 'completed' || s === 'received') return 'COMPLETED'
  if (s === 'cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: AlegraPurchaseOrderItem): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountId ? String(row.accountId) : undefined,
    itemId: row.productId || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.tax || undefined,
  }
}

function mapShippingAddress(raw: AlegraPurchaseOrder): Address | undefined {
  if (!raw.deliveryAddress && !raw.deliveryCity) return undefined
  return {
    address1: raw.deliveryAddress || undefined,
    city: raw.deliveryCity || undefined,
    region: raw.deliveryDepartment || undefined,
    country: raw.deliveryCountry || undefined,
  }
}

export function transformPurchaseOrder(raw: AlegraPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.providerId ? String(raw.providerId) : undefined,
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
    providerId: order.contactId ? Number(order.contactId) : undefined,
    currency: order.currency,
    date: toCalendarDate(order.postedAt),
    items: order.lineItems?.map((li) => ({
      productId: li.itemId,
      description: li.itemDescription,
      price: li.unitAmount,
      quantity: li.unitQuantity,
      accountId: li.accountId ? Number(li.accountId) : undefined,
    })),
  }
}
