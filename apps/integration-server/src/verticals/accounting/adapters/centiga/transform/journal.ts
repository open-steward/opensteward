import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'
import { nonempty } from '../../shared/transform'

export interface CentigaJournalLine {
  id: string
  account_id?: string
  description?: string
  debit?: number
  credit?: number
  [key: string]: unknown
}

export interface CentigaJournal {
  id: string
  description?: string
  date?: string
  lines?: CentigaJournalLine[]
  [key: string]: unknown
}

function mapLine(line: CentigaJournalLine): JournalLineitem {
  return {
    id: line.id,
    accountId: line.account_id || undefined,
    description: line.description || undefined,
    debitAmount: line.debit || undefined,
    creditAmount: line.credit || undefined,
  }
}

export function transformJournal(raw: CentigaJournal): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    lineItems: nonempty((raw.lines ?? []).map(mapLine)),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
