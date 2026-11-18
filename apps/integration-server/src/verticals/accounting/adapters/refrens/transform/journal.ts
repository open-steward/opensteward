/**
 * Refrens journal transform.
 *
 * Refrens does not expose a journal/ledger endpoint in its public API.
 * This file is present for interface completeness; the adapter does not
 * implement listJournals / getJournal / createJournal.
 */

import type { Journal } from '../../../schema/journal'

// Placeholder shape — no public Refrens journals endpoint is documented.
export interface RefrensJournal {
  _id: string
  description?: string
  [key: string]: unknown
}

export function transformJournal(raw: RefrensJournal): Journal {
  return {
    id: raw._id,
    description: raw.description || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
