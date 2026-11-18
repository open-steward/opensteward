import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface TiimeOrderRow {
  id: number
  description: string
  prix_unitaire: number
  quantite: number
  montant_ht: number
  compte_id: string
  [key: string]: unknown
}

export interface TiimeOrder {
  id: string
  client_id: string
  devise: string
  montant_ttc: number
  date: string
  statut: string
  lignes: TiimeOrderRow[]
  [key: string]: unknown
}

function mapStatus(statut: string): OrderStatus {
  if (statut === 'facture') return 'COMPLETED'
  if (statut === 'annule') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: TiimeOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.compte_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.prix_unitaire,
    unitQuantity: row.quantite,
    totalAmount: row.montant_ht,
  }
}

export function transformOrder(raw: TiimeOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.statut),
    type: 'SALES',
    contactId: raw.client_id || undefined,
    currency: raw.devise || undefined,
    totalAmount: raw.montant_ttc,
    lineItems: (raw.lignes ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
