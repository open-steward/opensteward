import type { Bill, BillStatus } from '../../../schema/bill'

export interface BmanFatturaAcquisto {
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
  fornitore_id: string
  [key: string]: unknown
}

function mapStatus(stato: string): BillStatus {
  switch (stato) {
    case 'inviata': return 'AUTHORIZED'
    case 'pagata': return 'PAID'
    case 'annullata': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: BmanFatturaAcquisto): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.stato),
    billNumber: raw.numero || undefined,
    contactId: raw.fornitore_id || undefined,
    currency: raw.valuta || undefined,
    totalAmount: raw.totale,
    taxAmount: raw.iva,
    balanceAmount: raw.saldo,
    postedAt: raw.data ? new Date(raw.data) : undefined,
    dueAt: raw.scadenza ? new Date(raw.scadenza) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
