import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface Fatture24Riga {
  Id: string
  Descrizione: string
  Quantita: number
  PrezzoUnitario: number
  Totale: number
  Iva: number
  CodiceConto: string
  [key: string]: unknown
}

export interface Fatture24Fattura {
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
  ClienteId: string
  Righe?: Fatture24Riga[]
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

function mapLineitem(row: Fatture24Riga): Lineitem {
  return {
    id: String(row.Id),
    accountId: row.CodiceConto || undefined,
    itemDescription: row.Descrizione || undefined,
    unitAmount: row.PrezzoUnitario,
    unitQuantity: row.Quantita,
    totalAmount: row.Totale,
    taxAmount: row.Iva,
  }
}

export function transformInvoice(raw: Fatture24Fattura): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.Stato),
    invoiceNumber: raw.Numero || undefined,
    contactId: raw.ClienteId || undefined,
    currency: raw.Valuta || undefined,
    totalAmount: raw.Totale,
    taxAmount: raw.Iva,
    balanceAmount: raw.Residuo,
    lineItems: (raw.Righe ?? []).map(mapLineitem),
    postedAt: raw.DataFattura ? new Date(raw.DataFattura) : undefined,
    dueAt: raw.DataScadenza ? new Date(raw.DataScadenza) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
