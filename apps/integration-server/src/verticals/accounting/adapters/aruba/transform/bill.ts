import type { Bill, BillStatus } from '../../../schema/bill'

export interface ArubaFatturaAcquisto {
  id: string
  numero_documento: string
  data_documento: string
  data_scadenza: string
  importo_netto: number
  importo_iva: number
  importo_totale: number
  importo_residuo: number
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

export function transformBill(raw: ArubaFatturaAcquisto): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.stato),
    billNumber: raw.numero_documento || undefined,
    contactId: raw.fornitore_id || undefined,
    currency: raw.valuta || undefined,
    totalAmount: raw.importo_totale,
    taxAmount: raw.importo_iva,
    balanceAmount: raw.importo_residuo,
    postedAt: raw.data_documento ? new Date(raw.data_documento) : undefined,
    dueAt: raw.data_scadenza ? new Date(raw.data_scadenza) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
