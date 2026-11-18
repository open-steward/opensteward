import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface SnelStartInkooporderRegel {
  id: string
  omschrijving: string
  bedrag: number
  btwBedrag: number
  grootboekrekening: { id: string } | null
  aantal: number
  stuksprijs: number
  [key: string]: unknown
}

export interface SnelStartPurchaseOrder {
  id: string
  ordernummer: string
  relatie: { id: string } | null
  valutacode: string
  orderdatum: string
  status: string
  totaalbedrag: number
  btwBedrag: number
  regels: SnelStartInkooporderRegel[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  const s = status?.toLowerCase() ?? ''
  if (s === 'ontvangen' || s === 'completed') return 'COMPLETED'
  if (s === 'geannuleerd' || s === 'cancelled') return 'CANCELLED'
  if (s === 'concept') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: SnelStartInkooporderRegel): Lineitem {
  return {
    id: row.id,
    accountId: row.grootboekrekening?.id || undefined,
    itemDescription: row.omschrijving || undefined,
    unitAmount: row.stuksprijs,
    unitQuantity: row.aantal,
    totalAmount: row.bedrag,
    taxAmount: row.btwBedrag || undefined,
  }
}

export function transformPurchaseOrder(raw: SnelStartPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.relatie?.id || undefined,
    currency: raw.valutacode || undefined,
    totalAmount: raw.totaalbedrag,
    lineItems: (raw.regels ?? []).map(mapLineitem),
    postedAt: raw.orderdatum ? new Date(raw.orderdatum) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(order: Partial<PurchaseOrder>): Record<string, unknown> {
  return {
    relatie: order.contactId ? { id: order.contactId } : undefined,
    valutacode: order.currency,
    orderdatum: toCalendarDate(order.postedAt),
    regels: order.lineItems?.map((li) => ({
      omschrijving: li.itemDescription,
      stuksprijs: li.unitAmount,
      aantal: li.unitQuantity,
      grootboekrekening: li.accountId ? { id: li.accountId } : undefined,
    })),
  }
}
