import type { Order } from '../../../schema/order'
import { nonempty, parseDecimal } from '../../shared/transform'

export interface AccounteerOrderLineItem {
  id?: string
  description?: string
  quantity?: number
  unit_price?: number
  amount?: number
  [key: string]: unknown
}

export interface AccounteerOrder {
  id: string
  order_number?: string
  contact_id?: string
  status?: string
  currency?: string
  total_amount?: number
  date?: string
  expiry_date?: string
  line_items?: AccounteerOrderLineItem[]
  [key: string]: unknown
}

function mapStatus(raw?: string): Order['status'] {
  switch (raw?.toLowerCase()) {
    case 'draft': return 'DRAFT'
    case 'sent':
    case 'open':
    case 'active': return 'ACTIVE'
    case 'completed':
    case 'invoiced': return 'COMPLETED'
    case 'cancelled':
    case 'deleted': return 'CANCELLED'
    case 'refunded': return 'REFUNDED'
    default: return 'unknown'
  }
}

export function transformOrder(raw: AccounteerOrder): Order {
  return {
    id: String(raw.id),
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    status: mapStatus(raw.status),
    currency: raw.currency || undefined,
    totalAmount: parseDecimal(raw.total_amount),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    lineItems: nonempty(
      (raw.line_items ?? []).map((li) => ({
        id: li.id ? String(li.id) : undefined,
        itemDescription: li.description || undefined,
        unitQuantity: li.quantity,
        unitAmount: parseDecimal(li.unit_price),
        totalAmount: parseDecimal(li.amount),
      })),
    ),
    metadata: raw as Record<string, unknown>,
  }
}
