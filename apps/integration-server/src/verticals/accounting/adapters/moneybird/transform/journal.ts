import type { Journal } from '../../../schema/journal'

export interface MoneybirdJournal {
  id?: number | string
  description?: string
  date?: string
  [key: string]: unknown
}

export function transformJournal(raw: MoneybirdJournal): Journal {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    description: raw.description || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
