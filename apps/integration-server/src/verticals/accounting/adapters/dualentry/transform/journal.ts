import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'
import { toMinorUnits, toCalendarDate } from '../../shared/transform'

export interface DualentryJournalLine {
  id: number
  account_id: number | null
  account_number: number | null
  customer_id: number | null
  vendor_id: number | null
  description: string | null
  debit: string | null
  credit: string | null
  [key: string]: unknown
}

export interface DualentryJournalEntry {
  id: number
  number: number | null
  date: string | null
  transaction_date: string | null
  memo: string | null
  currency_iso_4217_code: string | null
  amount: string | null
  record_status: string | null
  lines: DualentryJournalLine[]
  [key: string]: unknown
}

function mapLine(line: DualentryJournalLine): JournalLineitem {
  // Resolve contactId with the compound prefix required by getContact():
  //   customer_id → 'cust_<n>', vendor_id → 'vend_<n>'
  // customer_id takes precedence when both are unexpectedly present.
  let contactId: string | undefined
  if (line.customer_id != null) {
    contactId = `cust_${line.customer_id}`
  } else if (line.vendor_id != null) {
    contactId = `vend_${line.vendor_id}`
  }
  return {
    id: String(line.id),
    accountId: line.account_id != null ? String(line.account_id) : undefined,
    contactId,
    description: line.description || undefined,
    debitAmount: toMinorUnits(line.debit),
    creditAmount: toMinorUnits(line.credit),
  }
}

export function transformJournal(raw: DualentryJournalEntry): Journal {
  return {
    id: String(raw.id),
    description: raw.memo || undefined,
    reference: raw.number != null ? String(raw.number) : undefined,
    currency: raw.currency_iso_4217_code || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    memo: journal.description,
    date: toCalendarDate(journal.postedAt),
    currency_iso_4217_code: journal.currency,
    lines: journal.lineItems?.map((li) => {
      // contactId is stored as 'cust_<n>' or 'vend_<n>' — strip prefix to get
      // the raw numeric id for the appropriate upstream field.
      let customer_id: number | undefined
      let vendor_id: number | undefined
      if (li.contactId != null) {
        if (li.contactId.startsWith('cust_')) {
          customer_id = Number(li.contactId.slice(5))
        } else if (li.contactId.startsWith('vend_')) {
          vendor_id = Number(li.contactId.slice(5))
        }
      }
      return {
        account_id: li.accountId != null ? Number(li.accountId) : undefined,
        customer_id,
        vendor_id,
        description: li.description,
        // convert minor-unit amounts back to decimal for the API
        debit: li.debitAmount != null ? li.debitAmount / 100 : undefined,
        credit: li.creditAmount != null ? li.creditAmount / 100 : undefined,
      }
    }),
  }
}
