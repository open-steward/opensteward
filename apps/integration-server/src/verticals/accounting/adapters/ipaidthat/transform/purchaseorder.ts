import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface IpaidthatPurchaseOrderRow {
  id: number
  description: string
  prix_unitaire: number
  quantite: number
  ht: number
  compte_id: string
  [key: string]: unknown
}

export interface IpaidthatPurchaseOrder {
  id: string
  fournisseur_id: string
  devise: string
  ttc: number
  date: string
  etat: string
  lignes: IpaidthatPurchaseOrderRow[]
  [key: string]: unknown
}

function mapStatus(etat: string): PurchaseOrderStatus {
  if (etat === 'recu') return 'COMPLETED'
  if (etat === 'annule') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: IpaidthatPurchaseOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.compte_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.prix_unitaire,
    unitQuantity: row.quantite,
    totalAmount: row.ht,
  }
}

export function transformPurchaseOrder(raw: IpaidthatPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.etat),
    contactId: raw.fournisseur_id || undefined,
    currency: raw.devise || undefined,
    totalAmount: raw.ttc,
    lineItems: (raw.lignes ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
