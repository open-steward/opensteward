import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'
import { toMinorUnits, toUtcDate , toCalendarDate} from '../../shared/transform'

export interface XeroJournalLine {
  JournalLineID: string
  AccountID: string
  AccountCode: string
  AccountType: string
  Description: string
  GrossAmount: number
  NetAmount: number
  TaxAmount: number
}

export interface XeroJournal {
  JournalID: string
  JournalDate: string
  JournalNumber: number
  Reference: string
  CreatedDateUTC: string
  JournalLines: XeroJournalLine[]
  /** Xero's last-modified instant. A real moment, not a calendar date. */
  UpdatedDateUTC?: string
  [key: string]: unknown
}

function mapJournalLine(line: XeroJournalLine): JournalLineitem {
  return {
    id: line.JournalLineID || undefined,
    accountId: line.AccountID || undefined,
    description: line.Description || undefined,
    debitAmount: toMinorUnits(line.GrossAmount > 0 ? line.GrossAmount : undefined),
    creditAmount: toMinorUnits(line.GrossAmount < 0 ? Math.abs(line.GrossAmount) : undefined),
    taxAmount: toMinorUnits(line.TaxAmount || undefined),
  }
}

export function transformJournal(raw: XeroJournal): Journal {
  return {
    id: raw.JournalID,
    reference: raw.Reference || undefined,
    lineItems: (raw.JournalLines ?? []).map(mapJournalLine),
    postedAt: toCalendarDate(raw.JournalDate),
    createdAt: toUtcDate(raw.CreatedDateUTC),
    // A genuine instant, so NOT routed through toCalendarDate. This is the
    // value `updated_after` filters on, and truncating it to a date would
    // reopen the incremental-sync gap it exists to close.
    updatedAt: toUtcDate(raw.UpdatedDateUTC),
    metadata: raw as Record<string, unknown>,
  }
}
