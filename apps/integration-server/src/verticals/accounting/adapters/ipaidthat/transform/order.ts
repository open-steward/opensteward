import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface IpaidthatOrderRow {
  id: number
  description: string
  prix_unitaire: number
  quantite: number
  ht: number
  compte_id: string
  [key: string]: unknown
}

export interface IpaidthatOrder {
  id: string
  client_id: string
  devise: string
  ttc: number
  date: string
  etat: string
  lignes: IpaidthatOrderRow[]
  [key: string]: unknown
}

function mapStatus(etat: string): OrderStatus {
  if (etat === 'facture') return 'COMPLETED'
  if (etat === 'annule') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: IpaidthatOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.compte_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.prix_unitaire,
    unitQuantity: row.quantite,
    totalAmount: row.ht,
  }
}

export function transformOrder(raw: IpaidthatOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.etat),
    type: 'SALES',
    contactId: raw.client_id || undefined,
    currency: raw.devise || undefined,
    totalAmount: raw.ttc,
    lineItems: (raw.lignes ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
