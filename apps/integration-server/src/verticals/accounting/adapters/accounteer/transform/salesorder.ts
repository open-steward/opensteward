import type { SalesOrder } from '../../../schema/salesorder'
import { nonempty, parseDecimal } from '../../shared/transform'

export interface AccounteerSalesOrderLineItem {
  id?: string
  description?: string
  quantity?: number
  unit_price?: number
  amount?: number
  [key: string]: unknown
}

export interface AccounteerSalesOrder {
  id: string
  order_number?: string
  contact_id?: string
  status?: string
  currency?: string
  total_amount?: number
  date?: string
  delivery_date?: string
  line_items?: AccounteerSalesOrderLineItem[]
  [key: string]: unknown
}

function mapStatus(raw?: string): SalesOrder['status'] {
  switch (raw?.toLowerCase()) {
    case 'draft': return 'DRAFT'
    case 'open':
    case 'confirmed':
    case 'active': return 'ACTIVE'
    case 'billed':
    case 'completed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'unknown'
  }
}

export function transformSalesOrder(raw: AccounteerSalesOrder): SalesOrder {
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
