import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface TiimeJournalLine {
  compte_id: string
  libelle: string
  debit: number
  credit: number
  [key: string]: unknown
}

export interface TiimeJournal {
  id: string
  libelle: string
  reference: string
  date: string
  lignes: TiimeJournalLine[]
  [key: string]: unknown
}

function mapLine(line: TiimeJournalLine): JournalLineitem {
  return {
    accountId: line.compte_id || undefined,
    description: line.libelle || undefined,
    debitAmount: line.debit || undefined,
    creditAmount: line.credit || undefined,
  }
}

export function transformJournal(raw: TiimeJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.libelle || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lignes ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
