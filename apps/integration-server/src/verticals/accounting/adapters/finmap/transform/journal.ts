import type { Journal } from '../../../schema/journal'

export interface FinmapJournal {
  id: string
  date: string
  reference?: string
  comment?: string
  [key: string]: unknown
}

export function transformJournal(raw: FinmapJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.comment || undefined,
    reference: raw.reference || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
