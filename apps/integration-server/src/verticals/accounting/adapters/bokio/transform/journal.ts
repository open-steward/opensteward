/**
 * Bokio `journalEntry` ↔ canonical Journal.
 *
 * Shape: the `journalEntry` schema of GET
 * /companies/{companyId}/journal-entries/{journalEntryId}
 * (https://docs.bokio.se/reference/get-journalentries-journalid.md), also the
 * row of GET /companies/{companyId}/journal-entries
 * (https://docs.bokio.se/reference/get-journalentry.md): id (uuid), title,
 * journalEntryNumber, date (date), items[] { id int64, debit, credit,
 * account int32, tags }, tags, reversingJournalEntryId,
 * reversedByJournalEntryId.
 *
 * `debit`/`credit` are decimal major units. The create example of POST
 * /companies/{companyId}/journal-entries
 * (https://docs.bokio.se/reference/post-journalentry.md) balances 200 debit on
 * 1930 against 40 + 160 credit, and the request body is the same
 * `journalEntry` schema. No currency is documented on a journal entry, so
 * the conversion falls back to two fractional digits.
 */
import { fromMinorUnits, toCalendarDate, toMinorUnits } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface BokioJournalEntryItem {
  id?: number
  debit?: number
  credit?: number
  /** int32 chart-of-accounts number, the same id space as Account.id. */
  account?: number
  [key: string]: unknown
}

export interface BokioJournal {
  id: string
  title?: string
  journalEntryNumber?: string
  date?: string
  items?: BokioJournalEntryItem[]
  reversingJournalEntryId?: string | null
  reversedByJournalEntryId?: string | null
  [key: string]: unknown
}

function mapItem(item: BokioJournalEntryItem): JournalLineitem {
  return {
    id: item.id === undefined || item.id === null ? undefined : String(item.id),
    accountId:
      item.account === undefined || item.account === null ? undefined : String(item.account),
    debitAmount: toMinorUnits(item.debit),
    creditAmount: toMinorUnits(item.credit),
  }
}

export function transformJournal(raw: BokioJournal): Journal {
  return {
    id: raw.id,
    description: raw.title || undefined,
    reference: raw.journalEntryNumber || undefined,
    lineItems: raw.items ? raw.items.map(mapItem) : undefined,
    postedAt: toCalendarDate(raw.date),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Canonical Journal → the POST body. `items` is the only required property;
 * `account` is an int32, so a line whose `accountId` is not a whole number
 * cannot be sent and is rejected rather than posted to the wrong account.
 */
export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  const items = (journal.lineItems ?? []).map((li, i) => {
    const account = Number(li.accountId)
    if (!li.accountId || !Number.isInteger(account)) {
      throw Object.assign(
        new Error(
          `Bokio journal line ${i + 1}: accountId must be a chart-of-accounts number ` +
            `(got ${JSON.stringify(li.accountId)})`,
        ),
        { statusCode: 400, code: 'VALIDATION_ERROR' },
      )
    }
    return {
      account,
      debit: fromMinorUnits(li.debitAmount) ?? 0,
      credit: fromMinorUnits(li.creditAmount) ?? 0,
    }
  })
  return {
    title: journal.description,
    date: toCalendarDate(journal.postedAt),
    items,
  }
}
