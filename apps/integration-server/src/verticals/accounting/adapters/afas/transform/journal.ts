/**
 * AFAS Profit_Journals GetConnector → canonical Journal transform.
 *
 * Fields returned by the Profit_Journals standard GetConnector:
 *   JournalNr       — unique journal / registration number
 *   Description     — journal description / narration
 *   Reference       — external reference (e.g. originating document number)
 *   CurrencyId      — ISO-4217 currency code
 *   AmtTax          — VAT / tax total for the journal
 *   JournalDate     — posting date
 *   Lines           — array of debit/credit line entries (if expanded)
 *
 * Note: the standard Profit_Journals GetConnector returns summary rows;
 * line-level detail requires a separate GetConnector call. The transform
 * carries the summary-level data and leaves lineItems empty when not expanded.
 */
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'
import { toMinorUnits } from '../../shared/transform'

export interface AfasJournalLine {
  AccountNr?: string | null
  Description?: string | null
  DebitAmount?: number | null
  CreditAmount?: number | null
  [key: string]: unknown
}

export interface AfasJournal {
  JournalNr: string
  Description?: string | null
  Reference?: string | null
  CurrencyId?: string | null
  AmtTax?: number | null
  JournalDate?: string | null
  Lines?: AfasJournalLine[]
  [key: string]: unknown
}

function parseDate(raw: string | null | undefined): Date | undefined {
  if (!raw) return undefined
  const d = new Date(raw)
  return isNaN(d.getTime()) ? undefined : d
}

function mapLines(lines: AfasJournalLine[] | undefined): JournalLineitem[] {
  if (!lines?.length) return []
  return lines.map((l) => ({
    accountId: l.AccountNr || undefined,
    description: l.Description || undefined,
    debitAmount: toMinorUnits(l.DebitAmount),
    creditAmount: toMinorUnits(l.CreditAmount),
  }))
}

export function transformJournal(raw: AfasJournal): Journal {
  return {
    id: raw.JournalNr,
    description: raw.Description || undefined,
    reference: raw.Reference || undefined,
    currency: raw.CurrencyId || undefined,
    taxAmount: toMinorUnits(raw.AmtTax),
    lineItems: mapLines(raw.Lines),
    postedAt: parseDate(raw.JournalDate),
    metadata: raw as Record<string, unknown>,
  }
}
