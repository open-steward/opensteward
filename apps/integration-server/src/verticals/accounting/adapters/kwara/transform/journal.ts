import type { Journal } from '../../../schema/journal'

export interface KwaraJournal {
  id: string
  [key: string]: unknown
}

export function transformJournal(raw: KwaraJournal): Journal {
  return {
    id: raw.id,
    metadata: raw as Record<string, unknown>,
  }
}
