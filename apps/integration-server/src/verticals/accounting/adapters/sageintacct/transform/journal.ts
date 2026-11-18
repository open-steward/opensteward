import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface IntacctJournalLine {
  ACCOUNTNO: string
  AMOUNT: string
  TR_TYPE: '1' | '-1'
  MEMO: string
}

export interface IntacctJournal {
  RECORDNO: string
  JOURNAL: string
  BATCH_DATE: string
  DESCRIPTION: string
  ENTRIES: { GLENTRY: IntacctJournalLine[] }
  [key: string]: unknown
}

function mapLine(line: IntacctJournalLine): JournalLineitem {
  const amount = parseFloat(line.AMOUNT)
  return {
    accountId: line.ACCOUNTNO || undefined,
    description: line.MEMO || undefined,
    debitAmount: line.TR_TYPE === '1' ? amount : undefined,
    creditAmount: line.TR_TYPE === '-1' ? amount : undefined,
  }
}

export function transformJournal(raw: IntacctJournal): Journal {
  const lines = raw.ENTRIES?.GLENTRY ?? []
  return {
    id: raw.RECORDNO,
    description: raw.DESCRIPTION || undefined,
    reference: raw.JOURNAL || undefined,
    lineItems: lines.map(mapLine),
    postedAt: raw.BATCH_DATE ? new Date(raw.BATCH_DATE) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
