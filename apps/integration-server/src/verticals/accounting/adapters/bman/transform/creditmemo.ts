import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface BmanRigaNotaCredito {
  id: string
  descrizione: string
  quantita: number
  prezzo: number
  totale: number
  iva: number
  conto: string
  [key: string]: unknown
}

export interface BmanNotaCredito {
  id: string
  numero: string
  data: string
  scadenza: string
  netto: number
  iva: number
  totale: number
  saldo: number
  stato: string
  valuta: string
  cliente_id: string
  righe?: BmanRigaNotaCredito[]
  [key: string]: unknown
}

function mapStatus(stato: string): CreditMemoStatus {
  switch (stato) {
    case 'inviata': return 'AUTHORIZED'
    case 'pagata': return 'PAID'
    case 'annullata': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: BmanRigaNotaCredito): Lineitem {
  return {
    id: String(row.id),
    accountId: row.conto || undefined,
    itemDescription: row.descrizione || undefined,
    unitAmount: row.prezzo,
    unitQuantity: row.quantita,
    totalAmount: row.totale,
    taxAmount: row.iva,
  }
}

export function transformCreditMemo(raw: BmanNotaCredito): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.stato),
    creditmemoNumber: raw.numero || undefined,
    contactId: raw.cliente_id || undefined,
    currency: raw.valuta || undefined,
    totalAmount: raw.totale,
    taxAmount: raw.iva,
    balanceAmount: raw.saldo,
    lineItems: (raw.righe ?? []).map(mapLineitem),
    postedAt: raw.data ? new Date(raw.data) : undefined,
    dueAt: raw.scadenza ? new Date(raw.scadenza) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
