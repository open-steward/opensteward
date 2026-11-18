/**
 * Saasu journal → canonical Journal.
 *
 * GET Journals returns `JournalTransactionSummaryResponse { Journals[], _links[] }`
 * of `JournalSummary` — no line items. GET Journal/{id} returns the
 * `JournalDetail` at the top level, with `Items` of `JournalItem`
 * (https://api.saasu.com/Help/Api/GET-Journals,
 * https://api.saasu.com/Help/Api/GET-Journal-id-optionalargs,
 * https://api.saasu.com/Help/ResourceModel?modelName=JournalItem, fetched
 * 2026-09-29):
 *
 *   TransactionId → id, Summary ("Journal summary") → description,
 *   Reference ("Journal reference") → reference, Currency → currency,
 *   TransactionDate → postedAt, CreatedDateUtc / LastModifiedDateUtc
 *   Items[]: Type ("Credit or Debit"), AccountId, Amount ("Amount of journal
 *   item", decimal) → debitAmount or creditAmount in minor units.
 *
 * A list row has no `Items`, so `lineItems` is left unset there rather than
 * reported empty.
 */
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'
import { toCalendarDate, toMinorUnits, toUtcDate } from '../../shared/transform'

export interface SaasuJournalItem {
  /** "Credit or Debit" */
  Type?: string | null
  AccountId?: number | null
  TaxCode?: string | null
  Amount?: number | null
  [key: string]: unknown
}

export interface SaasuJournal {
  TransactionId: number
  TransactionDate?: string | null
  Summary?: string | null
  Currency?: string | null
  Reference?: string | null
  JournalContactId?: number | null
  CreatedDateUtc?: string | null
  LastModifiedDateUtc?: string | null
  /** Detail only. */
  Items?: SaasuJournalItem[] | null
  /** Detail only: "Textual notes set by the user." */
  Notes?: string | null
  [key: string]: unknown
}

function mapJournalItem(item: SaasuJournalItem, currency: string | undefined): JournalLineitem {
  const amount = toMinorUnits(item.Amount, currency)
  return {
    accountId: item.AccountId != null ? String(item.AccountId) : undefined,
    debitAmount: item.Type === 'Debit' ? amount : undefined,
    creditAmount: item.Type === 'Credit' ? amount : undefined,
  }
}

export function transformJournal(raw: SaasuJournal): Journal {
  const currency = raw.Currency || undefined
  return {
    id: String(raw.TransactionId),
    description: raw.Summary || undefined,
    reference: raw.Reference || undefined,
    currency,
    lineItems: Array.isArray(raw.Items)
      ? raw.Items.map((item) => mapJournalItem(item, currency))
      : undefined,
    postedAt: toCalendarDate(raw.TransactionDate),
    createdAt: toUtcDate(raw.CreatedDateUtc),
    updatedAt: toUtcDate(raw.LastModifiedDateUtc),
    metadata: raw as Record<string, unknown>,
  }
}
