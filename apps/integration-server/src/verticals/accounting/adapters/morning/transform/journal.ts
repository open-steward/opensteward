import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface MorningJournalLine {
  accountId?: string
  debit?: number
  credit?: number
  description?: string
  [key: string]: unknown
}

export interface MorningJournal {
  id: string
  date: string
  description?: string
  currency?: string
  lines?: MorningJournalLine[]
  [key: string]: unknown
}

function mapLine(line: MorningJournalLine): JournalLineitem {
  return {
    accountId: line.accountId || undefined,
    debitAmount: line.debit,
    creditAmount: line.credit,
    description: line.description || undefined,
  }
}

export function transformJournal(raw: MorningJournal): Journal {
  return {
    id: raw.id,
    description: raw.description as string | undefined,
    currency: raw.currency || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
