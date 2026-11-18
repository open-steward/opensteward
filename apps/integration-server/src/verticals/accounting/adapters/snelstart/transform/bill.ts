import type { Bill, BillStatus } from '../../../schema/bill'

export interface SnelStartBill {
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
  [key: string]: unknown
}

function mapStatus(bill: SnelStartBill): BillStatus {
  const status = bill.factuurstatus?.toLowerCase() ?? ''
  if (status === 'vervallen' || status === 'voided') return 'VOIDED'
  if (status === 'betaald' || (bill.openstaandSaldo === 0 && bill.factuurbedrag > 0)) return 'PAID'
  if (bill.betaaldBedrag > 0 && bill.openstaandSaldo > 0) return 'PARTIALLY_PAID'
  if (status === 'openstaand' || status === 'verstuurd') return 'AUTHORIZED'
  if (status === 'concept') return 'DRAFT'
  return 'DRAFT'
}

export function transformBill(raw: SnelStartBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.factuurnummer || undefined,
    contactId: raw.relatie?.id || undefined,
    currency: raw.valutacode || undefined,
    totalAmount: raw.factuurbedrag,
    taxAmount: raw.btw,
    balanceAmount: raw.openstaandSaldo,
    paidAmount: raw.betaaldBedrag || undefined,
    postedAt: raw.factuurdatum ? new Date(raw.factuurdatum) : undefined,
    dueAt: raw.vervalDatum ? new Date(raw.vervalDatum) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
