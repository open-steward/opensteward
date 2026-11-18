import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface AccountingSeedJournalLineItem {
  Id: string
  AcctSeed__GL_Account__c: string
  AcctSeed__Contact__c: string
  AcctSeed__Project__c: string
  AcctSeed__Debit__c: number
  AcctSeed__Credit__c: number
  AcctSeed__Description__c: string
  [key: string]: unknown
}

export interface AccountingSeedJournal {
  Id: string
  Name: string
  AcctSeed__Description__c: string
  AcctSeed__Reference__c: string
  AcctSeed__Source__c: string
  CurrencyIsoCode: string
  AcctSeed__Tax_Amount__c: number
  AcctSeed__Journal_Entry_Lines__r?: { records: AccountingSeedJournalLineItem[] }
  AcctSeed__Date__c: string
  CreatedDate: string
  LastModifiedDate: string
  [key: string]: unknown
}

function mapLineitem(row: AccountingSeedJournalLineItem): JournalLineitem {
  return {
    id: row.Id,
    accountId: row.AcctSeed__GL_Account__c || undefined,
    contactId: row.AcctSeed__Contact__c || undefined,
    projectId: row.AcctSeed__Project__c || undefined,
    description: row.AcctSeed__Description__c || undefined,
    debitAmount: row.AcctSeed__Debit__c ?? undefined,
    creditAmount: row.AcctSeed__Credit__c ?? undefined,
  }
}

export function transformJournal(raw: AccountingSeedJournal): Journal {
  const lines = raw.AcctSeed__Journal_Entry_Lines__r?.records ?? []
  return {
    id: raw.Id,
    description: raw.AcctSeed__Description__c || undefined,
    reference: raw.AcctSeed__Reference__c || undefined,
    source: raw.AcctSeed__Source__c || undefined,
    currency: raw.CurrencyIsoCode || undefined,
    taxAmount: raw.AcctSeed__Tax_Amount__c ?? undefined,
    lineItems: lines.map(mapLineitem),
    postedAt: raw.AcctSeed__Date__c ? new Date(raw.AcctSeed__Date__c) : undefined,
    createdAt: raw.CreatedDate ? new Date(raw.CreatedDate) : undefined,
    updatedAt: raw.LastModifiedDate ? new Date(raw.LastModifiedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
