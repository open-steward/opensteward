import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface ArubaRigaFattura {
  id: string
  descrizione: string
  quantita: number
  prezzo_unitario: number
  totale: number
  iva: number
  codice_conto: string
  [key: string]: unknown
}

export interface ArubaFattura {
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
  cliente_id: string
  righe?: ArubaRigaFattura[]
  [key: string]: unknown
}

function mapStatus(stato: string): InvoiceStatus {
  switch (stato) {
    case 'emessa': return 'AUTHORIZED'
    case 'pagata': return 'PAID'
    case 'annullata': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: ArubaRigaFattura): Lineitem {
  return {
    id: String(row.id),
    accountId: row.codice_conto || undefined,
    itemDescription: row.descrizione || undefined,
    unitAmount: row.prezzo_unitario,
    unitQuantity: row.quantita,
    totalAmount: row.totale,
    taxAmount: row.iva,
  }
}

export function transformInvoice(raw: ArubaFattura): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.stato),
    invoiceNumber: raw.numero_documento || undefined,
    contactId: raw.cliente_id || undefined,
    currency: raw.valuta || undefined,
    totalAmount: raw.importo_totale,
    taxAmount: raw.importo_iva,
    balanceAmount: raw.importo_residuo,
    lineItems: (raw.righe ?? []).map(mapLineitem),
    postedAt: raw.data_documento ? new Date(raw.data_documento) : undefined,
    dueAt: raw.data_scadenza ? new Date(raw.data_scadenza) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
