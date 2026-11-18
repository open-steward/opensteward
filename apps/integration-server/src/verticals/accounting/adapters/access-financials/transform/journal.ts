/**
 * Access Financials nominal transaction lines → canonical Journal.
 *
 * The Financials API documents nominal transactions as LINES only: "To
 * retrieve detailed information about Nominal transactions, you can use the
 * details field within the allTransactions query", selecting "auditNo
 * nominalType nominalCurrencySymbol batchRef subLedger date headerRef
 * currencySymbol batched exchangeRate origin period yearLabel enteredBy
 * dateEntered detail reconciled reconcileStatus journalType debit
 * currencyDebit credit currencyCredit nominalCode inactive description ..."
 * (https://developer.erp.accessacloud.com/docs/financials/business-entities/transactions/nominal-transactions).
 * `financials.transactions.allTransactions` has no header list in the live
 * schema (only `details`, `detailOptions`, `detailTotals`).
 *
 * A journal is the lines sharing one `auditNo`, the transaction's audit
 * number: the adapter asks for the lines sorted by it (the Queries page
 * recommends "sorting by key fields such as code, name or audit number"),
 * so a journal's lines arrive together. Its id is that `auditNo`, which
 * `getJournal` filters on.
 *
 * Each line's id is its `primaryKey` (`String` in the schema). `accountId`
 * is `nominalPrimaryKey`, the nominal account's primary key, which is the id
 * `listAccounts` gives the account.
 *
 * Money is left out: `debit`/`credit` carry no currency, and no documented
 * field names the home currency (see `./invoice`). The raw lines stay in
 * `metadata.lines`.
 */
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'
import { toCalendarDate } from '../../shared/transform'

/** The documented `NominalTransactionEnquiryDetail` fields this adapter selects. */
export interface AFNominalLine {
  primaryKey?: string | null
  auditNo?: number | null
  headerRef?: string | null
  date?: string | null
  detail?: string | null
  description?: string | null
  journalType?: string | null
  nominalCode?: string | null
  nominalPrimaryKey?: number | null
  debit?: number | null
  credit?: number | null
  currencySymbol?: string | null
  currencyDebit?: number | null
  currencyCredit?: number | null
  batched?: boolean | null
}

function toLine(line: AFNominalLine): JournalLineitem {
  return {
    id: line.primaryKey || undefined,
    accountId: line.nominalPrimaryKey != null ? String(line.nominalPrimaryKey) : undefined,
    description: line.detail || undefined,
  }
}

/**
 * One journal from the lines of one `auditNo`, in the order they arrived.
 * Throws on an empty group or lines from more than one audit number: the
 * caller groups, and a mixed group would merge two transactions.
 */
export function transformJournal(lines: readonly AFNominalLine[]): Journal {
  const first = lines[0]
  if (!first) throw new Error('Access Financials: a journal needs at least one nominal line')
  if (lines.some((l) => l.auditNo !== first.auditNo)) {
    throw new Error('Access Financials: nominal lines from more than one audit number')
  }
  return {
    id: first.auditNo != null ? String(first.auditNo) : undefined,
    reference: first.headerRef || undefined,
    description: first.description || undefined,
    source: first.journalType || undefined,
    lineItems: lines.map(toLine),
    postedAt: toCalendarDate(first.date),
    metadata: { lines: lines.map((l) => ({ ...l })) },
  }
}
