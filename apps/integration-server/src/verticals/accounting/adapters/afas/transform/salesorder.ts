/**
 * AFAS Profit_SalesOrders GetConnector → canonical SalesOrder transform.
 *
 * Fields returned by the Profit_SalesOrders standard GetConnector:
 *   OrderNr         — unique sales order number
 *   DebtorId        — customer / debtor code
 *   Description     — order description
 *   AmtTotal        — order total (base currency)
 *   CurrencyId      — ISO-4217 currency code
 *   OrderDate       — order date
 *   Status          — "O" (open), "D" (delivered / completed), "C" (cancelled)
 */
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import { toMinorUnits } from '../../shared/transform'

export interface AfasSalesOrder {
  OrderNr: string
  DebtorId?: string | null
  Description?: string | null
  AmtTotal?: number | null
  CurrencyId?: string | null
  OrderDate?: string | null
  Status?: string | null
  [key: string]: unknown
}

function mapStatus(status: string | null | undefined): SalesOrderStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'D':
    case 'DELIVERED':
      return 'COMPLETED'
    case 'C':
    case 'CANCELLED':
      return 'CANCELLED'
    case 'O':
    case 'OPEN':
    default:
      return 'ACTIVE'
  }
}

function parseDate(raw: string | null | undefined): Date | undefined {
  if (!raw) return undefined
  const d = new Date(raw)
  return isNaN(d.getTime()) ? undefined : d
}

export function transformSalesOrder(raw: AfasSalesOrder): SalesOrder {
  return {
    id: raw.OrderNr,
    status: mapStatus(raw.Status),
    contactId: raw.DebtorId || undefined,
    currency: raw.CurrencyId || undefined,
    totalAmount: toMinorUnits(raw.AmtTotal),
    postedAt: parseDate(raw.OrderDate),
    metadata: raw as Record<string, unknown>,
  }
}
