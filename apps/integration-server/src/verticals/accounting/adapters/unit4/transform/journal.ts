/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface Unit4JournalLine {
  lineId: string | number
  accountCode: string
  description?: string
  debitAmount: number
  creditAmount: number
  costCenterId?: string | number
  [key: string]: unknown
}

export interface Unit4Journal {
  journalId: string | number
  postingDate: string
  description?: string
  companyId?: string | number
  lines: Unit4JournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: Unit4JournalLine): JournalLineitem {
  return {
    id: String(line.lineId),
    accountId: line.accountCode || undefined,
    description: line.description || undefined,
    debitAmount: line.debitAmount || undefined,
    creditAmount: line.creditAmount || undefined,
  }
}

export function transformJournal(raw: Unit4Journal): Journal {
  return {
    id: String(raw.journalId),
    description: raw.description || undefined,
    lineItems: (raw.lines ?? []).map(mapJournalLine),
    postedAt: raw.postingDate ? new Date(raw.postingDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
