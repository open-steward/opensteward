/**
 * eGestor does not expose a journal / ledger entries endpoint in its public
 * REST API. This file is intentionally minimal — the EgestorAdapter does not
 * implement listJournals / getJournal, so these helpers are not used at
 * runtime. They remain to satisfy the transform directory convention.
 */
import type { Journal } from '../../../schema/journal'

export interface EgestorJournalStub {
  [key: string]: unknown
}

export function transformJournal(_raw: EgestorJournalStub): Journal {
  return { metadata: _raw as Record<string, unknown> }
}
