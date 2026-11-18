import type { Journal } from '../../../schema/journal'

export interface TorgsoftJournal {
  id: string
  date: string
  reference?: string
  description?: string
  [key: string]: unknown
}

export function transformJournal(raw: TorgsoftJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
