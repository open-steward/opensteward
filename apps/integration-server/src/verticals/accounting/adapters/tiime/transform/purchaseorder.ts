import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface TiimePurchaseOrderRow {
  id: number
  description: string
  prix_unitaire: number
  quantite: number
  montant_ht: number
  compte_id: string
  [key: string]: unknown
}

export interface TiimePurchaseOrder {
  id: string
  fournisseur_id: string
  devise: string
  montant_ttc: number
  date: string
  statut: string
  lignes: TiimePurchaseOrderRow[]
  [key: string]: unknown
}

function mapStatus(statut: string): PurchaseOrderStatus {
  if (statut === 'recu') return 'COMPLETED'
  if (statut === 'annule') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: TiimePurchaseOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.compte_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.prix_unitaire,
    unitQuantity: row.quantite,
    totalAmount: row.montant_ht,
  }
}

export function transformPurchaseOrder(raw: TiimePurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.statut),
    contactId: raw.fournisseur_id || undefined,
    currency: raw.devise || undefined,
    totalAmount: raw.montant_ttc,
    lineItems: (raw.lignes ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
