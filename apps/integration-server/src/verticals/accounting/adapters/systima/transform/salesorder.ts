import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'
import { nonempty } from '../../shared/transform'
import type { SystimaLineItem } from './invoice'

export interface SystimaSalesOrder {
  id: string
  date?: string
  customerId?: string
  currency?: string
  status?: string
  lines?: SystimaLineItem[]
  [key: string]: unknown
}

function mapStatus(status?: string): SalesOrderStatus {
  switch (status?.toUpperCase()) {
    case 'CONFIRMED':
      return 'ACTIVE'
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(row: SystimaLineItem): Lineitem {
  return {
    id: row.id,
    accountId: row.accountNumber || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
  }
}

export function transformSalesOrder(raw: SystimaSalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.customerId || undefined,
    currency: raw.currency || undefined,
    lineItems: nonempty((raw.lines ?? []).map(mapLineitem)),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
