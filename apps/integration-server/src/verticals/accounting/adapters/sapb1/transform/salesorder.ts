/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface SapB1SalesOrderLine {
  ItemCode: string
  ItemDescription: string
  Quantity: number
  UnitPrice: number
  LineTotal: number
  VatAmount: number
  AccountCode: string
}

export interface SapB1SalesOrder {
  DocNum: number
  CardCode: string
  DocDate: string
  DocDueDate: string
  DocCurrency: string
  DocTotal: number
  DocStatus: 'O' | 'C'
  Cancelled: 'Y' | 'N'
  DocumentLines?: SapB1SalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(raw: SapB1SalesOrder): SalesOrderStatus {
  if (raw.Cancelled === 'Y') return 'CANCELLED'
  if (raw.DocStatus === 'C') return 'COMPLETED'
  return 'ACTIVE'
}

function mapLineitem(line: SapB1SalesOrderLine): Lineitem {
  return {
    itemId: line.ItemCode || undefined,
    itemDescription: line.ItemDescription || undefined,
    unitAmount: line.UnitPrice,
    unitQuantity: line.Quantity,
    taxAmount: line.VatAmount,
    totalAmount: line.LineTotal,
    accountId: line.AccountCode || undefined,
  }
}

export function transformSalesOrder(raw: SapB1SalesOrder): SalesOrder {
  return {
    id: String(raw.DocNum),
    status: mapStatus(raw),
    contactId: raw.CardCode || undefined,
    currency: raw.DocCurrency || undefined,
    totalAmount: raw.DocTotal,
    lineItems: (raw.DocumentLines ?? []).map(mapLineitem),
    postedAt: raw.DocDate ? new Date(raw.DocDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
