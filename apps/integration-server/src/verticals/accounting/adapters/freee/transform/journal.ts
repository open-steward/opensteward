import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface FreeeDealDetail {
  id: number
  amount: number
  account_item_id: number | null
  tax_code: number | null
  [key: string]: unknown
}

export interface FreeeDeal {
  id: number
  issue_date: string
  amount: number
  type: string
  status: string
  account_id: number | null
  partner_id: number | null
  details: FreeeDealDetail[]
  [key: string]: unknown
}

function mapDetail(detail: FreeeDealDetail): JournalLineitem {
  return {
    accountId: detail.account_item_id ? String(detail.account_item_id) : undefined,
    debitAmount: detail.amount > 0 ? detail.amount : undefined,
    creditAmount: detail.amount < 0 ? Math.abs(detail.amount) : undefined,
  }
}

export function transformJournal(raw: FreeeDeal): Journal {
  return {
    id: String(raw.id),
    description: raw.type || undefined,
    lineItems: (raw.details ?? []).map(mapDetail),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
