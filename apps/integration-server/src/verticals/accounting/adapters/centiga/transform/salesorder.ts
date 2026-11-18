import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'
import { nonempty } from '../../shared/transform'
import type { CentigaLineItem } from './invoice'

export interface CentigaSalesOrder {
  id: string
  date?: string
  customer_id?: string
  currency?: string
  status?: string
  line_items?: CentigaLineItem[]
  [key: string]: unknown
}

function mapStatus(status?: string): SalesOrderStatus {
  switch (status?.toLowerCase()) {
    case 'confirmed':
      return 'ACTIVE'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(row: CentigaLineItem): Lineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
  }
}

export function transformSalesOrder(raw: CentigaSalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.customer_id || undefined,
    currency: raw.currency || undefined,
    lineItems: nonempty((raw.line_items ?? []).map(mapLineitem)),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
