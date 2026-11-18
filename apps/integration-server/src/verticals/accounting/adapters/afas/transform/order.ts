/**
 * AFAS Profit_DeliveryOrders GetConnector → canonical Order transform.
 *
 * Fields returned by the Profit_DeliveryOrders standard GetConnector:
 *   OrderNr         — unique order number
 *   DebtorId        — customer / debtor code
 *   Description     — order description
 *   AmtTotal        — order total (base currency)
 *   CurrencyId      — ISO-4217 currency code
 *   OrderDate       — order date
 *   Status          — "O" (open), "D" (delivered), "C" (cancelled)
 */
import type { Order, OrderStatus } from '../../../schema/order'
import { toMinorUnits } from '../../shared/transform'

export interface AfasOrder {
  OrderNr: string
  DebtorId?: string | null
  Description?: string | null
  AmtTotal?: number | null
  CurrencyId?: string | null
  OrderDate?: string | null
  Status?: string | null
  [key: string]: unknown
}

function mapStatus(status: string | null | undefined): OrderStatus {
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

export function transformOrder(raw: AfasOrder): Order {
  return {
    id: raw.OrderNr,
    status: mapStatus(raw.Status),
    type: 'SALES',
    contactId: raw.DebtorId || undefined,
    currency: raw.CurrencyId || undefined,
    totalAmount: toMinorUnits(raw.AmtTotal),
    postedAt: parseDate(raw.OrderDate),
    metadata: raw as Record<string, unknown>,
  }
}
