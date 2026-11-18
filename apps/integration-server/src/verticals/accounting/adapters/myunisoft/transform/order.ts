import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface MyunisoftOrderRow {
  id: number
  description: string
  prix_unitaire: number
  quantite: number
  ht: number
  compte_id: string
  [key: string]: unknown
}

export interface MyunisoftOrder {
  id: string
  client_id: string
  devise: string
  ttc: number
  date: string
  statut: string
  lignes: MyunisoftOrderRow[]
  [key: string]: unknown
}

function mapStatus(statut: string): OrderStatus {
  if (statut === 'facture') return 'COMPLETED'
  if (statut === 'annule') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: MyunisoftOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.compte_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.prix_unitaire,
    unitQuantity: row.quantite,
    totalAmount: row.ht,
  }
}

export function transformOrder(raw: MyunisoftOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.statut),
    type: 'SALES',
    contactId: raw.client_id || undefined,
    currency: raw.devise || undefined,
    totalAmount: raw.ttc,
    lineItems: (raw.lignes ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
