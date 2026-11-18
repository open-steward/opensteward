import type { Journal } from '../../../schema/journal'

// Sila does not expose journal entry endpoints.
export interface SilaStubJournal {
  [key: string]: unknown
}

export function transformJournal(raw: SilaStubJournal): Journal {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
