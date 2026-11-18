import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface MyunisoftInvoiceRow {
  id: number
  description: string
  prix_unitaire: number
  quantite: number
  ht: number
  tva: number
  compte_id: string
  [key: string]: unknown
}

export interface MyunisoftInvoice {
  id: string
  invoice_number: string
  date: string
  deadline: string
  ht: number
  tva: number
  ttc: number
  solde: number
  status: number
  client_id: string
  devise: string
  lignes: MyunisoftInvoiceRow[]
  [key: string]: unknown
}

function mapStatus(status: number): InvoiceStatus {
  switch (status) {
    case 1: return 'AUTHORIZED'
    case 2: return 'PAID'
    case 3: return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: MyunisoftInvoiceRow): Lineitem {
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

export function transformInvoice(raw: MyunisoftInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoice_number || undefined,
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
