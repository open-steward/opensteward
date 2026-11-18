import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface SnelStartInvoiceLine {
  id: string
  omschrijving: string
  bedrag: number
  btwBedrag: number
  grootboekrekening: { id: string } | null
  aantal: number
  stuksprijs: number
  btwSoort: { id: string } | null
  [key: string]: unknown
}

export interface SnelStartInvoice {
  id: string
  factuurnummer: string
  relatie: { id: string } | null
  factuurbedrag: number
  btw: number
  openstaandSaldo: number
  betaaldBedrag: number
  valutacode: string
  factuurdatum: string
  vervalDatum: string
  factuurstatus: string
  regels: SnelStartInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(inv: SnelStartInvoice): InvoiceStatus {
  const status = inv.factuurstatus?.toLowerCase() ?? ''
  if (status === 'vervallen' || status === 'voided') return 'VOIDED'
  if (status === 'betaald' || (inv.openstaandSaldo === 0 && inv.factuurbedrag > 0)) return 'PAID'
  if (inv.betaaldBedrag > 0 && inv.openstaandSaldo > 0) return 'PARTIALLY_PAID'
  if (status === 'openstaand' || status === 'verstuurd') return 'AUTHORIZED'
  if (status === 'concept') return 'DRAFT'
  return 'DRAFT'
}

function mapLineitem(row: SnelStartInvoiceLine): Lineitem {
  return {
    id: row.id,
    accountId: row.grootboekrekening?.id || undefined,
    itemDescription: row.omschrijving || undefined,
    unitAmount: row.stuksprijs,
    unitQuantity: row.aantal,
    totalAmount: row.bedrag,
    taxAmount: row.btwBedrag || undefined,
    taxrateId: row.btwSoort?.id || undefined,
  }
}

export function transformInvoice(raw: SnelStartInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.factuurnummer || undefined,
    contactId: raw.relatie?.id || undefined,
    currency: raw.valutacode || undefined,
    totalAmount: raw.factuurbedrag,
    taxAmount: raw.btw,
    balanceAmount: raw.openstaandSaldo,
    paidAmount: raw.betaaldBedrag || undefined,
    lineItems: (raw.regels ?? []).map(mapLineitem),
    postedAt: raw.factuurdatum ? new Date(raw.factuurdatum) : undefined,
    dueAt: raw.vervalDatum ? new Date(raw.vervalDatum) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
