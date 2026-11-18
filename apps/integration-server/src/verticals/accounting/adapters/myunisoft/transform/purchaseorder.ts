import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface MyunisoftPurchaseOrderRow {
  id: number
  description: string
  prix_unitaire: number
  quantite: number
  ht: number
  compte_id: string
  [key: string]: unknown
}

export interface MyunisoftPurchaseOrder {
  id: string
  fournisseur_id: string
  devise: string
  ttc: number
  date: string
  statut: string
  lignes: MyunisoftPurchaseOrderRow[]
  [key: string]: unknown
}

function mapStatus(statut: string): PurchaseOrderStatus {
  if (statut === 'recu') return 'COMPLETED'
  if (statut === 'annule') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: MyunisoftPurchaseOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.compte_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.prix_unitaire,
    unitQuantity: row.quantite,
    totalAmount: row.ht,
  }
}

export function transformPurchaseOrder(raw: MyunisoftPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.statut),
    contactId: raw.fournisseur_id || undefined,
    currency: raw.devise || undefined,
    totalAmount: raw.ttc,
    lineItems: (raw.lignes ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
