import type { Journal } from '../../../schema/journal'

// Kora does not expose a journal entries endpoint.
export interface KoraStubJournal {
  [key: string]: unknown
}

export function transformJournal(raw: KoraStubJournal): Journal {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
