import type { Journal } from '../../../schema/journal'

// Paga does not expose journal entry endpoints.
export interface PagaStubJournal {
  [key: string]: unknown
}

export function transformJournal(raw: PagaStubJournal): Journal {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
