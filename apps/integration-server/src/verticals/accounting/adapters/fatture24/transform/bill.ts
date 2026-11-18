import type { Bill, BillStatus } from '../../../schema/bill'

export interface Fatture24FatturaAcquisto {
  id: string
  Numero: string
  DataFattura: string
  DataScadenza: string
  Netto: number
  Iva: number
  Totale: number
  Residuo: number
  Stato: string
  Valuta: string
  FornitoreId: string
  [key: string]: unknown
}

function mapStatus(stato: string): BillStatus {
  switch (stato) {
    case 'emessa': return 'AUTHORIZED'
    case 'pagata': return 'PAID'
    case 'annullata': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: Fatture24FatturaAcquisto): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.Stato),
    billNumber: raw.Numero || undefined,
    contactId: raw.FornitoreId || undefined,
    currency: raw.Valuta || undefined,
    totalAmount: raw.Totale,
    taxAmount: raw.Iva,
    balanceAmount: raw.Residuo,
    postedAt: raw.DataFattura ? new Date(raw.DataFattura) : undefined,
    dueAt: raw.DataScadenza ? new Date(raw.DataScadenza) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
