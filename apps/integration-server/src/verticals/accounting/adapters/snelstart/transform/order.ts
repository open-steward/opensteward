import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface SnelStartOrderRegel {
  id: string
  omschrijving: string
  bedrag: number
  btwBedrag: number
  grootboekrekening: { id: string } | null
  aantal: number
  stuksprijs: number
  [key: string]: unknown
}

export interface SnelStartOrder {
  id: string
  ordernummer: string
  relatie: { id: string } | null
  valutacode: string
  orderdatum: string
  status: string
  totaalbedrag: number
  btwBedrag: number
  regels: SnelStartOrderRegel[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  const s = status?.toLowerCase() ?? ''
  if (s === 'gefactureerd' || s === 'completed') return 'COMPLETED'
  if (s === 'geannuleerd' || s === 'cancelled') return 'CANCELLED'
  if (s === 'concept') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: SnelStartOrderRegel): Lineitem {
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

export function transformOrder(raw: SnelStartOrder): Order {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.relatie?.id || undefined,
    currency: raw.valutacode || undefined,
    totalAmount: raw.totaalbedrag,
    lineItems: (raw.regels ?? []).map(mapLineitem),
    postedAt: raw.orderdatum ? new Date(raw.orderdatum) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
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
