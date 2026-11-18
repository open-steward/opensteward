import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface AbraflexiJournalLine {
  id?: string | number
  ucetni?: string
  popis?: string
  md?: number
  dal?: number
  castka?: number
  [key: string]: unknown
}

export interface AbraflexiJournal {
  id: string | number
  datVyst?: string
  popis?: string
  cisloDokladu?: string
  mena?: string
  polozky?: AbraflexiJournalLine[]
  [key: string]: unknown
}

export function transformJournal(raw: AbraflexiJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.popis || undefined,
    reference: raw.cisloDokladu || undefined,
    currency: raw.mena || undefined,
    postedAt: raw.datVyst ? new Date(raw.datVyst) : undefined,
    lineItems: (raw.polozky ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      accountId: l.ucetni ? String(l.ucetni) : undefined,
      description: l.popis || undefined,
      debitAmount: l.md,
      creditAmount: l.dal,
      totalAmount: l.castka,
    } satisfies JournalLineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
