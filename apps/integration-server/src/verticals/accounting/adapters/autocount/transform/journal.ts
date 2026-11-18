import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface AutocountJournalDetail {
  Seq: number
  AccNo: string
  Description: string
  DrAmt: number
  CrAmt: number
  CurrencyCode: string
  [key: string]: unknown
}

export interface AutocountJournal {
  DocNo: string
  DocDate: string
  Description: string
  Cancelled: boolean
  JournalDetails: AutocountJournalDetail[]
  [key: string]: unknown
}

function mapJournalDetail(detail: AutocountJournalDetail): JournalLineitem {
  return {
    id: String(detail.Seq),
    accountId: detail.AccNo || undefined,
    description: detail.Description || undefined,
    debitAmount: detail.DrAmt || undefined,
    creditAmount: detail.CrAmt || undefined,
  }
}

export function transformJournal(raw: AutocountJournal): Journal {
  return {
    id: raw.DocNo,
    description: raw.Description || undefined,
    reference: raw.DocNo,
    lineItems: (raw.JournalDetails ?? []).map(mapJournalDetail),
    postedAt: raw.DocDate ? new Date(raw.DocDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
