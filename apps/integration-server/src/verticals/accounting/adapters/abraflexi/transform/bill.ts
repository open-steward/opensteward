import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface AbraflexiBillLine {
  id: string | number
  nazev?: string
  cenaMj?: number
  mnozstvi?: number
  sumZklZakl?: number
  sumDphZakl?: number
  ucetni?: string
  [key: string]: unknown
}

export interface AbraflexiBill {
  id: string | number
  kod?: string
  datVyst?: string
  datSplat?: string
  sumCelkem?: number
  sumDph?: number
  stavUhrK?: string
  firma?: string | number
  mena?: string
  polozkyFaktury?: AbraflexiBillLine[]
  [key: string]: unknown
}

function mapStatus(s?: string): BillStatus {
  switch (s) {
    case 'uhrazenoComp': return 'PAID'
    case 'vydanoK': return 'AUTHORIZED'
    case 'stornoK': return 'VOIDED'
    case 'castecneUhrazeno': return 'PARTIALLY_PAID'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: AbraflexiBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.stavUhrK),
    billNumber: raw.kod || undefined,
    contactId: raw.firma ? String(raw.firma) : undefined,
    currency: raw.mena || undefined,
    totalAmount: raw.sumCelkem,
    taxAmount: raw.sumDph,
    balanceAmount: raw.sumCelkem,
    postedAt: raw.datVyst ? new Date(raw.datVyst) : undefined,
    dueAt: raw.datSplat ? new Date(raw.datSplat) : undefined,
    lineItems: (raw.polozkyFaktury ?? []).map(l => ({
      id: String(l.id),
      itemDescription: l.nazev || undefined,
      unitAmount: l.cenaMj,
      unitQuantity: l.mnozstvi,
      totalAmount: l.sumZklZakl,
      taxAmount: l.sumDphZakl,
      accountId: l.ucetni ? String(l.ucetni) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
