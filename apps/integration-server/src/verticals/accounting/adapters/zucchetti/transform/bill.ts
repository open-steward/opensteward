import type { Bill, BillStatus } from '../../../schema/bill'

export interface ZucchettiFatturaAcquisto {
  id: string
  numero_fattura: string
  data_fattura: string
  data_scadenza: string
  imponibile: number
  iva: number
  totale: number
  residuo: number
  stato: string
  valuta: string
  fornitore_id: string
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

export function transformBill(raw: ZucchettiFatturaAcquisto): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.stato),
    billNumber: raw.numero_fattura || undefined,
    contactId: raw.fornitore_id || undefined,
    currency: raw.valuta || undefined,
    totalAmount: raw.totale,
    taxAmount: raw.iva,
    balanceAmount: raw.residuo,
    postedAt: raw.data_fattura ? new Date(raw.data_fattura) : undefined,
    dueAt: raw.data_scadenza ? new Date(raw.data_scadenza) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
