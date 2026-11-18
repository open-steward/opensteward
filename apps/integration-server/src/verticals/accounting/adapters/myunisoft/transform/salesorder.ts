import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface MyunisoftSalesOrderRow {
  id: number
  description: string
  prix_unitaire: number
  quantite: number
  ht: number
  compte_id: string
  [key: string]: unknown
}

export interface MyunisoftSalesOrder {
  id: string
  client_id: string
  devise: string
  ttc: number
  date: string
  statut: string
  lignes: MyunisoftSalesOrderRow[]
  [key: string]: unknown
}

function mapStatus(statut: string): SalesOrderStatus {
  if (statut === 'facture') return 'COMPLETED'
  if (statut === 'annule') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: MyunisoftSalesOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.compte_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.prix_unitaire,
    unitQuantity: row.quantite,
    totalAmount: row.ht,
  }
}

export function transformSalesOrder(raw: MyunisoftSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.statut),
    contactId: raw.client_id || undefined,
    currency: raw.devise || undefined,
    totalAmount: raw.ttc,
    lineItems: (raw.lignes ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
