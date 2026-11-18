import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface EcountJournalItem {
  SEQ?: number
  ACCOUNT_CODE?: string
  ACCOUNT_NAME?: string
  DR_AMT?: number
  CR_AMT?: number
  REMARK?: string
  [key: string]: unknown
}

export interface EcountJournal {
  SLIP_NO: string
  SLIP_DATE?: string
  REMARK?: string
  ITEM_LIST?: EcountJournalItem[]
  [key: string]: unknown
}

function mapLineitem(item: EcountJournalItem): JournalLineitem {
  return {
    accountId: item.ACCOUNT_CODE || undefined,
    description: item.REMARK || item.ACCOUNT_NAME || undefined,
    debitAmount: item.DR_AMT || undefined,
    creditAmount: item.CR_AMT || undefined,
  }
}

export function transformJournal(raw: EcountJournal): Journal {
  return {
    id: raw.SLIP_NO,
    description: raw.REMARK || undefined,
    reference: raw.SLIP_NO,
    lineItems: (raw.ITEM_LIST ?? []).map(mapLineitem),
    postedAt: raw.SLIP_DATE ? new Date(raw.SLIP_DATE) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
