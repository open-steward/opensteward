import type { Bill, BillStatus } from '../../../schema/bill'

export interface TiimeBill {
  id: string
  numero: string
  fournisseur_id: string
  montant_ht: number
  montant_tva: number
  montant_ttc: number
  montant_restant: number
  devise: string
  date_emission: string
  date_echeance: string
  statut: string
  [key: string]: unknown
}

function mapStatus(statut: string): BillStatus {
  switch (statut) {
    case 'emis': return 'AUTHORIZED'
    case 'paye': return 'PAID'
    case 'annule': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: TiimeBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.statut),
    billNumber: raw.numero || undefined,
    contactId: raw.fournisseur_id || undefined,
    currency: raw.devise || undefined,
    totalAmount: raw.montant_ttc,
    taxAmount: raw.montant_tva,
    balanceAmount: raw.montant_restant,
    postedAt: raw.date_emission ? new Date(raw.date_emission) : undefined,
    dueAt: raw.date_echeance ? new Date(raw.date_echeance) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
