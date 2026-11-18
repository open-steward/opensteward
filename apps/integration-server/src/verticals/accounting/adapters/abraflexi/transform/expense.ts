import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface AbraflexiExpenseLine {
  id: string | number
  nazev?: string
  cenaMj?: number
  mnozstvi?: number
  sumZklZakl?: number
  sumDphZakl?: number
  ucetni?: string
  [key: string]: unknown
}

export interface AbraflexiExpense {
  id: string | number
  datVyst?: string
  sumCelkem?: number
  sumDph?: number
  mena?: string
  firma?: string | number
  ucetni?: string
  polozky?: AbraflexiExpenseLine[]
  [key: string]: unknown
}

export function transformExpense(raw: AbraflexiExpense): Expense {
  return {
    id: String(raw.id),
    contactId: raw.firma ? String(raw.firma) : undefined,
    accountId: raw.ucetni ? String(raw.ucetni) : undefined,
    currency: raw.mena || undefined,
    totalAmount: raw.sumCelkem,
    taxAmount: raw.sumDph,
    postedAt: raw.datVyst ? new Date(raw.datVyst) : undefined,
    lineItems: (raw.polozky ?? []).map(l => ({
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
