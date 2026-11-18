import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface MyunisoftCreditMemoRow {
  id: number
  description: string
  prix_unitaire: number
  quantite: number
  ht: number
  tva: number
  compte_id: string
  [key: string]: unknown
}

export interface MyunisoftCreditMemo {
  id: string
  invoice_number: string
  client_id: string
  date: string
  deadline: string
  ht: number
  tva: number
  ttc: number
  solde: number
  status: number
  devise: string
  lignes: MyunisoftCreditMemoRow[]
  [key: string]: unknown
}

function mapStatus(status: number): CreditMemoStatus {
  switch (status) {
    case 1: return 'AUTHORIZED'
    case 2: return 'PAID'
    case 3: return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: MyunisoftCreditMemoRow): Lineitem {
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

export function transformCreditMemo(raw: MyunisoftCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    creditmemoNumber: raw.invoice_number || undefined,
    contactId: raw.client_id || undefined,
    currency: raw.devise || undefined,
    totalAmount: raw.ttc,
    taxAmount: raw.tva,
    balanceAmount: raw.solde,
    lineItems: (raw.lignes ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.deadline ? new Date(raw.deadline) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
