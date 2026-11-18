/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface FoundationJournalLine {
  LineId: string | number
  AccountNumber: string
  Description: string
  DebitAmount: number
  CreditAmount: number
  [key: string]: unknown
}

export interface FoundationJournal {
  JournalId: string | number
  JournalDate: string
  Description: string
  JobNumber: string
  Lines: FoundationJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: FoundationJournalLine): JournalLineitem {
  return {
    id: String(line.LineId),
    accountId: line.AccountNumber || undefined,
    description: line.Description || undefined,
    debitAmount: line.DebitAmount || undefined,
    creditAmount: line.CreditAmount || undefined,
  }
}

export function transformJournal(raw: FoundationJournal): Journal {
  return {
    id: String(raw.JournalId),
    description: raw.Description || undefined,
    lineItems: (raw.Lines ?? []).map(mapJournalLine),
    postedAt: raw.JournalDate ? new Date(raw.JournalDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
