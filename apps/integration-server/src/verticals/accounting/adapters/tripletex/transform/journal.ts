import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface TripletexPostingEntry {
  id: number
  account: { id: number; number: number; name: string }
  description: string
  amountCurrency: number
  currency?: { id: string; code: string }
  date: string
  voucher?: { id: number; voucherNumber: number }
}

export interface TripletexVoucher {
  id: number
  voucherNumber: number
  date: string
  description: string
  postings: TripletexPostingEntry[]
  [key: string]: unknown
}

function mapPosting(entry: TripletexPostingEntry): JournalLineitem {
  const isDebit = entry.amountCurrency > 0
  return {
    id: String(entry.id),
    accountId: entry.account?.number ? String(entry.account.number) : undefined,
    description: entry.description || undefined,
    debitAmount: isDebit ? entry.amountCurrency : undefined,
    creditAmount: !isDebit ? Math.abs(entry.amountCurrency) : undefined,
  }
}

export function transformJournal(raw: TripletexVoucher): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.voucherNumber ? String(raw.voucherNumber) : undefined,
    lineItems: (raw.postings ?? []).map(mapPosting),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
