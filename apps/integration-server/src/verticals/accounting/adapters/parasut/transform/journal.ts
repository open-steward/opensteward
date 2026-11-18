import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ParasutJournalLine {
  id?: string
  account_id?: string
  debit?: number
  credit?: number
  description?: string
  [key: string]: unknown
}

export interface ParasutJournal {
  id: string
  type: string
  attributes: {
    description?: string
    date?: string
    reference?: string
    lines?: ParasutJournalLine[]
  }
  [key: string]: unknown
}

export function transformJournal(raw: ParasutJournal): Journal {
  const attrs = raw.attributes ?? {}
  const lineItems: JournalLineitem[] = (attrs.lines ?? []).map((line, idx) => ({
    id: line.id ? String(line.id) : String(idx),
    accountId: line.account_id ? String(line.account_id) : undefined,
    description: line.description || undefined,
    debitAmount: line.debit,
    creditAmount: line.credit,
  }))
  return {
    id: raw.id,
    description: attrs.description || undefined,
    reference: attrs.reference || undefined,
    lineItems: lineItems.length ? lineItems : undefined,
    postedAt: attrs.date ? new Date(attrs.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
