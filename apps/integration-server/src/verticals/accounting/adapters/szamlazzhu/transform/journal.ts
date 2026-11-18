/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Primary API is XML-based; REST API availability unconfirmed.
 */

import type { Journal } from '../../../schema/journal'

export interface SzamlazzhuJournal {
  id: string | number
  date?: string
  reference?: string
  description?: string
  debit?: number
  credit?: number
  [key: string]: unknown
}

export function transformJournal(raw: SzamlazzhuJournal): Journal {
  return {
    id: String(raw.id),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    reference: raw.reference || undefined,
    description: raw.description || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
