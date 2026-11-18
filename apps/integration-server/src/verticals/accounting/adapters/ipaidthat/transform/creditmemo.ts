import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface IpaidthatCreditMemoRow {
  id: number
  description: string
  prix_unitaire: number
  quantite: number
  ht: number
  tva: number
  compte_id: string
  [key: string]: unknown
}

export interface IpaidthatCreditMemo {
  id: string
  ref: string
  client_id: string
  date: string
  due_date: string
  ht: number
  tva: number
  ttc: number
  restant: number
  etat: string
  devise: string
  lignes: IpaidthatCreditMemoRow[]
  [key: string]: unknown
}

function mapStatus(etat: string): CreditMemoStatus {
  switch (etat) {
    case 'envoyee': return 'AUTHORIZED'
    case 'payee': return 'PAID'
    case 'annulee': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: IpaidthatCreditMemoRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.compte_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.prix_unitaire,
    unitQuantity: row.quantite,
    totalAmount: row.ht,
    taxAmount: row.tva,
  }
}

export function transformCreditMemo(raw: IpaidthatCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.etat),
    creditmemoNumber: raw.ref || undefined,
    contactId: raw.client_id || undefined,
    currency: raw.devise || undefined,
    totalAmount: raw.ttc,
    taxAmount: raw.tva,
    balanceAmount: raw.restant,
    lineItems: (raw.lignes ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
