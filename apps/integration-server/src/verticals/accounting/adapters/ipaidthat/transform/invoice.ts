import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface IpaidthatInvoiceItem {
  id: number
  description?: string
  prix_unitaire?: number
  quantite?: number
  ht?: number
  tva?: number
  compte_id?: string
  [key: string]: unknown
}

export interface IpaidthatInvoice {
  id: string
  ref?: string
  date?: string
  due_date?: string
  ht?: number
  tva?: number
  ttc?: number
  restant?: number
  etat?: string
  client_id?: string
  devise?: string
  lignes?: IpaidthatInvoiceItem[]
  [key: string]: unknown
}

function mapStatus(etat?: string): InvoiceStatus {
  switch (etat) {
    case 'envoyee': return 'AUTHORIZED'
    case 'payee': return 'PAID'
    case 'annulee': return 'VOIDED'
    case 'brouillon':
    default: return 'DRAFT'
  }
}

function mapLineitem(row: IpaidthatInvoiceItem): Lineitem {
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

export function transformInvoice(raw: IpaidthatInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.etat),
    invoiceNumber: raw.ref || undefined,
    contactId: raw.client_id ? String(raw.client_id) : undefined,
    currency: raw.devise || undefined,
    totalAmount: raw.ttc,
    taxAmount: raw.tva,
    balanceAmount: raw.restant,
    lineItems: (raw.lignes ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
