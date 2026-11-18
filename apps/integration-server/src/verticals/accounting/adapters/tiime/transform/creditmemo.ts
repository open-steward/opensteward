import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface TiimeCreditMemoRow {
  id: number
  description: string
  prix_unitaire: number
  quantite: number
  montant_ht: number
  montant_tva: number
  compte_id: string
  [key: string]: unknown
}

export interface TiimeCreditMemo {
  id: string
  numero: string
  client_id: string
  date_emission: string
  date_echeance: string
  montant_ht: number
  montant_tva: number
  montant_ttc: number
  montant_restant: number
  statut: string
  devise: string
  lignes: TiimeCreditMemoRow[]
  [key: string]: unknown
}

function mapStatus(statut: string): CreditMemoStatus {
  switch (statut) {
    case 'emis': return 'AUTHORIZED'
    case 'paye': return 'PAID'
    case 'annule': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: TiimeCreditMemoRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.compte_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.prix_unitaire,
    unitQuantity: row.quantite,
    totalAmount: row.montant_ht,
    taxAmount: row.montant_tva,
  }
}

export function transformCreditMemo(raw: TiimeCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.statut),
    creditmemoNumber: raw.numero || undefined,
    contactId: raw.client_id || undefined,
    currency: raw.devise || undefined,
    totalAmount: raw.montant_ttc,
    taxAmount: raw.montant_tva,
    balanceAmount: raw.montant_restant,
    lineItems: (raw.lignes ?? []).map(mapLineitem),
    postedAt: raw.date_emission ? new Date(raw.date_emission) : undefined,
    dueAt: raw.date_echeance ? new Date(raw.date_echeance) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
