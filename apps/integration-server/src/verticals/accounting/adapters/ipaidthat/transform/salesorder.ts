import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface IpaidthatSalesOrderRow {
  id: number
  description: string
  prix_unitaire: number
  quantite: number
  ht: number
  compte_id: string
  [key: string]: unknown
}

export interface IpaidthatSalesOrder {
  id: string
  client_id: string
  devise: string
  ttc: number
  date: string
  etat: string
  lignes: IpaidthatSalesOrderRow[]
  [key: string]: unknown
}

function mapStatus(etat: string): SalesOrderStatus {
  if (etat === 'facture') return 'COMPLETED'
  if (etat === 'annule') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: IpaidthatSalesOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.compte_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.prix_unitaire,
    unitQuantity: row.quantite,
    totalAmount: row.ht,
  }
}

export function transformSalesOrder(raw: IpaidthatSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.etat),
    contactId: raw.client_id || undefined,
    currency: raw.devise || undefined,
    totalAmount: raw.ttc,
    lineItems: (raw.lignes ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
