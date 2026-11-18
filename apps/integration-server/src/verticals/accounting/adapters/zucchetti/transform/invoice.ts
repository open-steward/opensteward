import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface ZucchettiRiga {
  id: string
  descrizione: string
  quantita: number
  prezzo: number
  totale: number
  iva: number
  conto: string
  [key: string]: unknown
}

export interface ZucchettifatturaVendita {
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
  cliente_id: string
  righe?: ZucchettiRiga[]
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

function mapLineitem(row: ZucchettiRiga): Lineitem {
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

export function transformInvoice(raw: ZucchettifatturaVendita): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.stato),
    invoiceNumber: raw.numero_fattura || undefined,
    contactId: raw.cliente_id || undefined,
    currency: raw.valuta || undefined,
    totalAmount: raw.totale,
    taxAmount: raw.iva,
    balanceAmount: raw.residuo,
    lineItems: (raw.righe ?? []).map(mapLineitem),
    postedAt: raw.data_fattura ? new Date(raw.data_fattura) : undefined,
    dueAt: raw.data_scadenza ? new Date(raw.data_scadenza) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
