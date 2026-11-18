import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'
import { toMinorUnits, toCalendarDate } from '../../shared/transform'

// ── Built Accounting raw types ────────────────────────────────────────────────
// Docs: GET /api/v3/journals, POST /api/v3/journals

export interface BuiltAfricaJournalEntry {
  id: number
  account_id?: number
  journal_id?: number
  ledger_id?: number
  amount?: number
  fx_rate?: number
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
  account?: {
    id: number
    account_name?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface BuiltAfricaJournal {
  id: number
  user_id?: number
  business_id?: number
  description?: string
  entry_date?: string    // YYYY-MM-DD
  tag?: string
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
  credits?: BuiltAfricaJournalEntry[]
  debits?: BuiltAfricaJournalEntry[]
  [key: string]: unknown
}

// ── Line-item mapping ─────────────────────────────────────────────────────────

function mapDebitEntry(entry: BuiltAfricaJournalEntry): JournalLineitem {
  return {
    id: String(entry.id),
    accountId: entry.account_id !== undefined ? String(entry.account_id) : undefined,
    description: entry.account?.account_name || undefined,
    // Built returns decimal amounts; canonical is integer minor units
    debitAmount: toMinorUnits(entry.amount),
    creditAmount: undefined,
  }
}

function mapCreditEntry(entry: BuiltAfricaJournalEntry): JournalLineitem {
  return {
    id: String(entry.id),
    accountId: entry.account_id !== undefined ? String(entry.account_id) : undefined,
    description: entry.account?.account_name || undefined,
    debitAmount: undefined,
    // Built returns decimal amounts; canonical is integer minor units
    creditAmount: toMinorUnits(entry.amount),
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformJournal(raw: BuiltAfricaJournal): Journal {
  const debitLines = (raw.debits ?? []).map(mapDebitEntry)
  const creditLines = (raw.credits ?? []).map(mapCreditEntry)
  const lineItems: JournalLineitem[] = [...debitLines, ...creditLines]

  return {
    id: String(raw.id),
    description: raw.description || undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    postedAt: raw.entry_date ? new Date(raw.entry_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (canonical → Built request body) ──────────────────────────────

export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  const debits: Array<{ account_id: number; amount: number }> = []
  const credits: Array<{ account_id: number; amount: number }> = []

  // Canonical amounts are integer minor units; Built expects decimal major units
  const toDecimal = (minorUnits: number | null | undefined): number =>
    minorUnits !== undefined && minorUnits !== null ? minorUnits / 100 : 0

  for (const li of journal.lineItems ?? []) {
    const accountId = li.accountId ? Number(li.accountId) : 0
    if (li.debitAmount) debits.push({ account_id: accountId, amount: toDecimal(li.debitAmount) })
    if (li.creditAmount) credits.push({ account_id: accountId, amount: toDecimal(li.creditAmount) })
  }

  return {
    date: toCalendarDate(journal.postedAt),
    description: journal.description,
    debits: debits.length > 0 ? debits : undefined,
    credits: credits.length > 0 ? credits : undefined,
  }
}
