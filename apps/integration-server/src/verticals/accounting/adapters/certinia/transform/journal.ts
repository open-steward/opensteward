import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface CertiniaJournalLine {
  Id: string
  Account_Code__c: string
  Description__c: string
  Debit__c: number
  Credit__c: number
  [key: string]: unknown
}

export interface CertiniaJournal {
  Id: string
  Name: string
  Journal_Date__c: string
  Description__c: string
  Lines__r: { records: CertiniaJournalLine[] } | null
  [key: string]: unknown
}

function mapJournalLine(line: CertiniaJournalLine): JournalLineitem {
  return {
    id: String(line.Id),
    accountId: line.Account_Code__c || undefined,
    description: line.Description__c || undefined,
    debitAmount: line.Debit__c || undefined,
    creditAmount: line.Credit__c || undefined,
  }
}

export function transformJournal(raw: CertiniaJournal): Journal {
  const lines = raw.Lines__r?.records ?? []
  return {
    id: String(raw.Id),
    description: raw.Description__c || undefined,
    lineItems: lines.map(mapJournalLine),
    postedAt: raw.Journal_Date__c ? new Date(raw.Journal_Date__c) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
