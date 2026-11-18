import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface MyunisoftJournalLine {
  compte_id: string
  libelle: string
  debit: number
  credit: number
  [key: string]: unknown
}

export interface MyunisoftJournal {
  id: string
  libelle: string
  reference: string
  date: string
  lignes: MyunisoftJournalLine[]
  [key: string]: unknown
}

function mapLine(line: MyunisoftJournalLine): JournalLineitem {
  return {
    accountId: line.compte_id || undefined,
    description: line.libelle || undefined,
    debitAmount: line.debit || undefined,
    creditAmount: line.credit || undefined,
  }
}

export function transformJournal(raw: MyunisoftJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.libelle || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lignes ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
