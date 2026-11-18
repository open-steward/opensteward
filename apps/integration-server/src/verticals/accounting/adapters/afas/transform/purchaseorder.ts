/**
 * AFAS Profit_PurchaseOrders GetConnector → canonical PurchaseOrder transform.
 *
 * Fields returned by the Profit_PurchaseOrders standard GetConnector:
 *   OrderNr         — unique purchase order number
 *   CreditorId      — supplier / creditor code
 *   Description     — order description
 *   AmtTotal        — order total (base currency)
 *   CurrencyId      — ISO-4217 currency code
 *   OrderDate       — order date
 *   Status          — "O" (open), "R" (received), "C" (cancelled)
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import { toMinorUnits } from '../../shared/transform'

export interface AfasPurchaseOrder {
  OrderNr: string
  CreditorId?: string | null
  Description?: string | null
  AmtTotal?: number | null
  CurrencyId?: string | null
  OrderDate?: string | null
  Status?: string | null
  [key: string]: unknown
}

function mapStatus(status: string | null | undefined): PurchaseOrderStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'R':
    case 'RECEIVED':
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

export function transformPurchaseOrder(raw: AfasPurchaseOrder): PurchaseOrder {
  return {
    id: raw.OrderNr,
    status: mapStatus(raw.Status),
    contactId: raw.CreditorId || undefined,
    currency: raw.CurrencyId || undefined,
    totalAmount: toMinorUnits(raw.AmtTotal),
    postedAt: parseDate(raw.OrderDate),
    metadata: raw as Record<string, unknown>,
  }
}
