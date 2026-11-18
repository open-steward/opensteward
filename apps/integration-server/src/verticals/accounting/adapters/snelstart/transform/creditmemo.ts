import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface SnelStartCreditMemo {
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

function mapStatus(cm: SnelStartCreditMemo): CreditMemoStatus {
  const status = cm.factuurstatus?.toLowerCase() ?? ''
  if (status === 'vervallen' || status === 'voided') return 'VOIDED'
  if (status === 'betaald' || (cm.openstaandSaldo === 0 && cm.factuurbedrag !== 0)) return 'PAID'
  if (cm.betaaldBedrag > 0 && cm.openstaandSaldo !== 0) return 'PARTIALLY_PAID'
  if (status === 'openstaand' || status === 'verstuurd') return 'AUTHORIZED'
  if (status === 'concept') return 'DRAFT'
  return 'DRAFT'
}

export function transformCreditMemo(raw: SnelStartCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw),
    creditmemoNumber: raw.factuurnummer || undefined,
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
